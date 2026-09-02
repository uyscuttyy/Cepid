# CEPID — Handoff

Updated: 02-SEP-26 (end of Phase 0 unless tests say otherwise).

## What CEPID is now

Persistent **memory infrastructure for autonomous agents**. The trading agent
is the demo consumer, not the product. Sibyl Memory (Python) is the persistence
substrate and must remain load-bearing. Source of truth for all of this:
`architecture.md` (v2).

## Current state — Phase 0 (monorepo scaffold) complete

Structure (npm workspaces):

```
cepid/            @cepid/server   — memory schema, ranking, lifecycle, registry, API (building)
sidecar/          Python Sibyl facade (Phase 2)
sdk/              @cepid/client (Phase 4)
agents/demo-trader @cepid/agent-demo-trader — old agent, demoted to demo consumer
contracts/        Foundry: CepidTestMarket.sol + Deploy.s.sol (compiles)
ui/               Next.js dashboard (restructure in Phase 8)
docs/             developer docs (Phase 9)
```

Verified working:

- `forge build` in `contracts/` — CepidTestMarket compiles against
  OpenZeppelin v5.1.0 + forge-std v1.9.7 (shallow-cloned into `lib/`; the
  `--no-commit` flag no longer exists in Foundry 1.7, installs are no-commit
  by default).
- `npx tsc --noEmit` clean in `@cepid/server` and `@cepid/agent-demo-trader`
  after the git-mv restructure + import fixups (42 patches, engine imports
  `@cepid/server` via package name now).
- LICENSE (MIT) added — hackathon requires an OSI license.
- `data/` wiped (approved: outcome-corrupted, demo-only, never committed);
  `persistence/events.ts` deleted (Sibyl journal replaces it in Phase 2);
  `test.txt` and tracked `ui/tsconfig.tsbuildinfo` removed; `.gitignore`
  fixed (`**/*.tsbuildinfo`, python noise).

Transitional (delete in the phase noted):

- `agents/demo-trader/src/config/load.ts` — re-exports `@cepid/server`'s
  loader (Phase 4: agent gets its own loader).
- `agents/demo-trader/src/persistence/events.ts` — agent-local event file
  (Phase 2: Sibyl journal; Phase 4: gone entirely).
- `JsonMemoryRepository` inside `cepid/src/repository/repository.ts` — the only
  remaining JSON store (Phase 2: SibylRepository replaces it; interface kept).
- Root `tsconfig.json` — obsolete once all workspaces typecheck on their own;
  UI still needs `src/` gone before it's removed. Root `package.json` now
  only carries workspaces + aggregate scripts.

## Known correctness debt (fixed in Phase 1, tracked here so it's not lost)

1. `cepid/src/core/domain.ts` still holds BOTH generic and trading types —
   Phase 1 splits them (trading → demo agent) and introduces
   `marketOutcome` vs `tradeOutcome` as separate fields.
2. `agents/demo-trader/src/app.ts` still writes `wallet: config.privateKey`
   into events (the key-leak bug) and still stores the market's outcome as
   the trade's outcome (the inversion bug). Both die in Phase 1 with
   regression tests.
3. `risk/engine.ts` dead `spentThisSession` placeholder — Phase 1.
4. Limitless provider ESM `require()` bug — Phase 1 (moved, fixed, unexercised).

## Next steps (in order)

1. **Phase 1** — generic core schema + outcome split + key-leak prohibition
   tests. The demo agent keeps working through the transition.
2. **Phase 2** — Python sidecar + SibylRepository + restart-survival +
   load-bearing test; remove JsonMemoryRepository.
3. Phase 3+ per `project-plan.md`.

## How to run right now

```bash
npm install
npm run typecheck -ws --if-present
npm test -w @cepid/server           # engine tests
npm test -w @cepid/agent-demo-trader
cd contracts && forge build
```

The old `npm run agent:preview` path still works from
`agents/demo-trader/` (mock network) but reads/writes the agent's data dir;
it gets replaced by the SDK-driven loop in Phase 4. The UI is mid-redesign
and does not build yet — that's Phase 8, intentionally not touched until the
product surface exists.
