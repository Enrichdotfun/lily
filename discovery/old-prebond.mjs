// ---------------------------------------------------------------------------
// OLD PRE-BOND scanner
//
// Idea: most pump.fun coins die young. Occasionally an OLDER coin that never
// bonded suddenly starts taking fresh bids again — a "reawakening". This daemon
// finds those: coins created a while ago, still un-bonded, that have logged a
// burst of recent on-chain activity. It surfaces them into the board.
//
// Activity is measured with a key-less RPC probe (recent signatures on the
// bonding-curve account), so no private trade-history credentials are needed.
// ---------------------------------------------------------------------------
import { config } from './lib/config.mjs';
import { makeRpc, bondingCurvePda, countRecentSignatures } from './lib/rpc.mjs';
import { listRecentlyTraded } from './lib/pumpfun.mjs';
import { writeSnapshot } from './lib/store.mjs';
import { load } from './lib/metrics.mjs';
import { persist } from './lib/db.mjs';

const O = config.old;
const rpc = makeRpc(config.rpcUrl);

/** mint -> surfaced coin row */
const board = new Map();
let lastScanAt = 0;
let lastError = null;

function flush() {
  const now = Date.now();
  const coins = [...board.values()]
    .filter((c) => now - c.lastTradeAt <= O.activeMs * 2) // drop ones that went quiet
    .sort((a, b) => b.lastTradeAt - a.lastTradeAt);
  const scanner = {
    lastScanAt, intervalMs: O.scanIntervalMs, minAgeMs: O.minAgeMs,
    activeMs: O.activeMs, minRecentTrades: O.minRecentTrades, lastError,
  };
  writeSnapshot('old.json', { updatedAt: now, api: load(), scanner, coins });
  persist('old', coins, { updatedAt: now, api: load(), scanner });
}

async function scan() {
  lastScanAt = Date.now();
  const now = lastScanAt;
  let listed;
  try {
    listed = await listRecentlyTraded(150);
    lastError = null;
  } catch (e) {
    lastError = String(e.message || e);
    flush();
    return;
  }

  // Cheap filters first: old enough, still un-bonded, and traded very recently.
  const candidates = listed.filter((c) =>
    !c.bonded &&
    c.createdAt && now - c.createdAt >= O.minAgeMs &&
    c.lastTradeAt && now - c.lastTradeAt <= O.activeMs,
  );

  let probed = 0;
  for (const c of candidates) {
    if (probed >= O.maxPerScan) break;
    probed++;
    let recentTrades = 0;
    try {
      recentTrades = await countRecentSignatures(rpc, bondingCurvePda(c.mint), O.activeMs);
    } catch {
      continue;
    }
    if (recentTrades < O.minRecentTrades) {
      board.delete(c.mint); // no longer hot
      continue;
    }
    board.set(c.mint, {
      mint: c.mint,
      name: c.name,
      symbol: c.symbol,
      image: c.image,
      createdAt: c.createdAt,
      ageMs: now - c.createdAt,
      lastTradeAt: c.lastTradeAt,
      marketCapSol: c.marketCapSol,
      marketCapUsd: c.marketCapUsd,
      recentTrades,
      activitySource: 'rpc-signatures',
      surfacedAt: board.get(c.mint)?.surfacedAt || now,
      scannedAt: now,
    });
  }
  flush();
}

console.log('[old-prebond] scanning every', O.scanIntervalMs / 1000, 's — RPC:', config.rpcUrl);
flush();
scan();
setInterval(scan, O.scanIntervalMs);
