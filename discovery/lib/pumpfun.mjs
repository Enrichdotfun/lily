// Minimal client for pump.fun's public read API (no key required).
// Used by the old-pre-bond scanner to list candidate coins and by the API
// server to resolve token metadata (name / symbol / image).
import { tick } from './metrics.mjs';

const BASE = 'https://frontend-api-v3.pump.fun';
const HEADERS = { accept: 'application/json', 'user-agent': 'lily-discovery/0.1' };

async function getJson(url) {
  tick();
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`pump.fun ${res.status}`);
  return res.json();
}

/** Normalise the bits of a pump.fun coin record we care about. */
export function normalizeCoin(c) {
  if (!c || !c.mint) return null;
  return {
    mint: c.mint,
    name: c.name ?? null,
    symbol: c.symbol ?? null,
    image: c.image_uri ?? c.image ?? null,
    creator: c.creator ?? null,
    createdAt: c.created_timestamp ?? null,
    lastTradeAt: c.last_trade_timestamp ?? null,
    marketCapSol: c.market_cap ?? null,
    marketCapUsd: c.usd_market_cap ?? null,
    bonded: Boolean(c.complete || c.raydium_pool || c.pump_swap_pool),
  };
}

/** Recently-traded coins, newest trade first. */
export async function listRecentlyTraded(limit = 100, offset = 0) {
  const url = `${BASE}/coins?offset=${offset}&limit=${limit}&sort=last_trade_timestamp&order=DESC&includeNsfw=false`;
  const arr = await getJson(url);
  return Array.isArray(arr) ? arr.map(normalizeCoin).filter(Boolean) : [];
}

/** Single coin record. */
export async function getCoin(mint) {
  return normalizeCoin(await getJson(`${BASE}/coins/${mint}`));
}
