// Solana on-chain helpers used by the gates. All read-only.
//
// We use a tiny raw JSON-RPC client for the token calls because pump.fun now
// mints under Token-2022, and @solana/web3.js's getTokenLargestAccounts rejects
// Token-2022 mints ("not a Token mint"). Raw JSON-RPC handles both programs.
// (Signature history still goes through web3.js's Connection, which is fine.)
import { Connection, PublicKey } from '@solana/web3.js';
import { PROGRAMS, POOL_OWNERS } from './config.mjs';
import { tick } from './metrics.mjs';

export function makeRpc(url) {
  return { url, conn: new Connection(url, { commitment: 'confirmed' }) };
}

async function rpcCall(url, method, params) {
  tick();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

/** Derive a pump.fun bonding-curve PDA for a mint. */
export function bondingCurvePda(mint) {
  try {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), new PublicKey(mint).toBuffer()],
      new PublicKey(PROGRAMS.PUMP_FUN),
    );
    return pda;
  } catch {
    return null;
  }
}

/** Count recent confirmed signatures touching `address` within the trailing window. */
export async function countRecentSignatures(rpc, address, windowMs) {
  if (!address) return 0;
  const cutoff = Math.floor((Date.now() - windowMs) / 1000);
  let count = 0;
  let before;
  for (let page = 0; page < 5; page++) {
    tick();
    const sigs = await rpc.conn.getSignaturesForAddress(new PublicKey(address), { limit: 1000, before });
    if (!sigs.length) break;
    for (const s of sigs) if (s.blockTime && s.blockTime >= cutoff) count++;
    const last = sigs[sigs.length - 1];
    if (!last.blockTime || last.blockTime < cutoff) break;
    before = last.signature;
  }
  return count;
}

/** Total opening-tx count + slot clustering of the first N txns (bundle signal). */
export async function launchTxnStats(rpc, address, launchWindow = 20) {
  if (!address) return { count: 0, capped: false, firstSlots: [], maxPerSlot: 0, distinctSlots: 0 };
  let all = [];
  let before;
  let capped = false;
  for (let page = 0; page < 10; page++) {
    tick();
    const sigs = await rpc.conn.getSignaturesForAddress(new PublicKey(address), { limit: 1000, before });
    if (!sigs.length) break;
    all = all.concat(sigs);
    if (sigs.length < 1000) break;
    before = sigs[sigs.length - 1].signature;
    if (page === 9) capped = true;
  }
  const oldestFirst = all.reverse();
  const opening = oldestFirst.slice(0, launchWindow);
  const slots = opening.map((s) => s.slot).filter((x) => x != null);
  const bySlot = new Map();
  for (const sl of slots) bySlot.set(sl, (bySlot.get(sl) || 0) + 1);
  const maxPerSlot = bySlot.size ? Math.max(...bySlot.values()) : 0;
  return { count: all.length, capped, firstSlots: slots, distinctSlots: bySlot.size, maxPerSlot };
}

/**
 * Holder concentration via raw JSON-RPC (SPL + Token-2022 safe). Returns top-1
 * and top-10 holder share and the creator's retained share, all as % of supply,
 * with pool/curve/AMM accounts excluded.
 */
export async function mineHolders(rpc, mint, creator) {
  // 'confirmed' (not the RPC default of 'finalized') so freshly-created mints
  // resolve within a few seconds instead of ~13s+.
  const C = { commitment: 'confirmed' };
  const supplyResp = await rpcCall(rpc.url, 'getTokenSupply', [mint, C]);
  const supply = Number(supplyResp?.value?.amount || 0);
  if (!supply) return { holderTop1: null, holderTop10: null, creatorPct: null, holders: [] };

  const largest = await rpcCall(rpc.url, 'getTokenLargestAccounts', [mint, C]);
  const accounts = largest?.value || [];
  if (!accounts.length) return { holderTop1: 0, holderTop10: 0, creatorPct: creator ? 0 : null, holders: [] };

  // 1) resolve each top token-account's authority (its "owner" field)
  const infos = await rpcCall(rpc.url, 'getMultipleAccounts', [
    accounts.map((a) => a.address),
    { encoding: 'jsonParsed', commitment: 'confirmed' },
  ]);
  const owners = (infos?.value || []).map((v) => v?.data?.parsed?.info?.owner || null);

  // 2) classify each authority: a holder is a POOL (bonding curve / AMM) if its
  //    authority account is itself OWNED BY a pool program. Look those up in one
  //    batched call. (A normal wallet is owned by the System Program.)
  const distinct = [...new Set(owners.filter(Boolean))];
  let programByOwner = {};
  if (distinct.length) {
    const ownerInfos = await rpcCall(rpc.url, 'getMultipleAccounts', [
      distinct,
      { encoding: 'base64', commitment: 'confirmed' },
    ]);
    (ownerInfos?.value || []).forEach((v, i) => { programByOwner[distinct[i]] = v?.owner || null; });
  }
  const curvePda = bondingCurvePda(mint)?.toBase58();
  const isPool = (owner) => owner && (owner === curvePda || POOL_OWNERS.has(programByOwner[owner]));

  let creatorAmount = 0;
  const holders = [];
  for (let i = 0; i < accounts.length; i++) {
    const amt = Number(accounts[i].amount || 0);
    const owner = owners[i];
    if (isPool(owner)) continue; // skip pools/curve/AMM
    const pct = (amt / supply) * 100;
    holders.push({ owner, pct });
    if (creator && owner === creator) creatorAmount += amt;
  }
  holders.sort((a, b) => b.pct - a.pct);
  const holderTop1 = holders.length ? holders[0].pct : 0;
  const holderTop10 = holders.slice(0, 10).reduce((s, h) => s + h.pct, 0);
  const creatorPct = creator ? (creatorAmount / supply) * 100 : null;
  return { holderTop1, holderTop10, creatorPct, holders };
}
