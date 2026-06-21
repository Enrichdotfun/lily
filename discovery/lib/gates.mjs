// ---------------------------------------------------------------------------
// Quality gates for the BONDED feed. Transparent on-chain heuristics for "did
// this graduate launch fairly, or is it an obvious rug/farm?". Defaults are
// reasonable starting points, not tuned edges — verify on your own data.
//
// (The new-pairs / pre-bond gate is intentionally not part of this public repo.)
// ---------------------------------------------------------------------------

export const THRESHOLDS = {
  MIN_LAUNCH_TXNS: 50,        // a bonded coin with fewer lifetime txns than this was likely forced/bundled
  CREATOR_RETENTION_PCT: 10,  // creator still holding >= this % of supply => rug risk
  WHALE_FLOAT_PCT: 15,        // a single non-pool wallet holding >= this % => whale-float risk
  EARLY_DUMP_RET_PCT: -30,    // first-minute return <= this ...
  EARLY_DUMP_NET_SOL: -5,     // ... AND first-minute net flow <= this => early dump
  CRATER_DIP_PCT: -85,        // drawn down >= this far from ATH => dead/crater, hide it
};

/** Holder verdict from on-chain holders. Returns a reason or null. */
export function holderVerdict({ creatorPct, holderTop1 }) {
  const T = THRESHOLDS;
  if (typeof creatorPct === 'number' && creatorPct >= T.CREATOR_RETENTION_PCT) return 'creator-retention';
  if (typeof holderTop1 === 'number' && holderTop1 >= T.WHALE_FLOAT_PCT) return 'whale-float';
  return null;
}

/** First-minute strength check for a freshly bonded coin. */
export function earlyDumpVerdict({ earlyReturnPct, earlyNetSol }) {
  const T = THRESHOLDS;
  if (
    typeof earlyReturnPct === 'number' && earlyReturnPct <= T.EARLY_DUMP_RET_PCT &&
    typeof earlyNetSol === 'number' && earlyNetSol <= T.EARLY_DUMP_NET_SOL
  ) return 'early-dump';
  return null;
}

export function isCratered(dipPct) {
  return typeof dipPct === 'number' && dipPct <= THRESHOLDS.CRATER_DIP_PCT;
}
