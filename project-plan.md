# CEPID — Project Plan

## Phases

### PHASE 1 — Audit [DONE]
- Classified every file: KEEP / REFACTOR / REMOVE / REPLACE.
- Recorded in `handoff.md`.
- No code changes yet.

### PHASE 2 — Clean restructure [NEXT]
- Remove `src/clash.ts`.
- Rewrite `src/config.ts`, `src/index.ts`, `package.json`, `.env.example`, `README.md`.
- Lay out new module tree under `src/`:
  ```
  config/ types/ market/ memory/ decision/ strategy/ risk/ wallet/ execution/ sessions/ persistence/ cli/ ui/
  ```
- Each module exposes an interface, no module reaches into another's internals.
- Typecheck passes; existing core tests rewritten against the new layout.

### PHASE 3 — Memory core
- `memory/schema.ts` — `Experience`, `Pattern`, `Scar`, `Success`, `DecisionMemory` types.
- `memory/importance.ts` — novelty / outcome / prediction-error / pattern strength scoring.
- `memory/similarity.ts` — vector comparison over normalized market context.
- `memory/repository.ts` — JSON-backed `MemoryRepository` interface.
- `memory/retriever.ts` — ranked retrieval; scar boost; pattern boost.
- `memory/linker.ts` — pattern detection across experiences.
- `memory/decay.ts` — strengthen / weaken / forget over time.
- `memory/scars.ts` — scar lifecycle (creation, decay, retrieval priority).
- `memory/evaluator.ts` — converts a `(decision, outcome)` pair into a memory candidate and decides whether to keep it.
- Tests for each.

### PHASE 4 — Memory-informed decision engine
- `decision/base-strategy.ts` — wraps `DeterministicStrategy`.
- `decision/decision-engine.ts` — combines base recommendation + memory influence → final decision.
- `decision/explanation.ts` — produces the structured explanation required by spec §18.
- **Critical test:** same market, no relevant memory → `BUY_YES`; same market, relevant negative memory → `NO_TRADE`.

### PHASE 5 — Base execution
- `execution/provider.ts` — preview vs execute.
- `wallet/base-sepolia-signer.ts` — viem signer pointed at Base Sepolia.
- `market/base-market-provider.ts` — Base testnet market discovery (start with mock; real source plugs in via interface).
- Preview default; execute gated by explicit flags and risk preconditions.

### PHASE 6 — Session continuity
- `sessions/session.ts` — session start / end / resume.
- `sessions/repository.ts` — JSON-backed `SessionRepository`.
- **Critical test:** session 1 records an experience, process restarts, session 2 retrieves it.

### PHASE 7 — UI
- `ui/index.html`, `ui/styles.css`, `ui/app.js` — memory-first dashboard.
- `ui/server.ts` — tiny static server with read-only API for memory/sessions/decisions.
- Sections: agent status, current market, current decision + explanation, memory stats, scars, recent experiences, memory influence.

### PHASE 8 — Integration
- Wire market → memory retrieval → decision engine → risk → execution → outcome → memory evaluator → repository.

### PHASE 9 — Testing
- `npm test` — unit tests (memory, decision, risk, persistence, similarity, decay, scars).
- `npm run typecheck` — clean.
- `npm run preview` — read-only end-to-end against mock market.
- Manual Base testnet preview (if a real market source is available).

### PHASE 10 — Demo preparation
- `npm run demo` — deterministic Sibyl demo:
  1. Session 1: encounter market, decide, record outcome, extract memory.
  2. Process restart (separate invocation).
  3. Session 2: same market, retrieve memory, decision changes.
- UI surfaces the before/after.

## Success criteria (from spec §28)

- "CEPID remembers what happened." — every meaningful experience is recorded.
- "CEPID remembers WHY it happened." — schema captures conditions, decision, expectation, outcome, lesson.
- "CEPID uses what it remembers to change what it does next." — proven by the §23 test and the demo.

The loop `EXPERIENCE → MEMORY → RETRIEVAL → BEHAVIOR CHANGE → NEW EXPERIENCE → UPDATED MEMORY` must be real, persistent, testable, and visible.
