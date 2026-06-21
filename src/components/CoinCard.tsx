import { Avatar } from './Avatar';
import type { TokenMeta } from '../api';

export type Stat = { label: string; value: string; tone?: Tone };
export type Tone = 'good' | 'warn' | 'bad' | 'muted' | 'info';

const TONE: Record<Tone, string> = {
  good: 'rgba(74,222,128,0.9)',
  warn: 'rgba(251,191,36,0.9)',
  bad: 'rgba(248,113,113,0.95)',
  muted: 'rgba(148,163,184,0.75)',
  info: 'rgba(125,211,252,0.9)',
};

export function fmtUsd(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
}
export function fmtAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
export function pct(n: number | null | undefined): string {
  return n == null ? '—' : `${n.toFixed(n >= 10 ? 0 : 1)}%`;
}

export function CoinCard({ mint, symbol, meta, ticker, name, age, mcapUsd, secondary, stats, pill }: {
  mint: string;
  symbol?: string | null;
  meta?: TokenMeta;
  ticker: string;
  name?: string | null;
  age: number;
  mcapUsd: number | null;
  secondary?: { label: string; value: string }[]; // right-aligned (e.g. Vol, TX)
  stats: Stat[]; // bottom strip
  pill?: { label: string; tone: Tone };
}) {
  const short = `${mint.slice(0, 4)}…${mint.slice(-4)}`;
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '9px 11px',
        borderBottom: '1px solid rgba(148,163,184,0.08)',
        alignItems: 'flex-start',
      }}
    >
      <Avatar mint={mint} symbol={meta?.symbol || symbol} image={meta?.image} size={42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* line 1: ticker + name ........ MC */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <div style={{ minWidth: 0, display: 'flex', gap: 6, alignItems: 'baseline' }}>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: '#e5e7eb' }}>{(meta?.symbol || symbol || ticker).slice(0, 14)}</span>
            <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
              {meta?.name || name}
            </span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#e5e7eb', flex: 'none' }}>
            MC {fmtUsd(mcapUsd)}
          </span>
        </div>

        {/* line 2: age + mint + links ........ secondary stats */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 3, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
            <span style={{ fontSize: 11, color: 'rgba(125,211,252,0.85)' }}>{fmtAge(age)}</span>
            <button
              onClick={() => navigator.clipboard?.writeText(mint)}
              title="copy mint"
              style={{ fontSize: 10.5, color: 'rgba(148,163,184,0.6)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'ui-monospace, monospace' }}
            >
              {short}
            </button>
            <a href={`https://pump.fun/coin/${mint}`} target="_blank" rel="noreferrer" title="pump.fun"
               style={{ fontSize: 11, color: 'rgba(148,163,184,0.6)', textDecoration: 'none' }}>🔗</a>
            <a href={`https://dexscreener.com/solana/${mint}`} target="_blank" rel="noreferrer" title="DexScreener"
               style={{ fontSize: 11, color: 'rgba(148,163,184,0.6)', textDecoration: 'none' }}>📈</a>
          </div>
          <div style={{ display: 'flex', gap: 10, flex: 'none' }}>
            {secondary?.map((s, i) => (
              <span key={i} style={{ fontSize: 11, color: 'rgba(148,163,184,0.85)' }}>
                <span style={{ color: 'rgba(148,163,184,0.5)' }}>{s.label} </span>{s.value}
              </span>
            ))}
          </div>
        </div>

        {/* line 3: stat strip + verdict pill */}
        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {stats.map((s, i) => (
            <span key={i} style={{ fontSize: 10.5, color: TONE[s.tone || 'muted'] }}>
              <span style={{ opacity: 0.6 }}>{s.label}</span> {s.value}
            </span>
          ))}
          {pill ? (
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 10,
                fontWeight: 600,
                padding: '1px 8px',
                borderRadius: 999,
                color: TONE[pill.tone],
                border: `1px solid ${TONE[pill.tone]}`,
              }}
            >
              {pill.label}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
