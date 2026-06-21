// Cached SOL/USD price. Refreshed lazily (every ~30s) from Jupiter's public
// price API, with a graceful fallback to the last known value.
import { tick } from './metrics.mjs';

const WSOL = 'So11111111111111111111111111111111111111112';
let cached = 0;
let fetchedAt = 0;
const TTL = 30_000;

export async function getSolUsd() {
  const now = Date.now();
  if (cached && now - fetchedAt < TTL) return cached;
  try {
    tick();
    const res = await fetch(`https://api.jup.ag/price/v3?ids=${WSOL}`, {
      headers: { accept: 'application/json' },
    });
    if (res.ok) {
      const j = await res.json();
      const price = Number(j?.[WSOL]?.usdPrice ?? j?.data?.[WSOL]?.price);
      if (Number.isFinite(price) && price > 0) {
        cached = price;
        fetchedAt = now;
      }
    }
  } catch { /* keep last known */ }
  return cached; // 0 until the first successful fetch
}
