import { useMemo, useState } from 'react';
import { useFeed, useTokenMeta } from './api';
import type { OldCoin, BondedCoin, TokenMeta } from './api';
import { Column } from './components/Column';
import type { SortKey, SortDir } from './components/Column';
import { CoinCard, fmtUsd, pct } from './components/CoinCard';
import type { Stat, Tone } from './components/CoinCard';

const devTone = (p: number | null | undefined): Tone => p == null ? 'muted' : p < 5 ? 'good' : p < 10 ? 'warn' : 'bad';
const t10Tone = (p: number | null | undefined): Tone => p == null ? 'muted' : p < 40 ? 'good' : p < 65 ? 'warn' : 'bad';
const dipTone = (p: number): Tone => p > -20 ? 'good' : p > -40 ? 'warn' : 'bad';

function sortCoins<T>(coins: T[], key: SortKey, dir: SortDir, val: (c: T, k: SortKey) => number): T[] {
  const s = [...coins].sort((a, b) => val(a, key) - val(b, key));
  return dir === 'desc' ? s.reverse() : s;
}

export function App() {
  const oldFeed = useFeed<OldCoin>('/api/old');
  const bondedFeed = useFeed<BondedCoin>('/api/bonded');

  const [oldSort, setOldSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'vol', dir: 'desc' });
  const [bondSort, setBondSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'age', dir: 'asc' });
  const [bondTab, setBondTab] = useState<'unchecked' | 'tradable' | 'blocked'>('tradable');

  const oldCoins = oldFeed.data?.coins ?? [];
  const bondAll = bondedFeed.data?.coins ?? [];
  // Three mutually-exclusive states a graduate flows through:
  //   blocked   — tripped a gate (bundle / rug / early-dump / crater), at any point
  //   tradable  — holder check ran AND nothing tripped
  //   unchecked — still pending the holder check, nothing tripped yet
  const bondBlocked = bondAll.filter((c) => c.hidden);
  const bondTradable = bondAll.filter((c) => c.checked && !c.hidden);
  const bondUnchecked = bondAll.filter((c) => !c.checked && !c.hidden);
  const bondActive = bondTab === 'unchecked' ? bondUnchecked : bondTab === 'blocked' ? bondBlocked : bondTradable;

  const oldSorted = sortCoins(oldCoins, oldSort.key, oldSort.dir,
    (c, k) => k === 'age' ? c.ageMs : k === 'mc' ? (c.marketCapUsd ?? 0) : c.recentTrades);
  const bondSorted = sortCoins(bondActive, bondSort.key, bondSort.dir,
    (c, k) => k === 'age' ? c.ageMs : k === 'mc' ? (c.marketCapUsd ?? 0) : (c.volumeUsd ?? 0));

  const allMints = useMemo(
    () => [...oldSorted, ...bondSorted].slice(0, 90).map((c) => c.mint),
    [oldSorted, bondSorted],
  );
  const meta = useTokenMeta(allMints);
  const mm = (mint: string): TokenMeta | undefined => meta[mint];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', padding: 12, boxSizing: 'border-box', background: '#07070b' }}>
      <header style={{ marginBottom: 10, display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={`${import.meta.env.BASE_URL}lily.png`} alt="" width={24} height={24} style={{ borderRadius: 6, objectFit: 'cover' }} />
          Lily
        </h1>
        <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.55)' }}>live pump.fun token discovery · accurate on-chain stats only</span>
        {bondedFeed.data?.solUsd ? (
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'rgba(148,163,184,0.6)' }}>SOL ${bondedFeed.data.solUsd.toFixed(2)}</span>
        ) : null}
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {/* ---------- OLD PRE-BOND ---------- */}
        <Column
          title="Old pre-bond" accent="rgba(251,191,36,0.9)"
          subtitle="Older, still-unbonded coins taking fresh bids again."
          count={oldCoins.length} apiLoad={oldFeed.data?.api}
          status={feedStatus(oldFeed.data?.updatedAt, oldFeed.error)}
          sortKey={oldSort.key} sortDir={oldSort.dir}
          sortOptions={[{ key: 'age', label: 'Age' }, { key: 'mc', label: 'MC' }, { key: 'vol', label: 'Bids' }]}
          onSortKey={(k) => setOldSort((s) => ({ ...s, key: k }))} onSortDir={(d) => setOldSort((s) => ({ ...s, dir: d }))}
        >
          {oldSorted.map((c) => (
            <CoinCard key={c.mint} mint={c.mint} symbol={c.symbol} meta={mm(c.mint)}
              ticker={c.symbol || c.mint.slice(0, 6)} name={c.name} age={c.ageMs} mcapUsd={c.marketCapUsd}
              secondary={[{ label: 'bids', value: String(c.recentTrades) }]}
              stats={[{ label: 'reawakened', value: `${c.recentTrades}/1h`, tone: 'good' }]}
            />
          ))}
          {oldCoins.length === 0 ? <Empty /> : null}
        </Column>

        {/* ---------- NEW PAIRS — not part of the public repo ---------- */}
        <Unavailable title="New pairs" accent="rgba(125,211,252,0.55)" />

        {/* ---------- BONDED (Unchecked | Tradable) ---------- */}
        <Column
          title="Bonded" accent="rgba(74,222,128,0.9)"
          subtitle={
            bondTab === 'unchecked' ? 'Fresh graduates still being checked.'
            : bondTab === 'blocked' ? 'Graduates that tripped a gate (bundle / rug / dump / crater).'
            : 'Graduates that passed every gate (bundle / rug / dump).'}
          count={bondActive.length} apiLoad={bondedFeed.data?.api}
          status={feedStatus(bondedFeed.data?.updatedAt, bondedFeed.error)}
          sortKey={bondSort.key} sortDir={bondSort.dir}
          sortOptions={[{ key: 'age', label: 'Age' }, { key: 'mc', label: 'MC' }, { key: 'vol', label: 'Vol' }]}
          onSortKey={(k) => setBondSort((s) => ({ ...s, key: k }))} onSortDir={(d) => setBondSort((s) => ({ ...s, dir: d }))}
          tabs={[
            { key: 'unchecked', label: 'Unchecked', count: bondUnchecked.length },
            { key: 'tradable', label: 'Tradable', count: bondTradable.length },
            { key: 'blocked', label: 'Blocked', count: bondBlocked.length },
          ]}
          activeTab={bondTab} onTab={(k) => setBondTab(k as 'unchecked' | 'tradable' | 'blocked')}
        >
          {bondSorted.map((c) => {
            const stats: Stat[] = [
              { label: 'Dev', value: pct(c.creatorPct), tone: devTone(c.creatorPct) },
              { label: 'T10', value: pct(c.holderTop10), tone: t10Tone(c.holderTop10) },
              { label: 'dip', value: `${c.dipPct.toFixed(0)}%`, tone: dipTone(c.dipPct) },
            ];
            return (
              <CoinCard key={c.mint} mint={c.mint} symbol={c.symbol} meta={mm(c.mint)}
                ticker={c.symbol || c.mint.slice(0, 6)} name={c.name} age={c.ageMs} mcapUsd={c.marketCapUsd}
                secondary={[{ label: 'V', value: fmtUsd(c.volumeUsd) }, { label: 'TX', value: String(c.trades) }]}
                stats={stats} pill={c.hidden ? { label: c.hideReason || 'blocked', tone: 'bad' } : !c.checked ? { label: 'checking…', tone: 'warn' } : { label: 'tradable', tone: 'good' }}
              />
            );
          })}
          {bondActive.length === 0 ? <Empty hint="waiting for the next migration…" /> : null}
        </Column>
      </div>
    </div>
  );
}

/** A column whose feature is not shipped in the open-source build. */
function Unavailable({ title, accent }: { title: string; accent: string }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', background: '#0a0a0f', border: '1px solid rgba(148,163,184,0.12)', borderRadius: 12, overflow: 'hidden' }}>
      <header style={{ padding: '10px 12px', borderBottom: '1px solid rgba(148,163,184,0.12)', background: '#0c0c12', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: accent, flex: 'none' }} />
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'rgba(229,231,235,0.7)' }}>{title}</h2>
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'rgba(148,163,184,0.5)', border: '1px solid rgba(148,163,184,0.14)', padding: '1px 8px', borderRadius: 999 }}>private</span>
      </header>
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 26, marginBottom: 10, opacity: 0.5 }}>🔒</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(229,231,235,0.8)' }}>Unavailable in the public repo</div>
          <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)', marginTop: 6, maxWidth: 240, lineHeight: 1.45 }}>
            The new-pairs discovery + gating is kept private and isn’t part of this open-source build.
          </div>
        </div>
      </div>
    </section>
  );
}

function feedStatus(updatedAt: number | undefined, error: string | null | undefined): string {
  if (error) return 'offline';
  if (!updatedAt) return 'waiting…';
  const age = Math.floor((Date.now() - updatedAt) / 1000);
  return age < 15 ? 'live' : `stale ${age}s`;
}

function Empty({ hint }: { hint?: string }) {
  return <div style={{ color: 'rgba(148,163,184,0.4)', fontSize: 12, padding: '14px 12px' }}>{hint || 'nothing yet…'}</div>;
}
