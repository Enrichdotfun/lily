// ---------------------------------------------------------------------------
// BONDED (postbond) discovery + gate
//
// Streams pump.fun migrations (coins that "bond" / graduate to an AMM), then
// tracks each one's market cap, all-time-high and drawdown live off the trade
// tape. It applies four gates and hides anything that trips one:
//
//   bundle      — too few opening txns (forced/bundled launch)
//   holder-rug  — whale-float or creator-retention from on-chain holders
//   early-dump  — first-minute return AND net flow both deeply negative
//   crater      — drawn down past the crater threshold (dead coin)
//
// Clean survivors are surfaced with live mcap / dip% / age so you can watch a
// fresh graduate without manually filtering out the obvious rugs.
// ---------------------------------------------------------------------------
import { config } from './lib/config.mjs';
import { PumpPortal } from './lib/pumpportal.mjs';
import { makeRpc, bondingCurvePda, launchTxnStats, mineHolders } from './lib/rpc.mjs';
import { holderVerdict, earlyDumpVerdict, isCratered, THRESHOLDS } from './lib/gates.mjs';
import { getCoin } from './lib/pumpfun.mjs';
import { writeSnapshot } from './lib/store.mjs';
import { load } from './lib/metrics.mjs';
import { persist } from './lib/db.mjs';

const B = config.bonded;
const rpc = makeRpc(config.rpcUrl);
const board = new Map();
let stats = { messages: 0, bondsSeen: 0 };
let wsState = 'connecting';

function hideReason(c) {
  if (c.bundled) return 'bundle';
  if (c.rugFake) return c.rugReason || 'holder-rug';
  if (c.earlyDumped) return 'early-dump';
  if (isCratered(c.dipPct)) return 'crater';
  return null;
}

function flush() {
  const now = Date.now();
  for (const [mint, c] of board) {
    if (now - c.bondedAt > B.trackMs) { board.delete(mint); portal.unwatchTrades(mint); }
  }
  const rows = [...board.values()].map((c) => {
    const hr = hideReason(c);
    return {
      mint: c.mint,
      name: c.name,
      symbol: c.symbol,
      bondedAt: c.bondedAt,
      ageMs: now - c.bondedAt,
      trades: c.trades,
      volumeSol: c.volumeSol,
      athMcapSol: c.athLevel,
      lastMcapSol: c.lastLevel,
      marketCapSol: c.lastLevel,
      marketCapUsd: c.marketCapUsd ?? null,
      dipPct: c.dipPct,
      maxDipPct: c.maxDipPct,
      reached: c.reached,
      launchTxns: c.launchTxns,
      checked: c.checked,
      bundled: c.bundled,
      rugFake: c.rugFake,
      rugReason: c.rugReason,
      earlyDumped: c.earlyDumped,
      holderTop1: c.holderTop1,
      holderTop10: c.holderTop10,
      creatorPct: c.creatorPct,
      hidden: hr != null,
      hideReason: hr,
    };
  });
  const blocked = rows.filter((r) => r.hidden).length;
  const sorted = rows.sort((a, b) => b.bondedAt - a.bondedAt);
  const meta = {
    updatedAt: now, ws: wsState, api: load(), thresholds: THRESHOLDS,
    stats: { ...stats, tracking: board.size, blocked, surfaced: rows.length - blocked },
  };
  writeSnapshot('bonded.json', { ...meta, coins: sorted });
  persist('bonded', sorted, meta);
}

async function gateCoin(c) {
  if (c.gating) return;
  c.gating = true;
  c.lastGate = Date.now();
  try {
    const meta = await getCoin(c.mint).catch(() => null);
    c.name = c.name || meta?.name || null;
    c.symbol = c.symbol || meta?.symbol || null;
    applyMcap(c, meta); // post-bond trades don't stream, so mcap comes from the API
    const pda = bondingCurvePda(c.mint);
    const launch = await launchTxnStats(rpc, pda, 20).catch(() => null);
    if (launch) {
      c.launchTxns = launch.count;
      if (!launch.capped && launch.count < THRESHOLDS.MIN_LAUNCH_TXNS) {
        c.bundled = true; c.bundleReason = 'few-launch-txns';
      }
    }
    const holders = await mineHolders(rpc, c.mint, meta?.creator).catch(() => ({}));
    c.holderTop1 = holders.holderTop1 ?? null;
    c.holderTop10 = holders.holderTop10 ?? null;
    c.creatorPct = holders.creatorPct ?? null;
    const hv = holderVerdict({ creatorPct: c.creatorPct, holderTop1: c.holderTop1 });
    if (hv) { c.rugFake = true; c.rugReason = hv; }
  } catch { /* leave flags as-is */ }
  finally {
    c.gating = false;
    // "checked" once the holder gate actually returned data (the key rug signal).
    // Until then a coin is NOT eligible for the Tradable tab.
    c.checked = c.holderTop1 != null;
  }
  flush();
}

// Post-migration trades don't come through subscribeTokenTrade, so the live trade
// tape (onTrade) is usually empty for bonded coins. Pull mcap/dip from the pump.fun
// API instead — getCoin exposes both market_cap (SOL) and usd_market_cap.
function applyMcap(c, meta) {
  c.mcapAt = Date.now();
  if (!meta) return;
  if (meta.marketCapUsd != null) c.marketCapUsd = meta.marketCapUsd;
  const level = meta.marketCapSol;
  if (level == null) return;
  if (c.firstLevel == null) c.firstLevel = level;
  if (c.athLevel == null || level > c.athLevel) c.athLevel = level;
  c.lastLevel = level;
  if (c.athLevel) {
    c.dipPct = (level / c.athLevel - 1) * 100;
    if (c.dipPct < c.maxDipPct) c.maxDipPct = c.dipPct;
  }
}

async function refreshMcap(c) {
  c.mcapAt = Date.now();
  applyMcap(c, await getCoin(c.mint).catch(() => null));
}

function onTrade(c, m) {
  const level = m.marketCapSol;
  if (level == null) return;
  c.trades++;
  c.lastTradeAt = Date.now();
  c.volumeSol += m.solAmount || 0;
  if (c.firstLevel == null) c.firstLevel = level;
  if (c.athLevel == null || level > c.athLevel) c.athLevel = level;
  c.lastLevel = level;
  c.dipPct = c.athLevel ? (level / c.athLevel - 1) * 100 : 0;
  if (c.dipPct < c.maxDipPct) c.maxDipPct = c.dipPct;
  if (c.dipPct <= -30) c.reached.d30 = true;
  if (c.dipPct <= -40) c.reached.d40 = true;
  if (c.dipPct <= -60) c.reached.d60 = true;

  // early-window strength: net flow + return over the first minute after bond
  if (!c.earlyClosed) {
    c.earlyNet += (m.txType === 'buy' ? (m.solAmount || 0) : -(m.solAmount || 0));
    c.earlyEndLevel = level;
    if (Date.now() - c.bondedAt >= B.earlyWindowMs) {
      c.earlyClosed = true;
      const ret = c.firstLevel ? (c.earlyEndLevel / c.firstLevel - 1) * 100 : 0;
      if (earlyDumpVerdict({ earlyReturnPct: ret, earlyNetSol: c.earlyNet })) {
        c.earlyDumped = true;
        c.earlyReturnPct = ret;
      }
    }
  }
}

const portal = new PumpPortal({
  url: config.wsUrl,
  migration: true,
  onState: (s) => { wsState = s; },
  onMessage: (m) => {
    stats.messages++;
    const mint = m.mint;
    if (!mint) return;

    // A migration event marks a bond. PumpPortal flags it via txType 'migrate'
    // (older payloads used a 'pool' field); accept either.
    const isMigration = m.txType === 'migrate' || m.pool || m.txType === 'migration';
    if (isMigration && !board.has(mint)) {
      stats.bondsSeen++;
      const c = {
        mint, name: m.name ?? null, symbol: m.symbol ?? null,
        bondedAt: Date.now(), lastTradeAt: Date.now(), trades: 0, volumeSol: 0,
        firstLevel: null, athLevel: null, lastLevel: null,
        dipPct: 0, maxDipPct: 0, reached: { d30: false, d40: false, d60: false },
        launchTxns: null, bundled: false, rugFake: false, rugReason: null,
        holderTop1: null, creatorPct: null,
        checked: false, gating: false, lastGate: 0,
        earlyClosed: false, earlyNet: 0, earlyEndLevel: null, earlyDumped: false,
      };
      board.set(mint, c);
      portal.watchTrades(mint);
      gateCoin(c);
      return;
    }

    if (m.txType === 'buy' || m.txType === 'sell') {
      const c = board.get(mint);
      if (c) onTrade(c, m);
    }
  },
});

console.log('[bonded] streaming migrations from', config.wsUrl);
portal.start();
flush();
setInterval(flush, 4000);

// Retry the gate for any coin that hasn't resolved yet (fresh AMM pools can take
// a bit to be indexable), so coins don't sit unchecked forever.
setInterval(() => {
  const now = Date.now();
  for (const c of board.values()) {
    if (!c.checked && !c.gating && now - (c.lastGate || 0) > 15000) gateCoin(c);
  }
}, 8000);

// Keep live mcap/dip current for surfaced coins (gate retry above only covers
// unchecked ones). Skip blocked coins — no need to track them live.
setInterval(() => {
  const now = Date.now();
  for (const c of board.values()) {
    if (c.checked && !c.gating && hideReason(c) == null && now - (c.mcapAt || 0) > 30000) refreshMcap(c);
  }
}, 10000);
