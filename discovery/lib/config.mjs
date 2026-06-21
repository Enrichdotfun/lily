// Centralised, env-driven configuration. Everything here is a tunable heuristic
// with a documented default — nothing secret. Override via a local `.env`.
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Minimal, dependency-free .env loader: reads <repo>/.env if present and fills in
// any vars not already set in the environment. (No-op when the file is absent.)
(function loadDotEnv() {
  try {
    const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
    const text = fs.readFileSync(envPath, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch { /* no .env — use defaults / real env */ }
})();

function num(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function str(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

export const config = {
  rpcUrl: str('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'),
  wsUrl: str('PUMPPORTAL_WS_URL', 'wss://pumpportal.fun/api/data'),
  port: num('PORT', 8787),

  // Persistence (SQLite) — durable current state + rolling history.
  dbPath: str('DB_PATH', 'data/lily.db'),
  historyIntervalMs: num('HISTORY_INTERVAL_MS', 60_000),
  historyRetentionMs: num('HISTORY_RETENTION_MS', 48 * 60 * 60 * 1000),

  // Public API controls (all optional).
  apiKeys: str('LILY_API_KEYS', ''),         // comma-list; if empty the API is open
  rateLimitPerMin: num('RATE_LIMIT_PER_MIN', 240),

  // Old pre-bond scanner
  old: {
    scanIntervalMs: num('OLD_SCAN_INTERVAL_MS', 60_000),
    minAgeMs: num('OLD_MIN_AGE_MS', 7 * 60 * 60 * 1000),
    activeMs: num('OLD_ACTIVE_MS', 60 * 60 * 1000),
    minRecentTrades: num('OLD_MIN_RECENT_TRADES', 5),
    maxPerScan: num('OLD_MAX_PER_SCAN', 12),
  },

  // Bonded (postbond)
  bonded: {
    trackMs: num('BONDED_TRACK_MS', 60 * 60 * 1000),
    earlyWindowMs: num('BONDED_EARLY_WINDOW_MS', 60_000),
  },

  // New pairs (pre-bond). Unchecked is the UNFILTERED firehose (every launch);
  // the same gates as bonded then split them into Blocked / Tradable. Gating is
  // the only RPC cost, so it's rate-limited (gatePerTick) and prioritises mcap.
  newPairs: {
    trackMs: num('NEWPAIRS_TRACK_MS', 30 * 60 * 1000),
    earlyWindowMs: num('NEWPAIRS_EARLY_WINDOW_MS', 60_000),
    settleMs: num('NEWPAIRS_SETTLE_MS', 10_000),    // let a fresh launch index before gating
    maxWatch: num('NEWPAIRS_MAX_WATCH', 300),       // rolling cap on tracked launches (newest win)
    gatePerTick: num('NEWPAIRS_GATE_PER_TICK', 10), // max coins gated per 5s loop (RPC budget)
  },

  // Watchdog: 24/7 independent re-verification of every Tradable coin (no leaks)
  // + revival scan (bundled launch whose bundle has SOLD and is back near launch).
  watchdog: {
    tickMs: num('WATCHDOG_TICK_MS', 10_000),
    recheckMs: num('WATCHDOG_RECHECK_MS', 60_000), // re-verify each tradable coin at most this often
    perTick: num('WATCHDOG_PER_TICK', 5),          // RPC budget per tick
    tradableMinMcUsd: num('WATCHDOG_TRADABLE_MIN_MC', 3000),
    // revival: a bundled coin counts as "second revival" once its bundle has sold
    // (holders clean again) AND it's fallen back to near launch mcap.
    revivalMaxMcUsd: num('WATCHDOG_REVIVAL_MAX_MC', 12000), // "near launch" ceiling
    revivalRecheckMs: num('WATCHDOG_REVIVAL_RECHECK_MS', 120_000),
    revivalPerTick: num('WATCHDOG_REVIVAL_PER_TICK', 3),
  },
};

// pump.fun public program + AMM/pool program ids (publicly known constants).
export const PROGRAMS = {
  PUMP_FUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  PUMP_SWAP: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
  RAYDIUM_V4: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  RAYDIUM_CLMM: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
};

// Owners that are pools, not real holders — excluded from concentration math.
export const POOL_OWNERS = new Set([
  PROGRAMS.PUMP_FUN,
  PROGRAMS.PUMP_SWAP,
  PROGRAMS.RAYDIUM_V4,
  PROGRAMS.RAYDIUM_CLMM,
]);
