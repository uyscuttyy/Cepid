# CEPID — Project Plan

Living log. Phases per architecture.md §14. Each phase gates on its tests
before the next starts; docs update at every phase boundary.

## Status: Phase 0 (monorepo scaffold) — IN PROGRESS

Approved decisions (02-SEP-26): D1 monorepo workspaces; D2 $0.01 testnet USDC
per /v1/memories/query via x402; D3 query-only payment; D4 two throwaway Base
Sepolia wallets (demo agent + CEPID payment receiver), user funds them;
D5 fresh ~10-minute demo markets per run.

## Phase 0 — Monorepo scaffold [DONE 02-SEP-26]

- [x] Audit v1 (old codebase, defects catalogued in architecture.md §2)
- [x] architecture.md v2 restructure plan; decisions D1–D5 approved
- [x] git mv: agent-layer modules → `agents/demo-trader/`; engine → `cepid/`
- [x] Delete: `persistence/events.ts` (replaced later by Sibyl journal),
      `test.txt`, tracked `ui/tsconfig.tsbuildinfo`; wipe `data/` (approved:
      outcome-corrupted, demo-only, never committed)
- [x] Workspace manifests: root, `@cepid/server`, `@cepid/client`,
      `@cepid/agent-demo-trader`; transitional shims for the agent
- [x] LICENSE (MIT — hackathon requires OSI)
- [x] contracts/ → Foundry project: foundry.toml, `script/Deploy.s.sol`
      (duration-parameterized for ~10-min demo markets), OZ v5.1.0 +
      forge-std v1.9.7 shallow-cloned, `forge build` green
- [x] npm workspaces install; **all gates green**: tsc clean in
      @cepid/server and @cepid/agent-demo-trader; engine tests 8/8 pass;
      agent tests 7/7 pass (incl. the memory-changes-decision thesis test,
      now importing the engine from `@cepid/server`)
- [x] Docs pass: README, prd.md, project-plan.md, handoff.md, architecture.md
- [x] contracts/lib + cache untracked (12 MB of deps stays out of git)

## Phase 1 — Core schema + correctness [NEXT]

Split trading types out of `cepid/src/core/domain.ts`; generic MemoryRecord /
DecisionRecord / OutcomeRecord; `marketOutcome` vs `tradeOutcome` separation;
key-leak prohibition tests (grep + runtime); regression: the inverted-NO case;
port engine modules to generic inputs.

## Phase 2 — Sibyl substrate [DONE 02-SEP-26]

- [x] sidecar/: FastAPI facade over sibyl-memory-client==0.8.0 — localhost
      bind, bearer token, per-request MemoryClient keyed by
      X-Agent-Tenant (tenant chosen by CEPID post-auth, never by callers);
      entities/state/journal routes; zero business logic. pytest 7/7.
- [x] SibylRepository implements MemoryRepository over sidecar HTTP:
      memories/patterns/scars/retrievals/decisions/outcomes → entities,
      journal → write_event/read_events, meta → tenant-scoped state tier.
- [x] JsonMemoryRepository DELETED (D1). No fallback store exists.
- [x] Evaluator maintains meta (counts + magnitude scale) — engine-owned.
- [x] THE GATE executable: killing the sidecar fails all 9 core ops with
      MEMORY_SUBSTRATE_UNAVAILABLE (load-bearing.test in
      sibyl-substrate.test.ts).
- [x] Restart survival: fresh sidecar process on the same DB sees all
      memory/patterns/scars/journal. Agent e2e re-proves the session-2 veto
      across a real uvicorn death.
- [x] Full suite on real substrate: @cepid/server 17/17, demo-trader 8/8.

## Phase 3 — Registry & isolation [NEXT]

Agent registry + hashed API keys in platform tenant; key→tenant resolution
middleware; isolation test (A cannot see B).

## Phase 4 — API v1 + SDK [DONE 03-SEP-26]

- [x] CepidApi on node:http (zero new deps): register / query / memories /
      decisions / outcomes / detail / history / activity / usage / healthz /
      readyz. Bearer-key auth; key → tenant server-side; callers never state
      tenants.
- [x] Influence edges API-enforced: decisions reject cited ids not present
      in the cited retrieval (INFLUENCE_NOT_SUPPORTED 400); other agents'
      retrieval rows are 404s. Retrieval rows written on every query.
- [x] @cepid/client: register/retrieve/recordExperience/recordDecision/
      recordOutcome/history. 402 seam ready for Phase 7.
- [x] Demo agent = pure consumer (CEPID_API_URL + CEPID_API_KEY, SDK only;
      engine imports gone; decision engine is a pure reasoner).
- [x] THESIS TEST CAUGHT A REAL BUG: vetoed decisions were never recorded —
      the influence chain for the demo's key moment was lost. Every decided
      path now records decision + edge + experience.
- [x] Gates: server 26/26 + tsc clean; agent 8/8 + tsc clean (full stack);
      sdk tsc clean; sidecar 7/7.

## Phase 5 — Lifecycle [DONE]

Retrieval rows on every used query; ranking with new signals; reinforce/weaken
on outcome; decay integration; counts surfaced.

## Phase 6 — Base Sepolia for real [DONE]

Deploy CepidTestMarket (~10-min expiry, D5); fund wallets (D4); demo loop
executes a real trade; PnL from chain; txHash into outcome evidence.

## Phase 7 — x402 gate [DONE]

In-process facilitator (no CDP key); protect /v1/memories/query at $0.01;
SDK buyer loop; Usage rows on settled payments.

## Phase 8 — UI restructure [DONE]

- UI reconnected to the live /v1/* API via a typed client (`@/lib/cepid.ts`,
  9 unit tests pinning the contract). Old `data/`-directory read path deleted;
  `CEPID_DATA_DIR` removed.
- Nav per architecture §13: Overview / Memories / Agents / Activity /
  Demo / Developers. Broken `/trades` link and `Section`/`Stat` imports gone.
- Pages rewritten against the generic platform schema (no agent vocabulary):
  Overview, Memories list + detail, Agents list + detail, Activity (journal
  feed), Demo (the two-run narrative), Developers (real registration form
  posting to `/api/register` → `/v1/agents/register`).
- `next build` and `tsc --noEmit` green in the UI workspace; the `ui/`
  workspace added to the monorepo root; the orphaned `Header.tsx`/`Footer.tsx`/
  `view.ts` and the broken JSON-pass-through API routes deleted.
- TDD: client test cases written first (RED), implementation made them pass
  (GREEN). Errors at the API boundary surface as `CepidClientError` with the
  server's `code` (e.g. `MEMORY_SUBSTRATE_UNAVAILABLE`).
- Deferred: relationship-graph view (memory.md "post-hackathon"); per-agent
  memory explorer; more detailed influence pages. None block the demo.

## Phase 9 — Developer surface [DONE]

- `docs/README.md` — index, product paragraph, the non-negotiables.
- `docs/agents.md` — identity, registration, keys, isolation.
- `docs/api.md` — every public route, request/response shapes, error
  codes, the x402 boundary, and the substrate-down contract.
- `docs/integration.md` — first-call walkthrough with `@cepid/client`:
  register → retrieve → reason → recordDecision → recordOutcome, plus
  the x402 payer flow.
- Doc-test: `sdk/test/docs-contract.test.ts` — 7 tests that fail if any
  documented shape, route, or error code drifts from the live SDK.
  Tests assert the same fake fetch contract as the UI client tests.
- SDK package gained a `test` script and a `tsx` devDependency.
- README points at `docs/`.

The acceptance test: a stranger can `npm install @cepid/client`,
follow `docs/integration.md`, register an agent, and make a real
`cepid.retrieve()` call against a live API.

## Phase 10 — End-to-end demo

Two-run demo per architecture.md §15 against the live stack; final test
matrix; handoff.md final state.

## Track (hackathon)

- Build window closes **10-SEP-26 23:59 UTC**. Judging 11–12 SEP.
- Submission: public repo (MIT), 2–5 min demo video w/ fresh-session recall
  beat, README w/ memory-load-bearing note, two build-in-public posts.
- Score: (rubric 40/25/20/15 + PMF ≤10) × multiplier (Base ×1.15; +Virtuals ×1.25).
