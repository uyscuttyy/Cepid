# CEPID — Handoff

Updated: 02-SEP-26 (end of Phase 2).

## What CEPID is now

Persistent **memory infrastructure for autonomous agents**, persisted by
Sibyl Memory and only Sibyl Memory — there is no fallback store, by
decision and by code. The trading agent is a demo consumer. Source of
truth: `architecture.md` (v2).

## Current state — Phase 4 (API + SDK) complete

```
cepid/    @cepid/server  26/26 tests · tsc clean · engine + registry + HTTP API v1
sidecar/  FastAPI + sibyl-memory-client 0.8.0 · 7/7 pytest · THE substrate
sdk/      @cepid/client · tsc clean · the SDK every agent uses, ours included
agents/demo-trader  8/8 tests · PURE SDK consumer over HTTP — no engine imports
contracts/  Foundry · CepidTestMarket compiles · deploy script ready
```

The parity requirement is met: the demo agent talks to CEPID through the same
routes, the same SDK, and the same key flow as any external agent. Influence
claims are validated server-side against retrieval rows — fabricated
influence is a 400.

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

# 3. CEPID API (terminal 2)
CEPID_SIDECAR_URL=http://127.0.0.1:8765 SIDECAR_TOKEN=dev \
  npx tsx cepid/src/api/main.ts     # listens on 127.0.0.1:8787

# 4. Register an agent + run the demo agent (terminal 3)
curl -s localhost:8787/v1/agents/register -H 'content-type: application/json' \
  -d '{"name":"Demo Trading Agent","description":"CEPID reference consumer"}'
# → set CEPID_API_URL=http://127.0.0.1:8787 CEPID_API_KEY=cepid_… and run:
npm run agent:preview -w @cepid/agent-demo-trader
```

Env: `CEPID_MEMORY_DB` (sidecar DB path, default
`~/.sibyl-memory/cepid-memory.db`), `SIDECAR_TOKEN`, `SIDECAR_PORT`,
`CEPID_SIDECAR_URL` (agent → sidecar).

## Transitional (delete in the phase noted)

- `agents/demo-trader/src/persistence/events.ts` — the agent's local run
  events (key-leak regression target). Phase 5 can drop it once the outcome
  validation loop reads purely from the platform journal.
- Root `tsconfig.json` — obsolete; remove when UI stops cross-importing.

## Known correctness debt → all cleared in Phases 1–2 (verified by tests)

Outcome inversion, key persistence, dead risk placeholder — fixed and
regression-tested. Limitless ESM `require()` bug is fixed in the moved
source; the mainnet path remains unexercised by choice.

## Next steps

1. **Phase 5** — lifecycle: outcome validation walks decision → retrieval →
   used memories and reinforces (+0.05) or weakens (−0.03); decay ticks on
   the API path; strength changes become visible in /v1/memories.
2. Phase 6 — Base Sepolia for real: deploy CepidTestMarket (~10-min expiry),
   fund the two throwaway wallets (user funds via faucet), demo trade with
   txHash into outcome evidence.
3. Phases 7–10 per `project-plan.md`.
