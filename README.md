<p align="center">
  <img src="public/lily.png" alt="Lily" width="180" style="border-radius:24px" />
</p>

<h1 align="center">Lily</h1>

**Real-time [pump.fun](https://pump.fun) token discovery.** Lily watches the chain
and surfaces coins side by side, filtered by transparent on-chain quality gates —
so you spend time on *interesting* coins instead of scrolling past obvious rugs.

It is a **discovery board only**. No trading, no wallet connection, no order
placement, no financial advice anywhere in this repo.

```
┌────────────────────┬────────────────────┬────────────────────┐
│   Old pre-bond     │     New pairs       │      Bonded        │
│                    │                     │                    │
│ older, un-bonded   │   🔒 private —      │ freshly graduated  │
│ coins that just    │   not part of the   │ coins, gated for   │
│ took fresh bids    │   open-source repo  │ bundles / rug      │
│ again              │                     │ holders / dumps    │
└────────────────────┴────────────────────┴────────────────────┘
```

> **Note:** the **New pairs / pre-bond discovery + gating is kept private** and is
> not included in this open-source build. The UI shows that column as
> "Unavailable in the public repo".

## The feeds

### Old pre-bond — "reawakened" coins
Most coins die young. Once in a while an older coin that never bonded starts
taking bids again. Lily lists tokens that are **old enough**, **still un-bonded**,
and have logged a **burst of recent on-chain activity** (measured with a key-less
RPC signature probe).

### Bonded — gated graduates
Coins that bond (migrate to an AMM) are tracked live for market cap, all-time high
and drawdown, and gated for **bundles**, **rug holders** (whale-float /
creator-retention), **early dumps** (deeply negative first-minute return *and* net
flow), and **craters**. Two tabs: **Unchecked** (every graduate) and **Tradable**
(only those that passed every gate). Gate thresholds live in
[`discovery/lib/gates.mjs`](discovery/lib/gates.mjs) as documented, tunable
constants — verify them on your own data.

Each row shows accurate, on-chain-derived stats only: USD market cap, volume, TX
count, age, dev (creator) %, top-10 holder concentration, and the gate verdict.

## Architecture

```
discovery/
  lib/   config · PumpPortal WS client · Solana RPC (Token-2022 safe) ·
         gates · SQLite store · sol price · request metrics
  old-prebond.mjs   reawakened old coins   -> SQLite (feed "old")
  bonded.mjs        migrations + gating    -> SQLite (feed "bonded")
server/server.mjs   public read API (CORS, cache, optional keys, rate limit)
src/                Vite + React UI (three-column board)
```

Daemons persist each flush to **SQLite** (durable current board + ~48h history);
the API reads from it. Nothing shares memory, so you can run any subset, and the
board survives restarts.

## Setup

```bash
cp .env.example .env     # then edit — at minimum set a real SOLANA_RPC_URL
npm install
```

A dedicated RPC provider (Helius / Triton / QuickNode) is strongly recommended —
the gates make many `getSignaturesForAddress` / `getTokenLargestAccounts` calls.
The PumpPortal data WebSocket is free and key-less. Each column header shows that
section's **live API request rate** so you can watch your load.

## Run

Two terminals:

```bash
npm start      # API server + Old/Bonded discovery daemons (auto-restart)
npm run dev    # the UI at http://localhost:5174
```

Or individually: `npm run api`, `npm run discover:old`, `npm run discover:bonded`.

## Public API

The backend exposes precomputed JSON (CORS-open, ~2s cache, optional API keys via
`LILY_API_KEYS`, rate-limited via `RATE_LIMIT_PER_MIN`):

```
GET /api/old        GET /api/bonded        GET /api/health
```

Because discovery runs once on the backend, serving these to many consumers does
**not** increase RPC cost — readers just read cached output.

## Deploy

See [DEPLOY.md](DEPLOY.md) for Render (blueprint included), Railway, persistence
(SQLite on a volume), and serving the UI under a subpath like `enrich.fun/lily`.

## License

MIT — see [LICENSE](LICENSE). Provided as-is, for informational/educational use.
Nothing here is financial advice.
