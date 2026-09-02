# CEPID — Architecture

Status: **v2 — restructure plan approved direction, pre-implementation.**
Source of truth: the product redefinition (CEPID = persistent memory infrastructure
for autonomous agents; the trading agent is one consumer/demo) and the decisions
recorded in this document.

- Audited: 01-SEP-26 (v1 audit of the old codebase; findings preserved in §2).
- Restructure plan: 02-SEP-26 (this version).
- Hackathon: Sibyl Labs (registered). Build window closes **10-SEP-26 23:59 UTC**.
  Gate: Sibyl Memory must be load-bearing — deleting it must break the core
  function. Rubric: memory 40 / innovation 25 / execution 20 / pitch 15,
  PMF +10, partner-stack multiplier up to ×1.25 (Base + Virtuals).

Nothing in Part 3 has been executed yet. This document is the plan the
implementation follows; deviations get written back here, not improvised.

---

## 1. What CEPID is (and is not)

```
AGENT (any autonomous agent; the demo is a trading agent)
  observes its environment
  asks CEPID for relevant memories         ──▶  HTTP + API key (+ x402 on paid routes)
  reasons with the returned context
  decides and acts (its own logic, not ours)
  reports the decision and the outcome back to CEPID
                    │
                    ▼
CEPID  —  the memory layer
  retrieves relevant past experiences from Sibyl
  ranks them (importance, similarity, recency, scar/pattern strength)
  records the new experience after the agent acts
  reinforces memories that proved useful, decays the rest
  forms patterns and scars
  meters usage and takes payment for retrieval
                    │
                    ▼
SIBYL MEMORY (Python sidecar, localhost HTTP)
  the persistence substrate: entities, FTS search, journal, tenant isolation
                    │
                    ▼
MARKET / BASE  —  the environment the *agent* acts in
  (demo: CepidTestMarket on Base Sepolia; real USDC, real transactions)
```

The agent is the brain. CEPID is the memory. The market is the world. CEPID
never decides anything; agents never touch Sibyl directly.

The load-bearing test, honestly stated: remove the Sibyl sidecar and CEPID has
no storage, no retrieval, no journal — every core endpoint fails. There is no
JSON fallback store. The TS memory *logic* (importance, similarity, patterns,
scars, decay) stays ours and keeps running, but with nothing to remember.

## 2. What was wrong with the old build (verified, 01-SEP-26)

1. **Outcome inversion.** One `Outcome` type served two meanings (market
   resolution vs. agent trade result). `app.ts` computed PnL correctly but
   stored the market's value as the trade's own outcome, so every `NO` trade
   was recorded backwards. 4 of 7 stored experiences said `WIN` with negative
   PnL; the derived pattern claimed "100% win rate" over `avgPnl: -0.63`.
   Memory was learning the wrong lesson from real outcomes.
2. **Private key persisted.** `app.ts:159,192` wrote `wallet: config.privateKey`
   into `data/events.json` (null only because no key was configured).
3. **UI build broken.** `db7de03` replaced `Section`/`Stat` primitives without
   migrating 8 consumer pages; Nav linked to a nonexistent `/trades`.
4. **No agent identity.** No `agentId` anywhere; single-tenant JSON store.
5. **Lifecycle half-implemented.** `reinforce()` never called; retrieval usage
   never recorded; no "retrieved 7 times" data source.
6. **No API boundary.** UI read the agent's files cross-tree; demo agent and
   product shared one process.
7. Sibyl absent (gate failure), no x402, minor: ESM `require()` bug in the
   Limitless auth path, dead `spentThisSession` placeholder in risk, dead
   `demo:session1/2` scripts, no LICENSE, junk `test.txt`, orphaned components.

All of this is fixed by the restructure rather than patched in place.

## 3. Verified facts the design rests on

Every item below was executed, not assumed:

- **Sibyl client** `sibyl-memory-client==0.8.0` (PyPI; Python-only — no npm
  package exists; `sibyl-memory-client` and `@sibyl-labs/memory` 404 on npm).
- `MemoryClient.local(path, tenant_id=…)` → SQLite + FTS5, no vectors, no
  network on the free tier. Cap: 5,242,880 bytes (5 MB), reported by
  `free_tier_status()`.
- **Tenant isolation is real.** Two clients on the same DB file with different
  `tenant_id`s: same `(category, name)` writes stay separate; cross-tenant
  `search`, `list_entities`, `read_events` return zero of the other tenant's
  data. `tenant_id` accepts arbitrary strings (`agent-demo-trader` works), so
  **agentId → tenant_id is a 1:1 mapping**.
- **Categories** `experience, decision, outcome, retrieval, pattern, scar,
  relationship, agent, apikey, usage` all accepted as entity categories.
- `search_entities(query, category=…)` scopes FTS to a category; a
  support-domain query did not return trading entities and vice versa, but the
  repository layer still filters by `domain` in the body (defense in depth).
- Journal: `write_event(evaluated=, acted=, forward=, extra=)` → per-tenant,
  readable with `read_events(limit, since, until)`. This becomes CEPID's
  activity log and the agent's retrieval/decision trail.
- Entities upsert on `(tenant, category, name)` conflict — so retrieval
  counters and strength can be maintained on the entity body by CEPID.
- **x402** (Linux Foundation standard; `@x402/core@2.24.0`, `@x402/evm@2.24.0`):
  `x402Facilitator` can run **locally inside our API process** — no CDP API key
  required. `ExactEvmScheme` (facilitator flavor) takes a viem-backed
  `FacilitatorEvmSigner`; `x402HTTPResourceServer` + `paymentMiddlewareFromHTTPServer`
  style wiring protect per-route. Default asset on `eip155:84532` (Base Sepolia)
  is USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` — the same USDC
  `CepidTestMarket` uses, so one token serves trades and payments.
  Client side: `x402Client`/`x402HTTPClient` pay the 402 and retry.
- **Base Sepolia live**: `eth_chainId → 0x14a34 (84532)` via public RPC.
- **Foundry 1.7.1 installed** (forge/cast/anvil); `contracts/` has no
  `foundry.toml` and OpenZeppelin is not vendored yet.
- **No `.env` exists** in the repo — only `.env.example`. No key configured.

## 4. Repository structure (proposed)

Monorepo, npm workspaces, one public repo for judging. The trading agent is a
**separate workspace with its own package** — a clean seam that can be lifted
into its own repository later without touching CEPID.

```
cepid/
├── architecture.md  prd.md  project-plan.md  handoff.md  memory.md  README.md
├── LICENSE                       # MIT (hackathon requires OSI license)
├── package.json                  # npm workspaces root
│
├── cepid/                        # THE PRODUCT — memory infrastructure (TS)
│   ├── package.json              # @cepid/server
│   ├── src/
│   │   ├── core/                 # generic memory schema + errors (§6)
│   │   ├── memory/               # importance, similarity(facets), patterns,
│   │   │                         # scars, decay, lifecycle, ranking (§8)
│   │   ├── repository/           # MemoryRepository interface + SibylRepository
│   │   │                         # (HTTP client → sidecar) (§7)
│   │   ├── registry/             # Agent + ApiKey registry, platform tenant
│   │   ├── api/                  # HTTP server: /v1 routes, auth, x402 gate
│   │   ├── usage/                # metering (Usage rows on settled payments)
│   │   └── sidecarctl/           # spawn/health-check the Python sidecar
│   └── test/                     # engine + isolation + e2e tests
│
├── sidecar/                      # THE SUBSTRATE — Sibyl bridge (Python)
│   ├── pyproject.toml            # pinned: sibyl-memory-client==0.8.0, fastapi, uvicorn
│   ├── sibyl_sidecar/
│   │   ├── main.py               # localhost-only REST facade over MemoryClient
│   │   └── (no business logic — deliberately dumb; ranking lives in TS)
│   └── tests/
│
├── sdk/                          # @cepid/client — what external agents import
│   └── src/index.ts              # cepid.retrieve({agentId, situation})
│                                 # cepid.recordDecision(...) cepid.recordOutcome(...)
│                                 # x402-aware fetch built in
│
├── agents/demo-trader/           # DEMO CONSUMER — the old agent, demoted
│   ├── package.json              # @cepid/agent-demo-trader
│   ├── src/
│   │   ├── run.ts                # the loop: observe → cepid.retrieve → reason
│   │   │                         # → decide → risk → trade → outcome → cepid
│   │   ├── decision/             # memory-informed engine (moved from src/decision)
│   │   ├── strategy/             # deterministic base strategy (moved)
│   │   ├── risk/                 # guardrails (moved; session cap fixed)
│   │   ├── market/               # providers: Base Sepolia test market, mock (moved)
│   │   ├── sessions/             # agent's own session file (agent-side only)
│   │   └── wallet/               # env-only signer; keys never leave this package
│   └── test/                     # thesis test, session-restart test
│
├── contracts/                    # Foundry project
│   ├── foundry.toml              # to be initialized (Phase 6)
│   ├── src/CepidTestMarket.sol   # unchanged; deploy script added
│   └── script/Deploy.s.sol
│
├── ui/                           # CEPID dashboard (Next.js; restructured §10)
│
└── docs/                         # developer docs: registration, API, integration
    ├── api.md  agents.md  demo.md  x402.md
```

**Deleted outright**: old `src/` tree (its modules move or die per §9),
`data/` (wiped — approved), `test.txt`, orphaned components, `wallet`/`performance`
as top-level UI routes, `JsonMemoryRepository` (no JSON fallback, by decision),
`persistence/events.ts` (journal replaces it), dead `demo:session1/2` scripts.

## 5. Disposition of every existing module

| Old path | Verdict | New home / note |
| --- | --- | --- |
| `src/memory/importance.ts` | **KEEP** (adapted) | `cepid/src/memory/` — generic signals, same model |
| `src/memory/similarity.ts` | **REWRITE** | facet comparator + FTS-rank blend; weights preserved as the trading profile |
| `src/memory/linker.ts` (patterns) | **KEEP** | `cepid/src/memory/` — generic facet tags |
| `src/memory/scars.ts` | **KEEP** | unchanged semantics |
| `src/memory/decay.ts` | **KEEP + FIX** | decay stays; `reinforce()` becomes a real, called step (§8) |
| `src/memory/retriever.ts` | **REWRITE** | generic situation; adds recency, retrieval-count, magnitude (§8) |
| `src/memory/evaluator.ts` | **REWRITE** | emits Experience + Decision + Outcome + edges (§6) |
| `src/memory/repository.ts` (interface) | **KEEP** | `cepid/src/repository/types.ts` |
| `JsonMemoryRepository` | **DELETE** | no fallback substrate, by decision |
| `src/decision/engine.ts` | **MOVE** | `agents/demo-trader/src/decision/` — agent reasoning, not CEPID |
| `src/strategy/*` | **MOVE** | demo agent |
| `src/risk/engine.ts` | **MOVE + FIX** | demo agent; session-collateral placeholder fixed |
| `src/market/*` (all 3 providers) | **MOVE** | demo agent; Limitless `require()` bug fixed |
| `src/app.ts` | **REWRITE** | demo agent `run.ts`; memory calls go through `@cepid/client` HTTP only |
| `src/cli/run-session.ts` | **REWRITE** | demo agent CLI with real flags |
| `src/config/types.ts` | **SPLIT** | generic memory types → `cepid/src/core`; trading types → demo agent |
| `src/config/load.ts` | **SPLIT** | platform config (env, ports, x402 wallet) → cepid; agent config → demo agent |
| `src/persistence/events.ts` | **DELETE** | Sibyl journal (per tenant) replaces the event file |
| `src/sessions/repository.ts` | **MOVE** | demo agent's own local session file |
| `contracts/CepidTestMarket.sol` | **KEEP** | Foundry-ified; deploy script added (§11) |
| `ui` tokens/shell CSS, `format.ts`, `view.ts` discipline | **KEEP** | honest-null view models retargeted to new entities |
| `ui` pages/components per §10 | **REWRITE / FIX** | new nav + product story; broken imports die with the pages they live in |
| `test/*` | **SPLIT** | engine tests → `cepid/test`; thesis + restart tests → demo agent (rewritten against the SDK) |
| `data/*` | **WIPE** | approved: corrupted, demo-only, gitignored |

## 6. Generic memory schema

Hardcoded trading types are gone. The core record:

```ts
interface MemoryRecord {
  id: string;                      // 'mem-…' (entity name in Sibyl)
  agentId: string;                 // → Sibyl tenant_id, always
  domain: string;                   // 'prediction-market' | 'support' | anything
  kind: 'experience' | 'pattern' | 'scar' | 'strategy-note';
  text: string;                     // free-form situation description — FTS target
  facets: Record<string, string | number>;  // typed comparable features
  importance: number;               // [0,1], deterministic model (kept)
  strength: number;                 // [0,1], decayed/reinforced (§8)
  source: string;                   // which run/decision produced it
  retrievedCount: number;           // real, incremented per retrieval use
  lastRetrievedAt: string | null;
  createdAt: string; updatedAt: string;
  relationships: MemoryEdge[];      // typed edges (§6.1)
}
```

Trading is the **first profile**: the demo agent supplies
`facets = {asset, timeframe, volatility, momentum, liquidity, timeBucket,
direction}` and its `text` is the situation sentence. A support agent supplies
different facets; similarity compares facet sets by schema-aware weights and
falls back to text overlap for unshared facets.

The two-outcome fix, in core types from day one:

```ts
interface DecisionRecord {
  id: string; agentId: string;
  situation: { domain: string; text: string; facets: … };
  reasoning: string[];             // includes memory-derived lines
  action: string;                  // agent-defined ('LONG','NO_TRADE','refund',…)
  confidenceBase: number; confidenceFinal: number;
  retrievalId: string | null;       // → RetrievalRecord: THE influence edge
  createdAt: string;
}
interface OutcomeRecord {
  id: string; decisionId: string; agentId: string;
  result: string;                   // agent-defined vocabulary ('LOSS','WIN','resolved',…)
  metrics: Record<string, number>; // pnl, latency, whatever the domain has
  marketOutcome?: string;           // what the environment resolved to (if any)
  tradeOutcome?: string;           // whether the agent's action profited/was right
  evidence?: { chain?: 'base-sepolia'; txHash?: string; blockNumber?: number };
  observedAt: string;
}
```

`marketOutcome` and `tradeOutcome` are **separate optional fields, never
inferred from each other**. PnL stays independent and authoritative for the
financial result. A regression test asserts: a `NO` position that the market
resolved `WIN`-for-YES stores `marketOutcome: 'YES_WON'` (or the domain's
vocabulary), `tradeOutcome: 'LOSS'`, negative PnL — the exact case the old
code inverted.

6.1 `MemoryEdge`: `{targetId, relation: 'related-to'|'contributes-to'|
'contradicts'|'pattern-of'|'scarred-by', weight}`. Patterns and scars are
first-class records that `contributes-to` edges point at; experiences link to
each other via shared facet signatures (the old tag logic, generalized).

## 7. The Sibyl boundary

**Sidecar** (`sidecar/`, Python, FastAPI, binds 127.0.0.1 only):

- One `MemoryClient` per request, selected by `X-Agent-Tenant` — but the tenant
  value is **chosen by CEPID's API server after authenticating the API key**,
  never taken from the request body of an external caller. The sidecar itself
  is guarded by a shared secret (`SIDECAR_TOKEN`, env) so nothing on localhost
  can drive it directly. It contains zero business logic.
- Routes (all JSON): `POST /entities` (set/upsert), `GET /entities/:cat/:name`,
  `GET /entities?category&status&limit`, `DELETE /entities/:cat/:name`,
  `POST /archive`, `POST /search` (→ `search_entities` + optional tiers),
  `POST /events`, `GET /events?limit&since&until` (journal),
  `GET/POST /state/:key`, `GET /health` (schema, free-tier usage).
- Platform data (agent registry, api-key hashes, usage, platform activity)
  lives in the sidecar too — under CEPID's own `tenant_id='cepid-platform'`,
  never mixed with an agent's tenant.

**CEPID repository** (`cepid/src/repository/sibyl-repository.ts`):
implements the existing `MemoryRepository` interface (plus
`searchText(query)`, journal, edges) over sidecar HTTP. The interface is the
seam; the old engine modules keep coding against it.

Delete-test (the gate, made mechanical): `test/load-bearing.test.ts` kills the
sidecar mid-suite and asserts every core endpoint — query, record, outcome,
agent history — returns a structured `MEMORY_SUBSTRATE_UNAVAILABLE` error and
the UI shows an explicit "memory layer down" state. Not a graceful degrade: the
product's core function is gone.

## 8. Memory lifecycle (the missing half, implemented)

```
retrieved ──▶ used in a decision ──▶ outcome observed ──▶ validated ──▶ reinforced | decayed
```

1. **Retrieval rows.** Every `POST /v1/memories/query` that actually feeds a
   decision produces a `RetrievalRecord` (journal event in the agent tenant):
   `{query, returnedMemoryIds[], rankingSnapshot[], occurredAt}`. Counts on the
   memory bodies increment only here. No invented counts.
2. **Ranking** (kept + extended): FTS rank (Sibyl) × facet similarity (profile
   weights) × importance × strength × recency × `log(1+retrievedCount)` × scar
   boost (0.15) × pattern boost (0.10) — deterministic, documented, tested.
3. **Outcome validation.** On `POST /v1/outcomes`, CEPID walks the decision's
   `retrievalId` → the memories that were used → for each, did it help or
   mislead? (Aligned-with-result ⇒ reinforce +0.05; contradicted ⇒ weaken
   −0.03; scars decay at 0.25× as before.)
4. **Decay** stays deterministic: 1%/hr, floor 0.05, no deletion (audit trail).
5. **Patterns/scars** recompute after every stored outcome (generalized linker).

`reinforce()` is called by the outcome path — the unused-function bug dies.

## 9. Security rules (enforced, then tested)

- Private keys exist only inside `agents/demo-trader` (its trading wallet) and
  `cepid` (the x402 facilitator + payment-receiver wallet). Both env-only
  (`DEMO_AGENT_PRIVATE_KEY`, `CEPID_PAYMENT_WALLET_KEY`), never logged, never
  serialized, never in any Sibyl tier, never in any API response.
- Event/log serialization audit: a lint test greps the codebase for
  `privateKey|wallet:|secret` in any write path, and a runtime test asserts no
  persisted payload contains a `0x` 64-hex key.
- API keys: generated at registration, shown once, stored as SHA-256 hash +
  prefix/last-4 in the platform tenant. Lookup = hash-then-match.
- Isolation: the API server resolves tenant from the authenticated key. Test:
  agent A's key querying with B's memory id ⇒ 404, zero leakage of B's text in
  any response or error message.
- Sidecar: 127.0.0.1 bind + shared token; not exposed by the UI or any proxy.

## 10. HTTP API v1

| Route | Paid | Purpose |
| --- | --- | --- |
| `POST /v1/agents/register` | no | name, description → agentId + API key (shown once) |
| `POST /v1/memories/query` | **x402** | `{situation{domain,text,facets}}` → ranked memories + patterns + scars + retrievalId |
| `POST /v1/memories` | no | record an experience (CEPID wants the data) |
| `POST /v1/decisions` | no | `{retrievalId?, reasoning, action, confidences}` → decisionId |
| `POST /v1/outcomes` | no | `{decisionId, result, metrics, marketOutcome?, tradeOutcome?, evidence?}` → runs validation loop |
| `GET /v1/memories/:id` | no | detail (tenant-scoped) |
| `GET /v1/agents/:id/memory` `…/history` | no | dashboard + agent page feeds |
| `GET /v1/activity` | no | journal-derived feed (tenant or platform scoped) |
| `GET /v1/usage/:agentId` | no | metered calls + settled payments |
| `GET /healthz` `/readyz` | no | readiness includes sidecar health |

The demo agent uses **only** these routes via `sdk/` (`@cepid/client`) —
`cepid.retrieve({situation})`, `cepid.recordDecision`, `cepid.recordOutcome`.
There is no privileged in-process path (the old violation of §5, fixed by
construction).

## 11. Base Sepolia integration (real)

- `contracts/` becomes a Foundry project; `CepidTestMarket.sol` unchanged in
  behavior; deploy script parameterizes (asset, timeframe, expiry, minShares).
  Markets are cheap to redeploy per demo run, so expiry can be minutes-long —
  the demo shouldn't wait an hour for resolution.
- The demo agent trades with a funded throwaway wallet (env key). Its session-1
  trade is a real `buyYes`/`buyNo` tx; resolution is read from the contract;
  PnL comes from actual entry price and redemption math. txHash + blockNumber
  ride into the `OutcomeRecord.evidence` — visible in the UI, checkable on
  Basescan.
- The Limitless mainnet provider moves to the demo agent but is not part of
  the demo path (fix the ESM `require` bug; leave unexercised).

## 12. x402 payment boundary (real, small)

- **Server**: our own in-process `x402Facilitator` — no CDP API key needed
  (verified: local facilitator + `ExactEvmScheme` + viem signer compose).
  Registered network `eip155:84532`, asset = default testnet USDC
  (`0x036CbD…` — same token the market uses). Receiver = `CEPID_PAYMENT_WALLET`.
- **Protected route**: `POST /v1/memories/query` only, price `$0.001`–`$0.01`
  (config `CEPID_QUERY_PRICE`; default `$0.01` for a visible-but-trivial
  testnet amount). Writes stay free — CEPID wants agents to report outcomes.
- **Client**: `@cepid/client` ships the x402 buyer (viem account from the
  agent's env) — the 402 → sign → retry loop is part of the SDK so an external
  agent gets paid retrieval "for free" in code.
- **Metering**: on settled payment, a `Usage` row (route, agentId, amount, tx
  hash, ts) in the platform tenant. The UI shows real usage; nothing fabricated.
- Budget guard: one day of build time, hard cap. If the facilitator path
  fights us, fallback is the CDP-hosted facilitator path (same standard, needs
  CDP keys) — still real x402, never a fake.

## 13. UI restructure

Tokens, `format.ts`, honest-null view-model discipline: kept. Everything else
re-navigated around the memory story:

```
Overview     — what CEPID remembers, live: connected agents, memories by kind,
               retrieval activity, influence events, substrate health + tier usage
Memories     — explorer: experiences/patterns/scars, filters, detail pages
               (lifecycle strip: created → retrieved N× → used in decision → outcome)
Agents       — registry + per-agent page ("what CEPID remembers about this agent")
Activity     — journal feed (memory created / retrieved / influenced decision / payment settled)
Demo         — the two-run demonstration (§15), market + decision context,
               explicitly labelled DEMO DATA where seeded
Developers   — register an agent (real flow, key shown once), API docs, SDK snippet
```

Product story on every page: *agent → remembers → learns → acts differently.*
The demo agent's trading detail lives inside Demo, not in top-level nav. Broken
pages are rewritten to the new routes rather than repaired in place.

## 14. Implementation phases (each gated by tests + doc updates)

| # | Phase | Gate |
| --- | --- | --- |
| 0 | Monorepo scaffold, wipe `data/`, foundry-init contracts, LICENSE, package moves | workspaces install; old tests catalogued |
| 1 | Core schema + outcome split + key-leak prohibition; port engine modules; regression tests incl. the NO-trade inversion case | `cepid` tests green |
| 2 | Sidecar + `SibylRepository` + journal; restart-survival test across sidecar restart | cross-process memory survives |
| 3 | Registry: agents, hashed API keys, tenant resolution, isolation test (A≠B) | isolation test green |
| 4 | HTTP API v1 + `@cepid/client`; demo agent rewritten to consume it end-to-end | demo run through API only |
| 5 | Lifecycle: retrieval rows, ranking, reinforce-on-outcome, decay | strength actually rises/falls in tests |
| 6 | Foundry deploy to Base Sepolia + funded wallets + real trade in the demo loop | txHash on Basescan; PnL from chain |
| 7 | x402 gate on `/v1/memories/query` + Usage metering | unpaid → 402; paid → 200 + Usage row |
| 8 | UI restructure to §13 against live API | build + typecheck green; no hardcoded values |
| 9 | Developer surface: docs, registration flow, integration example | external-agent walkthrough from docs alone |
| 10 | Two-run demo + final test matrix (§15) against the live stack | all ten checks pass |

`prd.md` (new product), `project-plan.md` (phase log), `handoff.md`,
`memory.md` updated at the end of every phase, this file on any deviation.

## 15. The final test (acceptance)

Run twice against the live stack (sidecar + API + Base Sepolia market):

1. Register an agent (key issued).
2. Run 1: agent queries with a fresh situation → **no relevant memory**; trades
   LONG on-chain; market resolves against it; outcome recorded with evidence.
3. CEPID stores the experience; pattern forms after repeated similar losses.
4. Run 2 (new process): agent queries the similar situation → CEPID returns
   the losses + pattern (+ scar); agent's confidence visibly drops; decision
   changes (e.g. LONG → NO_TRADE) **because of** the retrieved memory — the
   decision row references the retrieval row, and that edge is what the UI
   renders. Nothing is asserted; it's derived.
5. Outcome of run 2 recorded; memories that were used get reinforced/weakened
   per §8; counts visible.
6. Meanwhile the second agent, isolated, sees none of it.
7. Every retrieval during the demo was paid via x402; Usage rows exist.

If that doesn't hold end-to-end, CEPID isn't finished.

## 16. Decisions requiring the user (open)

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | Monorepo workspaces vs literal separate repo for the trading agent | **Monorepo** (one judgeable repo, clean seam, extractable later) |
| D2 | x402 price on `/v1/memories/query` | **$0.01 testnet USDC** (visible, trivial, real) |
| D3 | Which routes are paid | **query only**; writes and registration free |
| D4 | Wallet generation + funding: I generate two throwaway Base Sepolia keypairs (demo agent wallet, CEPID payment wallet); **you fund them** from a faucet (needs your GitHub/Google or wallet for most Base Sepolia faucets) | approve this split |
| D5 | Demo market expiry per run | deploy fresh markets with **~10-minute expiry** so the demo resolves inside a session |

## 17. Known limitations (carried, honest)

- Sibyl free tier caps the local DB at 5 MB — surfaced in the UI; enough for
  the demo, and account binding can lift it later (out of scope).
- Limitless mainnet path is moved, fixed, but unexercised in the demo.
- Decay/lifecycle runs on process ticks; no background scheduler yet.
- One Sibyl DB file, one host — single-node deployment shape.
- The demo agent's vocabulary (`LONG`, `NO_TRADE`, PnL) is profile data, not
  platform concepts; the platform never special-cases trading.
