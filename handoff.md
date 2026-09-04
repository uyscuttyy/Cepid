# CEPID — Handoff

Updated: 04-SEP-26 (end of Phase 8 — UI on the live API).

## What CEPID is now

Persistent **memory infrastructure for autonomous agents**, persisted by
Sibyl Memory and only Sibyl Memory — there is no fallback store, by
decision and by code. The trading agent is a demo consumer. Source of
truth: `architecture.md` (v2).

## Current state — Phase 8 (UI restructure) complete

```
cepid/      @cepid/server        tsc clean · engine + registry + HTTP API v1 + x402
sidecar/    FastAPI + sibyl-memory-client 0.8.0 · 7/7 pytest · THE substrate
sdk/        @cepid/client        tsc clean · the SDK every agent uses, ours included
agents/demo-trader              pure consumer over HTTP — no engine imports
contracts/  Foundry              CepidTestMarket compiles · deploy script ready
ui/         @cepid-ui (Next.js)  9/9 client tests · tsc clean · next build clean
                                reconnected to the live /v1/* API
```

The load-bearing claim remains mechanical: `cepid/test/sibyl-substrate.test.ts`
kills the sidecar and asserts every core operation throws
`MEMORY_SUBSTRATE_UNAVAILABLE`. Restart survival and cross-tenant isolation
are proven against real sidecar processes on scratch DBs.

## Phase 8 (this commit) — what changed

The UI was the only piece of the restructure that hadn't landed. It was
reading the **old** demo-agent JSON store at `${CEPID_DATA_DIR}/data/*.json`
and broke when the restructure wiped that directory. It is now wired to
the live `/v1/*` API through a typed client.

- New: `ui/src/lib/cepid.ts` — typed client (fetch-injectable for tests).
  Surfaces `MEMORY_SUBSTRATE_UNAVAILABLE` and other server errors as
  `CepidClientError`. 9 unit tests pin the contract.
- New: `ui/test/cepid-client.test.ts` — RED→GREEN over the contract.
- New: `ui/src/app/api/register/route.ts` — server proxy for the
  registration form (the key never leaves the platform).
- Rewritten pages (against the generic `MemoryRecord` schema, not trading):
  Overview, Memories (list + detail), Agents (list + detail), Activity,
  Demo, Developers.
- New nav per architecture §13: Overview / Memories / Agents / Activity /
  Demo / Developers. The dead `/trades` link and broken `Section`/`Stat`
  imports are gone.
- Deleted: orphaned `Header.tsx`/`Footer.tsx`/`view.ts`, the JSON-
  pass-through `/api/agent|/api/events|/api/memory/*|/api/performance|
  /api/sessions` routes, and every page that imported missing primitives.
- `next build` and `tsc --noEmit` are green. The `ui/` workspace is now in
  the monorepo root. The build warning about multiple lockfiles is
  silenced by pinning `outputFileTracingRoot` in `next.config.mjs`.
- `CEPID_DATA_DIR` is no longer consulted anywhere.

## How to run (dev)

```bash
# 1. Sidecar (terminal 1)
cd sidecar && uv venv && uv pip install -e . pytest httpx
SIDECAR_TOKEN=dev uv run uvicorn sibyl_sidecar.main:app --port 8765

# 2. CEPID API (terminal 2)
CEPID_SIDECAR_URL=http://127.0.0.1:8765 SIDECAR_TOKEN=dev \
  npx tsx cepid/src/api/main.ts     # listens on 127.0.0.1:8787

# 3. UI (terminal 3)
cd ui
CEPID_API_URL=http://127.0.0.1:8787 CEPID_API_KEY=<a key> npm run dev
# open http://localhost:3000

# 4. Tests
npm test                                # all workspaces
npm test -w cepid-ui                    # 9/9 client tests
npm run typecheck                       # all four workspaces
```

To exercise the dashboard without a key, omit `CEPID_API_KEY` — the
registry and liveness views still load; private pages show a clear
"set CEPID_API_KEY" empty state.

Env: `CEPID_MEMORY_DB` (sidecar DB), `SIDECAR_TOKEN`, `SIDECAR_PORT`,
`CEPID_SIDECAR_URL` (CEPID → sidecar), `CEPID_API_URL` (UI → CEPID),
`CEPID_API_KEY` (UI → CEPID, optional for the public surface).

## Next steps

1. Phase 10 — two-run demo per architecture §15 against the live stack.
2. Submission — README, 2–5 min demo video, two build-in-public posts.

## Known limitations (carried)

- Server tests (`npm test -w @cepid/server`) require `uvicorn` on PATH —
  environmental, not changed by Phase 8.
- The demo agent's local run-events file (`agents/demo-trader/src/persistence/events.ts`)
  is still listed in the architecture as Phase-5-deletable. The platform
  journal is now the source of truth; the file is dead weight. Drop it
  in the Phase 9 boundary.
- No background decay scheduler; decay ticks on the API path.

## What this handoff no longer says

The previous handoff (02-SEP-26) said "Phase 4 complete, Phase 5 next."
That was correct at the time but stale by the time it was read. The
phases are now real: Phases 0–8 are done. Read `project-plan.md` for
the current log.
