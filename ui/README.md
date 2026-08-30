# CEPID — UI

The Next.js dashboard for the CEPID trading agent. Read-only viewer for the
agent's memory, decisions, performance, and current state.

## What this is

- 9 pages: Overview, Market, Decision, Memory, Timeline, History, Performance, Agent, Wallet
- Read-only API routes that read the agent's JSON state
- Memory-first design: the hero of every page is what CEPID has learned, not what it owns
- No browser-side trading logic. Private keys never cross the network boundary
- The agent (in the parent `src/` directory) writes to `${CEPID_DATA_DIR}`; this UI only reads

## Run

```bash
# From the repo root:
cd ui
npm install
npm run dev    # http://localhost:3000
```

The UI reads from `../data` by default. Override with `CEPID_DATA_DIR`.

```bash
CEPID_DATA_DIR=../data npm run dev
```

## Design

The UI follows `/home/user_uy_scutty/skills/ui-design/SKILL.md`:
- Scan-level content separated from detail-level content
- No card-heavy nesting; rows and sections carry the layout
- Status communicated by typography + color + spacing, not color alone
- Mono numerics for prices, pnl, percentages
- Honest empty / loading / error states — no fake data
- Light + dark mode via `prefers-color-scheme`

## Stack

- Next.js 15 (App Router)
- React 19
- TypeScript
- CSS variables (no Tailwind)
- Server components for data fetching; client components only for the header (network status)

## API routes

- `GET /api/agent`           — current snapshot (network, wallet, risk, memory counts)
- `GET /api/memory/experiences?limit=N&since=ISO&outcome=WIN|LOSS|PENDING&asset=BTC|ETH`
- `GET /api/memory/patterns`  — patterns + scars
- `GET /api/sessions`         — session history
- `GET /api/events?type=preview|order_submitted`
- `GET /api/performance`      — win rate, pnl, extremes

## What this UI does NOT do

- Does not sign transactions
- Does not call any chain
- Does not show private keys
- Does not invent trades, performance, or memories
- Does not bypass the agent's risk engine (because it never runs trades)
