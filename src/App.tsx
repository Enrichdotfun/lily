import { useEffect, useMemo, useState } from 'react';
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

/** True on phone-width viewports — drives the columns-to-tabs collapse. */
function useIsMobile(maxWidth = 760) {
  const q = `(max-width: ${maxWidth}px)`;
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const fn = () => setM(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [q]);
  return m;
}

export function App() {
  const oldFeed = useFeed<OldCoin>('/api/old');
  const newFeed = useFeed<BondedCoin>('/api/new');
  const bondedFeed = useFeed<BondedCoin>('/api/bonded');

  const [oldSort, setOldSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'vol', dir: 'desc' });
  const [newSort, setNewSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'age', dir: 'asc' });
  const [bondSort, setBondSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'age', dir: 'asc' });
  const [newTab, setNewTab] = useState<'unchecked' | 'tradable' | 'blocked'>('tradable');
  const [bondTab, setBondTab] = useState<'unchecked' | 'tradable' | 'blocked'>('tradable');
  const [mobileTab, setMobileTab] = useState<'old' | 'new' | 'bonded'>('new');
  const isMobile = useIsMobile();

  const oldCoins = oldFeed.data?.coins ?? [];
  // New pairs and Bonded share the same flow:
  //   blocked   — tripped a gate (bundle / rug / early-dump / crater), at any point
  //   tradable  — holder check ran AND nothing tripped
  //   unchecked — still pending the holder check, nothing tripped yet
  // New pairs: Unchecked is the unfiltered firehose; gates split into Blocked /
  // Tradable, and Tradable additionally hides anything under $3k mcap.
  const NEW_TRADABLE_MIN_MC = 3000;
  const newAll = newFeed.data?.coins ?? [];
  const isNewTradable = (c: BondedCoin) => c.checked && !c.hidden && (c.marketCapUsd ?? 0) >= NEW_TRADABLE_MIN_MC;
  const newBlocked = newAll.filter((c) => c.hidden);
  const newTradable = newAll.filter(isNewTradable);
  const newUnchecked = newAll.filter((c) => !c.hidden && !isNewTradable(c));
  const newActive = newTab === 'unchecked' ? newUnchecked : newTab === 'blocked' ? newBlocked : newTradable;

  const bondAll = bondedFeed.data?.coins ?? [];
  const bondBlocked = bondAll.filter((c) => c.hidden);
  const bondTradable = bondAll.filter((c) => c.checked && !c.hidden);
  const bondUnchecked = bondAll.filter((c) => !c.checked && !c.hidden);
  const bondActive = bondTab === 'unchecked' ? bondUnchecked : bondTab === 'blocked' ? bondBlocked : bondTradable;

  const oldSorted = sortCoins(oldCoins, oldSort.key, oldSort.dir,
    (c, k) => k === 'age' ? c.ageMs : k === 'mc' ? (c.marketCapUsd ?? 0) : c.recentTrades);
  const mcVol = (c: BondedCoin, k: SortKey) => k === 'age' ? c.ageMs : k === 'mc' ? (c.marketCapUsd ?? 0) : (c.volumeUsd ?? 0);
  const newSorted = sortCoins(newActive, newSort.key, newSort.dir, mcVol);
  const bondSorted = sortCoins(bondActive, bondSort.key, bondSort.dir, mcVol);

  const allMints = useMemo(
    () => [...oldSorted, ...newSorted, ...bondSorted].slice(0, 120).map((c) => c.mint),
    [oldSorted, newSorted, bondSorted],
  );
  const meta = useTokenMeta(allMints);
  const mm = (mint: string): TokenMeta | undefined => meta[mint];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', padding: 12, boxSizing: 'border-box', background: '#07070b' }}>
      <header style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <a href="/" title="Back to Enrich"
          style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(148,163,184,0.8)', textDecoration: 'none', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8, padding: '4px 10px', whiteSpace: 'nowrap' }}>
          ← Enrich
        </a>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={`${import.meta.env.BASE_URL}lily.png`} alt="" width={24} height={24} style={{ borderRadius: 6, objectFit: 'cover' }} />
          Lily
        </h1>
        {!isMobile && <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.55)' }}>live pump.fun token discovery · accurate on-chain stats only</span>}
        {bondedFeed.data?.solUsd ? (
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'rgba(148,163,184,0.6)' }}>SOL ${bondedFeed.data.solUsd.toFixed(2)}</span>
        ) : null}
      </header>

      {isMobile ? (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {([
            { key: 'old', label: 'Old', count: oldCoins.length, accent: 'rgba(251,191,36,0.9)' },
            { key: 'new', label: 'New', count: newAll.length, accent: 'rgba(125,211,252,0.9)' },
            { key: 'bonded', label: 'Bonded', count: bondAll.length, accent: 'rgba(74,222,128,0.9)' },
          ] as const).map((t) => {
            const on = mobileTab === t.key;
            return (
              <button key={t.key} onClick={() => setMobileTab(t.key)}
                style={{ flex: 1, fontSize: 12, fontWeight: 700, padding: '8px 6px', borderRadius: 8, cursor: 'pointer',
                  color: on ? '#0a0a0f' : 'rgba(203,213,225,0.85)', background: on ? t.accent : 'rgba(148,163,184,0.08)',
                  border: '1px solid rgba(148,163,184,0.14)' }}>
                {t.label} <span style={{ opacity: 0.7 }}>{t.count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 0 : 10 }}>
        {/* ---------- OLD PRE-BOND ---------- */}
        <div style={{ display: isMobile && mobileTab !== 'old' ? 'none' : 'contents' }}>
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
        </div>

        {/* ---------- NEW PAIRS (Unchecked | Blocked | Tradable) ---------- */}
        <div style={{ display: isMobile && mobileTab !== 'new' ? 'none' : 'contents' }}>
        <Column
          title="New pairs" accent="rgba(125,211,252,0.9)"
          subtitle={
            newTab === 'unchecked' ? 'Every new pump.fun launch, before gates.'
            : newTab === 'blocked' ? 'Launches that tripped a gate (bundle / rug / dump / crater).'
            : 'Clean launches over $3k mcap.'}
          count={newActive.length} apiLoad={newFeed.data?.api}
          status={feedStatus(newFeed.data?.updatedAt, newFeed.error)}
          sortKey={newSort.key} sortDir={newSort.dir}
          sortOptions={[{ key: 'age', label: 'Age' }, { key: 'mc', label: 'MC' }, { key: 'vol', label: 'Vol' }]}
          onSortKey={(k) => setNewSort((s) => ({ ...s, key: k }))} onSortDir={(d) => setNewSort((s) => ({ ...s, dir: d }))}
          tabs={[
            { key: 'unchecked', label: 'Unchecked', count: newUnchecked.length },
            { key: 'blocked', label: 'Blocked', count: newBlocked.length },
            { key: 'tradable', label: 'Tradable', count: newTradable.length },
          ]}
          activeTab={newTab} onTab={(k) => setNewTab(k as 'unchecked' | 'tradable' | 'blocked')}
        >
          {newSorted.map((c) => {
            const stats: Stat[] = [
              { label: 'Dev', value: pct(c.creatorPct), tone: devTone(c.creatorPct) },
              { label: 'T10', value: pct(c.holderTop10), tone: t10Tone(c.holderTop10) },
              { label: 'dip', value: `${c.dipPct.toFixed(0)}%`, tone: dipTone(c.dipPct) },
            ];
            return (
              <CoinCard key={c.mint} mint={c.mint} symbol={c.symbol} meta={mm(c.mint)}
                ticker={c.symbol || c.mint.slice(0, 6)} name={c.name} age={c.ageMs} mcapUsd={c.marketCapUsd}
                secondary={[{ label: 'V', value: fmtUsd(c.volumeUsd) }, { label: 'TX', value: String(c.trades) }]}
                stats={stats} pill={c.hidden ? { label: 'blocked', tone: 'bad' } : !c.checked ? { label: 'checking…', tone: 'warn' } : { label: 'tradable', tone: 'good' }}
              />
            );
          })}
          {newActive.length === 0 ? <Empty hint="waiting for fresh launches…" /> : null}
        </Column>
        </div>

        {/* ---------- BONDED (Unchecked | Tradable) ---------- */}
        <div style={{ display: isMobile && mobileTab !== 'bonded' ? 'none' : 'contents' }}>
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
            { key: 'blocked', label: 'Blocked', count: bondBlocked.length },
            { key: 'tradable', label: 'Tradable', count: bondTradable.length },
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
                stats={stats} pill={c.hidden ? { label: 'blocked', tone: 'bad' } : !c.checked ? { label: 'checking…', tone: 'warn' } : { label: 'tradable', tone: 'good' }}
              />
            );
          })}
          {bondActive.length === 0 ? <Empty hint="waiting for the next migration…" /> : null}
        </Column>
        </div>
      </div>
    </div>
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
