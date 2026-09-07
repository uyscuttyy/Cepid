# CEPID — Handoff

Updated: 07-SEP-26 (master-prompt cycle, Phase 0 re-audit — NO CODE CHANGED).

## Current phase

Phase 0 (re-audit) — Status: COMPLETE. Implementation phases 0–10 plus
demo-runner/UI-demo-mode are done in the tree (HEAD `b416ae2` + 4
uncommitted files). Next: fix the demo-runner test, land the bind change,
re-verify, then submission track.

## What was completed (this audit — read-only)

- Full repo walk: `cepid/`, `sdk/`, `agents/demo-trader/`, `contracts/`,
  `scripts/`, `sidecar/`, `ui/`, `demo-runner/`, `docs/`, `data/`, env keys.
- Read: `prd.md` (rewritten to v3 — gate + Base execution product),
  `architecture.md` (status v2→v3, §4 demo-runner, §10 DELETE route,
  §17 audit findings), `project-plan.md` (verified vs tree),
  `memory.md` + `docs/constraint-gate.md` (both current, no change needed).
- Sibyl docs fetched (docs.sibyllabs.org): local-first SQLite + FTS5,
  zero embeddings, file-based tiers — consistent with architecture §3's
  verified findings (client 0.8.0, tenant isolation, 5 MB cap). GitHub
  repo not re-read (network/time); in-repo probes stand.
- Baseline executed: typecheck clean in all 5 workspaces; tests
  server 44/44, client 8/8, demo-trader 10/10, ui 9/9,
  **demo-runner 0/1 FAIL**.

## What works (verified this audit unless marked ↩)

Gate (ALLOW/DENY + reasons + blocking ids), lifecycle/backfill/scars,
registry + isolation, x402 paid retrieval (tested; ↩ live-process
paywall state carried from prior sessions, not re-verified — see below),
demo agent over HTTP/SDK only, CepidTestMarket + deploy/resolve scripts,
UI Case-File docket + one-click demo page + proxy routes + session
cookie, demo-runner state machine (↩ live on-chain proof of 06-SEP-26
carried from prior session records — 3 ALLOW txs → NO resolve → 3 LOSS
→ DENY/NO_TRADE per `project-plan.md` Phase 10; txHashes NOT re-checked
on Basescan in this audit), self-deletion route, docs + doc-contract
tests.

↩ = carried over from prior sessions, not freshly verified 07-SEP-26.

## What does not work

- `demo-runner/test/demo-runner.test.ts` FAILED on the throwaway stack
  (mock risk-cap defaults rejected the legs) — FIXED 07-SEP-26, now 1/1
  PASS. Root cause was job config, not product code; see fix note in
  "Known bugs" below.
- No services running (verified: no listeners on 8765/8797/8798/3000/3007
  this audit; host rebooted, /tmp wiped). ↩ Registry contents after the
  wipe (empty vs surviving rows) NOT verified — no DB file was inspected.
- Uncommitted: `cepid/src/api/{server,main}.ts`,
  `cepid/src/core/config.ts`, `demo-runner/src/server.ts` (0.0.0.0 bind).

## Known bugs / risks

1. Demo-runner mock-path failure — FIXED 07-SEP-26. Cause: the runner's
   `withJobEnv` omitted risk-collateral vars, so engine defaults (0.5
   per-order / 1.0 session) rejected the mock legs priced at 0.59.
   Fix (runner-only, `demo-runner/src/runner.ts`): job env now sets
   `CEPID_MAX_COLLATERAL='1.0'`, `CEPID_SESSION_MAX_COLLATERAL='3.0'`,
   `CEPID_SESSION_MAX_ORDERS='3'` — same values as live `.env` and the
   obedience tests. Verified: test 1/1 PASS + tsc clean. ↩ The live-path
   on-chain proof remains a prior-session claim, not re-verified here.
2. `data/` RESOLVED 07-SEP-26: wiped (contents were gitignored agent-local
   session/event exhaust from 06-SEP live runs + later test runs; writers
   `sessions/repository.ts` + `persistence/events.ts` mkdir recursively so
   dirs recreate). Platform journal remains the source of truth. The writer
   modules themselves are still live code — removing them is a separate,
   unscoped cleanup item, not done here.
3. ↩ Live API x402 state carried from prior sessions (reported free-mode
   for the demo); NOT verified this audit — no API process was running to
   probe. Code (`cepid/src/api/x402.ts`) + `x402.test.ts` (green) still
   pin paid behavior. Any "paid retrieval" claim about a running system
   needs a live probe first.
4. ↩ PAT exposure in chat history carried from prior sessions — remains
   documented here, NOT verified (no git history search for secrets was
   run this audit). Rotate before submission regardless.
5. `demo-runner/data/demo-agent.json` holds a live demo key (gitignored,
   confirmed never committed — keep it that way).

## Important implementation decisions (carried)

Extend, don't rewrite. Gate is pure/deterministic, no LLM on the permit
path. Sibyl-only persistence (no fallback). Tenant 1:1 via bearer key.
Only ALLOW → signed tx; DENY → NO_TRADE, market untouched. Tests on
throwaway stacks; shipping substrate never polluted. UI serves strangers
only (no CLI/cast/keys on their machine). Deploys via `cast` fallback
(viem 2.56 unreliable on Base Sepolia public RPC).

## Files/components changed (this audit — docs only)

- `prd.md` rewritten (v3).
- `architecture.md`: status, §4, §10, §17.
- `handoff.md`: this rewrite.
- NO implementation code touched.

## Environment/configuration requirements

↩ The following is carried from prior sessions (operator runbook in chat
07-SEP-26, COPY/PASTE DEMO) and was NOT re-verified this audit: port
assignments (sidecar 8765 / API 8797 — note the old handoff also cites
8787; `.env` `CEPID_PORT` is the arbiter / runner 8798 / UI 3000 dev or
3007 start), required keys (`DEMO_AGENT_PRIVATE_KEY`,
`CEPID_RPC_URL_BASE_SEPOLIA`, `CEPID_API_KEY`, `CAST_BIN`/foundry), and
the funded-wallet minimum (runner constant is $4.00 USDC
`MIN_BALANCE_USDC` — verified in `demo-runner/src/runner.ts` this audit;
the actual wallet balance was NOT checked). Verify each value live before
any run.

## Next phase

Not started. Begins only on explicit instruction. No implementation,
no commits, no deploys until then.

## Exact state after these documentation corrections

- Modified (uncommitted): `prd.md`, `architecture.md`, `handoff.md`
  (docs only); `demo-runner/src/runner.ts` (step-2 fix, uncommitted).
  Untouched: the 4 pre-existing uncommitted bind files.
- Port discrepancy RESOLVED: `.env` `CEPID_PORT=8797` is canonical for
  this machine; `8787` is only the code fallback default
  (`core/config.ts:42`) and the UI takes `CEPID_API_URL` with no port
  assumption. No code change needed.
- Test state: server 44/44, client 8/8, demo-trader 10/10, ui 9/9,
  demo-runner 1/1 PASS (step-2 fix verified + tsc clean). Full suite
  green.
