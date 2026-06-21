// ---------------------------------------------------------------------------
// WATCHDOG — 24/7 independent safety verifier
//
// Re-checks EVERY coin currently surfaced as TRADABLE (new + bonded), one by one,
// to make sure nothing unsafe has leaked through -- or turned bad AFTER being
// cleared (e.g. the creator dumps, a whale accumulates, the coin craters). For
// each tradable coin it independently re-fetches mcap and re-mines holders, then
// re-applies the gates. Anything that now trips a gate is QUARANTINED.
//
// The API server reads the quarantine list and force-hides those coins, so a
// leak is pulled out of Tradable within seconds. State is written to
// data/watchdog.json and exposed at GET /api/watchdog.
// ---------------------------------------------------------------------------
import { config } from './lib/config.mjs';
import { makeRpc, mineHolders } from './lib/rpc.mjs';
import { holderVerdict, isCratered } from './lib/gates.mjs';
import { getCoin } from './lib/pumpfun.mjs';
import { writeSnapshot } from './lib/store.mjs';
import { getCoins } from './lib/db.mjs';

const W = config.watchdog;
const rpc = makeRpc(config.rpcUrl);
const lastChecked = new Map(); // mint -> ts of last verification
const quarantine = new Map();  // mint -> { reason, at, feed, ... }
let verified = 0;

/** Coins the UI shows as Tradable for a feed. */
function tradableOf(feed) {
  const trackMs = (feed === 'new' ? config.newPairs : config.bonded).trackMs;
  const coins = getCoins(feed, trackMs) || [];
  return coins.filter((c) => {
    if (!c.checked || c.hidden) return false;
    if (feed === 'new' && (c.marketCapUsd ?? 0) < W.tradableMinMcUsd) return false;
    return true;
  });
}

/** Independently re-verify one tradable coin. Returns a leak reason or null. */
async function verify(c, feed) {
  lastChecked.set(c.mint, Date.now());
  verified++;
  const meta = await getCoin(c.mint).catch(() => null);
  const mcUsd = meta?.marketCapUsd ?? c.marketCapUsd ?? null;
  const holders = await mineHolders(rpc, c.mint, meta?.creator).catch(() => ({}));
  const top1 = holders.holderTop1 ?? c.holderTop1 ?? null;
  const creatorPct = holders.creatorPct ?? c.creatorPct ?? null;

  let reason = holderVerdict({ creatorPct, holderTop1: top1 });           // turned into a rug
  if (!reason && isCratered(c.dipPct)) reason = 'crater';                  // died after clearing
  if (!reason && feed === 'new' && mcUsd != null && mcUsd < W.tradableMinMcUsd) reason = 'under-min-mcap';

  if (reason) {
    if (!quarantine.has(c.mint)) {
      console.log(`[watchdog] LEAK ${feed} ${c.symbol || c.mint.slice(0, 8)} -> ${reason} (top1=${top1} dev=${creatorPct} mc=${mcUsd})`);
    }
    quarantine.set(c.mint, { reason, at: Date.now(), feed, symbol: c.symbol ?? null, top1, creatorPct, mcUsd });
  } else {
    quarantine.delete(c.mint); // re-verified clean
  }
  return reason;
}

async function tick() {
  const now = Date.now();
  const tradable = [
    ...tradableOf('new').map((c) => [c, 'new']),
    ...tradableOf('bonded').map((c) => [c, 'bonded']),
  ];
  // Re-verify each tradable coin at most once per recheckMs; cap per tick for RPC budget.
  const due = tradable
    .filter(([c]) => now - (lastChecked.get(c.mint) || 0) > W.recheckMs)
    .slice(0, W.perTick);
  for (const [c, feed] of due) { try { await verify(c, feed); } catch { /* keep going */ } }

  // Forget quarantine + lastChecked for coins no longer surfaced.
  const live = new Set(tradable.map(([c]) => c.mint));
  for (const m of [...quarantine.keys()]) if (!live.has(m)) quarantine.delete(m);
  for (const m of [...lastChecked.keys()]) if (!live.has(m)) lastChecked.delete(m);

  writeSnapshot('watchdog.json', {
    lastRun: now,
    tradableCount: tradable.length,
    verifiedTotal: verified,
    leakCount: quarantine.size,
    leaks: [...quarantine.entries()].map(([mint, v]) => ({ mint, ...v })),
    quarantine: [...quarantine.keys()],
  });
}

console.log(`[watchdog] re-verifying tradable coins every ${W.tickMs / 1000}s (recheck/coin ${W.recheckMs / 1000}s)`);
tick();
setInterval(tick, W.tickMs);
