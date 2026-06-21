// SQLite persistence (via better-sqlite3). Three daemons write, the API reads.
//
//   coin         — current state per (feed, mint); the live board, durable across
//                  restarts. Readers filter by updated_at so stale rows drop off.
//   feed_meta    — per-feed metadata (ws state, api load, stats, sol price).
//   coin_history — rolling time-series for recent history / future charts; pruned.
//
// WAL + a busy timeout lets the separate daemon/API processes share one file.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dbFile = path.isAbsolute(config.dbPath) ? config.dbPath : path.join(root, config.dbPath);
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const db = new Database(dbFile);
// busy_timeout MUST come first: switching to WAL takes an exclusive lock, and
// with several daemon/API processes opening a fresh DB at once it would throw
// SQLITE_BUSY without a timeout to wait on.
db.pragma('busy_timeout = 8000');
try { db.pragma('journal_mode = WAL'); } catch { /* another process is converting it; fine */ }
db.exec(`
  CREATE TABLE IF NOT EXISTS coin (
    feed TEXT, mint TEXT, data TEXT, mcap REAL,
    updated_at INTEGER, first_seen INTEGER,
    PRIMARY KEY (feed, mint)
  );
  CREATE INDEX IF NOT EXISTS idx_coin_feed_upd ON coin(feed, updated_at);
  CREATE TABLE IF NOT EXISTS feed_meta (feed TEXT PRIMARY KEY, data TEXT, updated_at INTEGER);
  CREATE TABLE IF NOT EXISTS coin_history (feed TEXT, mint TEXT, ts INTEGER, mcap REAL, data TEXT);
  CREATE INDEX IF NOT EXISTS idx_hist_ts ON coin_history(ts);
`);

const upsertStmt = db.prepare(`
  INSERT INTO coin (feed, mint, data, mcap, updated_at, first_seen)
  VALUES (@feed, @mint, @data, @mcap, @now, @now)
  ON CONFLICT(feed, mint) DO UPDATE SET data=excluded.data, mcap=excluded.mcap, updated_at=excluded.updated_at
`);

/** Upsert the current board for a feed. We do NOT delete rows here — readers
 *  filter by a freshness window instead, so the last-known board survives a
 *  restart (true persistence) and coins age out naturally once unupdated. */
export function syncCoins(feed, rows) {
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const r of rows) {
      upsertStmt.run({ feed, mint: r.mint, data: JSON.stringify(r), mcap: r.marketCapUsd ?? r.marketCapSol ?? null, now });
    }
  });
  tx();
  // occasional housekeeping: drop rows far older than any feed's window
  if (Math.floor(now / 1000) % 30 === 0) {
    db.prepare('DELETE FROM coin WHERE updated_at < ?').run(now - 6 * 60 * 60 * 1000);
  }
}

export function getCoins(feed, freshMs = 24 * 60 * 60 * 1000) {
  const cut = Date.now() - freshMs;
  return db.prepare('SELECT data FROM coin WHERE feed=? AND updated_at>=?').all(feed, cut).map((r) => JSON.parse(r.data));
}

export function writeFeedMeta(feed, meta) {
  db.prepare(`INSERT INTO feed_meta (feed, data, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(feed) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`)
    .run(feed, JSON.stringify(meta), Date.now());
}
export function getFeedMeta(feed) {
  const r = db.prepare('SELECT data FROM feed_meta WHERE feed=?').get(feed);
  return r ? JSON.parse(r.data) : null;
}

export function recordHistory(feed, rows) {
  const now = Date.now();
  const stmt = db.prepare('INSERT INTO coin_history (feed, mint, ts, mcap, data) VALUES (?, ?, ?, ?, ?)');
  const tx = db.transaction(() => {
    for (const r of rows) {
      stmt.run(feed, r.mint, now, r.marketCapUsd ?? r.marketCapSol ?? null,
        JSON.stringify({ mcSol: r.marketCapSol ?? r.lastMcapSol ?? null, volSol: r.volumeSol ?? null, dip: r.dipPct ?? null }));
    }
  });
  tx();
}
export function pruneHistory(retentionMs) {
  db.prepare('DELETE FROM coin_history WHERE ts < ?').run(Date.now() - retentionMs);
}

// One call per flush: persist current board + meta, and (throttled) a history row.
const lastHist = {};
export function persist(feed, rows, meta) {
  syncCoins(feed, rows);
  writeFeedMeta(feed, meta);
  const now = Date.now();
  if (now - (lastHist[feed] || 0) >= config.historyIntervalMs) {
    lastHist[feed] = now;
    try { recordHistory(feed, rows); pruneHistory(config.historyRetentionMs); } catch { /* non-fatal */ }
  }
}

export { db };
