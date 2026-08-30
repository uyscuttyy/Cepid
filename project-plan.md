# CEPID — Project Plan

## Phases

### PHASE 0 — Research [DONE]
- Limitless Exchange on Base mainnet identified as the real production path.
- Limitless has no testnet, so a self-hosted minimal CTF market is required for the reproducible demo.
- Architecture: MarketProvider interface with three implementations.
- Report delivered to the user before any code was written.

### PHASE 1 — Finalize provider interfaces [DONE]
- `src/market/provider.ts` defines the interface.
- `src/market/limitless-provider.ts` talks to Limitless via fetch + viem EIP-712.
- `src/market/base-sepolia-test-provider.ts` talks to the self-hosted test market.
- `src/market/mock-provider.ts` for tests only.
- `src/market/limitless-orders.ts` isolates the cryptographic signing path.

### PHASE 2 — Market data layer [DONE]
- All three providers implement `listActiveMarkets`, `getMarket`, `getOrderBook`, `getPosition`, `getTradeHistory`, `getResolution`, `placeOrder`.
- Limitless uses its REST API; no contract addresses invented.
- Base Sepolia uses minimal ABI for the test market.

### PHASE 3 — Memory core [DONE]
- `memory/importance.ts` — deterministic importance scoring (magnitude, prediction error, surprise, novelty, pattern reinforcement)
- `memory/similarity.ts` — weighted similarity over market context
- `memory/repository.ts` — JSON-backed persistent store with `MemoryRepository` interface
- `memory/retriever.ts` — ranked retrieval with scar/pattern boosts
- `memory/linker.ts` — pattern detection across experiences
- `memory/scars.ts` — scar lifecycle
- `memory/decay.ts` — strength weakening over time
- `memory/evaluator.ts` — decision+outcome → Experience
- 8 tests pass (importance, similarity, persistence, patterns, scars, decay, reinforce).

### PHASE 4 — Memory-informed decision engine [DONE]
- `decision/engine.ts` — combines base strategy + memory influence.
- Strong scars apply an extra penalty that can veto the trade.
- The thesis test (`memory changes the decision`) PASSES.

### PHASE 5 — Risk layer [DONE]
- `risk/engine.ts` enforces per-order cap, session cap, session order limit, market active/expired, price bounds, min order size.
- 5 risk tests pass.

### PHASE 6 — Wallet + execution [DONE]
- `market/limitless-orders.ts` provides EIP-712 signing + submission.
- `market/base-sepolia-test-provider.ts.placeOrder` builds + sends USDC approvals + buy calls.
- Preview is the default. Execute requires explicit flags.
- `Wallet` interface is implicit in the MarketProvider path; structured so a future session-key signer slots in without changing the agent.

### PHASE 7 — Trade recording → memory creation [DONE]
- `app.ts` orchestrator runs the full loop: discover → context → retrieve → decide → risk → execute → record → store → relink.
- The `session-restart.test.ts` proves that the loop survives a process restart.

### PHASE 8 — Backend API [NEXT]
- The orchestrator exposes structured output. The Next.js API routes can either call the orchestrator directly (in-process) or read the JSON files.
- A simple `GET /api/agent/state` → sessions, current decision, recent memories.
- `GET /api/memory/experiences`, `/api/memory/patterns`, `/api/memory/scars`.
- `GET /api/markets` → current market snapshot from the configured provider.

### PHASE 9 — Next.js frontend [NEXT]
- App Router + TypeScript + CSS modules.
- No Tailwind by default; use a small design-token file.
- Pages per the spec §17-§25: Overview, Market, Decision, Memory, Similar Memories, Timeline, History, Performance, Agent, Wallet, Execution States.
- Apply the UI design skill in /home/user_uy_scutty/skills/ui-design/.

### PHASE 10 — Connect frontend to real backend data [NEXT]
- Replace any local mock fixtures with API calls.
- Loading / empty / error states are first-class.

### PHASE 11 — Base Sepolia integration test [NEXT]
- Deploy `CepidTestMarket.sol` to Base Sepolia.
- Set `CEPID_TEST_MARKET_ADDRESS`.
- Run a real end-to-end preview with the test market.

### PHASE 12 — Polish + demo prep [NEXT]
- Two-session reproduction: scripted CLI invocations that produce a real before/after.
- Update README + handoff with the actual demo commands.

## What's done (V1 foundation)

✓ 15/15 unit + integration tests passing
✓ Clean `npx tsc --noEmit`
✓ Three market providers wired through one interface
✓ Memory loop end-to-end: experience → store → retrieve → influence decision → veto
✓ Process-restart memory survival
✓ Scars, patterns, decay
✓ Risk engine never bypassed
✓ No CLASH / Somnia / marketplace concepts anywhere

