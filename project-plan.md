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

## Phase 4 — API v1 + SDK

HTTP routes (architecture.md §10); `@cepid/client`; demo agent rewritten as
pure SDK consumer (shims deleted; no in-process paths).

## Phase 5 — Lifecycle

Retrieval rows on every used query; ranking with new signals; reinforce/weaken
on outcome; decay integration; counts surfaced.

## Phase 6 — Base Sepolia for real

Deploy CepidTestMarket (~10-min expiry, D5); fund wallets (D4); demo loop
executes a real trade; PnL from chain; txHash into outcome evidence.

## Phase 7 — x402 gate

In-process facilitator (no CDP key); protect /v1/memories/query at $0.01;
SDK buyer loop; Usage rows on settled payments.

## Phase 8 — UI restructure

Nav: Overview / Memories / Agents / Activity / Demo / Developers; influence
story from real edges; substrate health; broken pages rewritten, not repaired.

## Phase 9 — Developer surface

Registration flow (key shown once); docs/api.md, agents.md, integration
example; external-agent walkthrough.

## Phase 10 — End-to-end demo

Two-run demo per architecture.md §15 against the live stack; final test
matrix; handoff.md final state.

## Track (hackathon)

- Build window closes **10-SEP-26 23:59 UTC**. Judging 11–12 SEP.
- Submission: public repo (MIT), 2–5 min demo video w/ fresh-session recall
  beat, README w/ memory-load-bearing note, two build-in-public posts.
- Score: (rubric 40/25/20/15 + PMF ≤10) × multiplier (Base ×1.15; +Virtuals ×1.25).
