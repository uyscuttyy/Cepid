# CEPID — Handoff

Updated: 02-SEP-26 (end of Phase 2).

## What CEPID is now

Persistent **memory infrastructure for autonomous agents**, persisted by
Sibyl Memory and only Sibyl Memory — there is no fallback store, by
decision and by code. The trading agent is a demo consumer. Source of
truth: `architecture.md` (v2).

## Current state — Phase 2 (Sibyl substrate) complete

```
cepid/    @cepid/server  17/17 tests · generic schema, engine, SibylRepository
sidecar/  FastAPI + sibyl-memory-client 0.8.0 · 7/7 pytest · THE substrate
sdk/      @cepid/client (Phase 4)
agents/demo-trader  8/8 tests · runs on SibylRepository
contracts/  Foundry · CepidTestMarket compiles · deploy script ready
```

The gate is machine-checked: `cepid/test/sibyl-substrate.test.ts` kills the
sidecar and asserts every core operation throws `MEMORY_SUBSTRATE_UNAVAILABLE`.
Restart survival and cross-tenant isolation are proven against real sidecar
processes on scratch DBs.

## How to run (dev)

```bash
# 1. Sidecar (terminal 1)
cd sidecar && uv venv && uv pip install -e . pytest httpx
SIDECAR_TOKEN=dev uv run uvicorn sibyl_sidecar.main:app --port 8765

# 2. Tests (terminal 2) — they boot their own sidecars on scratch DBs
npm test -w @cepid/server
npm test -w @cepid/agent-demo-trader
(cd sidecar && uv run --active pytest tests/ -q)

# 3. Demo agent preview (mock market, real substrate)
CEPID_SIDECAR_URL=http://127.0.0.1:8765 SIDECAR_TOKEN=dev \
  npm run agent:preview -w @cepid/agent-demo-trader
```

Env: `CEPID_MEMORY_DB` (sidecar DB path, default
`~/.sibyl-memory/cepid-memory.db`), `SIDECAR_TOKEN`, `SIDECAR_PORT`,
`CEPID_SIDECAR_URL` (agent → sidecar).

## Transitional (delete in the phase noted)

- Demo agent still calls engine modules **in-process** through
  `@cepid/server` imports — Phase 4 rewires it to `@cepid/client` over HTTP
  only (the parity requirement). The sidecar env vars it reads today
  (`CEPID_SIDECAR_URL`, `SIDECAR_TOKEN`) become API-key config.
- `agents/demo-trader/src/persistence/events.ts` — local run-events file.
  Kept for the key-leak regression target until Phase 4 moves the trail
  fully into the platform journal, then deleted.
- Root `tsconfig.json` — obsolete; remove when UI stops cross-importing.

## Known correctness debt → all cleared in Phases 1–2 (verified by tests)

Outcome inversion, key persistence, dead risk placeholder — fixed and
regression-tested. Limitless ESM `require()` bug is fixed in the moved
source; the mainnet path remains unexercised by choice.

## Next steps

1. **Phase 3** — Agent registry: Agent + hashed API keys in the platform
   tenant (`cepid-platform`), key→tenant middleware, isolation tests at the
   registry level.
2. Phase 4 — HTTP API v1 + `@cepid/client`; demo agent becomes a pure SDK
   consumer (no in-process engine imports).
3. Phases 5–10 per `project-plan.md`.
