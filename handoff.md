# CEPID — Handoff

## Project

CEPID (Continuity Experience & Persistent Institutional Decision-memory) — a trading agent that accumulates experiential memory and uses it to change future decisions. Submission for the Sibyl Memory Hackathon.

## Current state

V1 foundation is complete and tested. 15/15 tests pass; clean typecheck; CLI runs end-to-end.

```
$ npm test
# pass 15
# fail 0

$ npx tsc --noEmit
(clean)

$ CEPID_NETWORK=mock npm run agent:preview
{
  "state": "DECISION_MADE",
  "session": { ... "memoryIds": ["exp-..."] },
  "intent": { "direction": "YES", "baseConfidence": 0.6, ... },
  "decision": { "memoryInfluence": 0, "finalConfidence": 0.6, ... }
}
```

## What's done

- All CLASH / Somnia / marketplace / competition / arena code removed.
- New architecture laid out under `src/`: config, market (3 providers), memory (8 modules), decision, strategy, risk, sessions, persistence, app orchestrator, CLI.
- Memory core: importance scoring, similarity, repository, retrieval, patterns, scars, decay, evaluator.
- Decision engine: base strategy + memory influence + strong-scar penalty → final decision.
- Risk engine: per-order, per-session, market validity, price bounds.
- Limitless Exchange on Base mainnet (real EIP-712 + REST integration).
- Self-hosted Base Sepolia test market contract (`contracts/CepidTestMarket.sol`).
- Mock provider for tests.
- Sessions persist across process restarts.
- All 15 tests pass, including:
  - `memory changes the decision (the central product thesis)` — the same market produces YES without memory and NO_TRADE with memory.
  - `end-to-end: session 2 retrieves session 1 memory and changes decision` — proves memory survives a complete process restart.
  - patterns, scars, persistence, decay, similarity, importance, risk.

## What is NOT done (deferred phases)

- **Next.js frontend** (Phase 8/9) — the spec §17-§25 UI requirements. The backend is API-shaped; the frontend is a separate phase. Design system to follow `/home/user_uy_scutty/skills/ui-design/SKILL.md`.
- **Real Base Sepolia integration test** (Phase 11) — requires deploying `CepidTestMarket.sol` and funding it. The code path is complete and the provider compiles; only the on-chain deploy + run is missing.
- **Demo polish** (Phase 12) — scripted two-session reproduction as a single command. The test does this programmatically; a `npm run demo` wrapper is a small addition.

## Next concrete steps

1. **Frontend.** Set up Next.js (App Router) in a sibling directory, consume the orchestrator's output, design per the UI skill.
2. **Base Sepolia integration test.** Deploy the test market contract, set `CEPID_TEST_MARKET_ADDRESS`, run a real preview.
3. **Demo script.** Wrap the two-session reproduction in a single `npm run demo` that runs deterministically.

## Decisions worth knowing

See `memory.md` for the full set. Highlights:

- One MarketProvider interface, three implementations (Limitless / Base Sepolia test / mock). Agent does not know which it talks to.
- JSON file persistence for V1. Repository interface allows a future SQLite layer.
- No LLM dependency. Architecture leaves seams but V1 is fully deterministic.
- Scars decay at 25% of ordinary rate; never deleted (audit trail).
- Risk engine is never bypassed by memory.

## How to run

```bash
# Install
npm install

# Tests
npm test

# Preview a single decision (no transactions)
CEPID_NETWORK=mock npm run agent:preview

# Execute (requires explicit flags)
CEPID_NETWORK=mock npm run agent:execute -- --confirm-approval --confirm-order

# For Base Sepolia (after deploying contracts/CepidTestMarket.sol):
CEPID_NETWORK=base-sepolia npm run agent:preview
```

## Repo structure

```
.
├── README.md            # Quick start + architecture
├── prd.md               # Product requirements
├── project-plan.md      # Phases and progress
├── handoff.md           # This file
├── memory.md            # Engineering decisions worth remembering
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── contracts/
│   ├── CepidTestMarket.sol
│   └── README.md
├── src/
│   ├── app.ts                    # Orchestrator
│   ├── cli/run-session.ts        # CLI
│   ├── config/{load,types}.ts
│   ├── market/{provider,limitless-provider,limitless-orders,base-sepolia-test-provider,mock-provider,index}.ts
│   ├── memory/{importance,similarity,repository,retriever,linker,scars,decay,evaluator}.ts
│   ├── decision/engine.ts
│   ├── strategy/{base-strategy,context}.ts
│   ├── risk/engine.ts
│   └── sessions/repository.ts
└── test/
    ├── memory-core.test.ts
    ├── memory-influence.test.ts    # THE thesis test
    ├── risk.test.ts
    └── session-restart.test.ts
```
