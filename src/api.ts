// Shared types + data-fetching hooks for the three discovery feeds.
import { useEffect, useRef, useState } from 'react';

export type OldCoin = {
  mint: string;
  name: string | null;
  symbol: string | null;
  image?: string | null;
  ageMs: number;
  marketCapSol: number | null;
  marketCapUsd: number | null;
  recentTrades: number;
  lastTradeAt: number;
};

export type BondedCoin = {
  mint: string;
  name: string | null;
  symbol: string | null;
  ageMs: number;
  trades: number;
  volumeUsd: number | null;
  athMcapSol: number | null;
  athMcapUsd: number | null;
  lastMcapSol: number | null;
  marketCapUsd: number | null;
  dipPct: number;
  maxDipPct: number;
  launchTxns: number | null;
  holderTop1: number | null;
  holderTop10: number | null;
  creatorPct: number | null;
  checked: boolean;
  hidden: boolean;
  hideReason: string | null;
  revived?: boolean; // bundled launch whose bundle sold + reset near launch (watchdog)
};

type Feed<T> = {
  updatedAt: number;
  coins: T[];
  stats?: Record<string, number>;
  ws?: string;
  solUsd?: number;
  api?: { perMin: number; total: number };
  scanner?: Record<string, unknown>;
};

// In production point the UI at the deployed API; in dev it's same-origin (proxied).
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

/** Poll one of the feeds on an interval. */
export function useFeed<T>(path: string, ms = 3000) {
  const [data, setData] = useState<Feed<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const d = await getJson<Feed<T>>(path);
        if (alive) { setData(d); setError(null); }
      } catch (e) {
        if (alive) setError(String((e as Error).message));
      }
    };
    tick();
    const id = setInterval(tick, ms);
    return () => { alive = false; clearInterval(id); };
  }, [path, ms]);
  return { data, error };
}

export type TokenMeta = { name: string | null; symbol: string | null; image: string | null };

/** Resolve name/symbol/image for a set of mints, cached client-side. */
export function useTokenMeta(mints: string[]) {
  const [meta, setMeta] = useState<Record<string, TokenMeta>>({});
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    const need = mints.filter((m) => m && !seen.current.has(m));
    if (!need.length) return;
    need.forEach((m) => seen.current.add(m));
    getJson<{ meta: Record<string, TokenMeta> }>(`/api/token-meta?mints=${need.slice(0, 60).join(',')}`)
      .then((d) => setMeta((prev) => ({ ...prev, ...d.meta })))
      .catch(() => { /* ignore; cards fall back to placeholder */ });
  }, [mints.join(',')]);
  return meta;
}
