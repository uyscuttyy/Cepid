# CEPID

**Persistent memory infrastructure for autonomous agents.**

An agent — any agent — observes its world, decides, and acts. CEPID remembers
what happened: the situations, the decisions, the outcomes, the lessons. When
the agent next encounters something similar, CEPID retrieves the experiences
that matter and hands them over *before* the decision. The agent is the brain.
**CEPID is the memory.**

Built for the [Sibyl Labs hackathon](https://hack.sibyllabs.org): Sibyl Memory
is the persistence substrate, and it is load-bearing — remove it and CEPID
loses its memory entirely. There is no fallback store.

```
AGENT (brain)                CEPID (memory)                 SIBYL (substrate)
 observe    ─┐               ┌─ rank experiences             SQLite + FTS
 reason     ─┼─ query/paid ─▶│  form patterns & scars  ────▶ per-agent tenants
 decide     ─┘               │  reinforce what helped
 act ─┐                      └─ decay the rest
      ├─ outcome reported ──▶ record experience
      └─ on Base Sepolia      (real on-chain trades in the demo)
```

## What's in this repo

| Workspace | Package | What it is |
| --- | --- | --- |
| `cepid/` | `@cepid/server` | **The product.** Generic memory schema, retrieval & ranking, importance, patterns, scars, decay, lifecycle, agent registry, HTTP API v1, x402 payment gate |
| `sidecar/` | — | Python facade over `sibyl-memory-client`; localhost-only; zero business logic |
| `sdk/` | `@cepid/client` | `cepid.retrieve()` / `recordDecision()` / `recordOutcome()` with the x402 buyer loop built in |
| `agents/demo-trader/` | `@cepid/agent-demo-trader` | **The demo consumer.** A deterministic trading agent on Base Sepolia that uses CEPID exactly like an external agent would |
| `contracts/` | — | `CepidTestMarket.sol` — minimal on-chain YES/NO market (Foundry, Base Sepolia) |
| `ui/` | — | Next.js dashboard: memory, agents, influence, activity, demo, developers |

The trading agent is **replaceable and demonstrates the product** — it is not
the product. Swap in a support agent or an ops agent and CEPID works unchanged:
the memory schema (`domain`, `text`, `facets`, …) is generic from day one.

## The load-bearing claim, made checkable

```bash
# Kill the Sibyl sidecar and every core endpoint fails with
# MEMORY_SUBSTRATE_UNAVAILABLE — retrieval, recording, history, all of it.
npm test -w @cepid/server   # includes load-bearing.test.ts
```

The demo proves memory changes behavior, not just that memory exists:

1. **Run 1** — fresh agent session. No relevant memory. The agent trades LONG
   on Base Sepolia with real USDC. The market resolves against it. CEPID
   stores the experience — situation, decision, reasoning, outcome, txHash.
2. **Run 2** — new process, same kind of situation. The agent pays $0.01
   (x402) to query CEPID. CEPID retrieves the losses + the pattern they formed.
   The agent's confidence drops; it declines the trade. The decision row
   references the retrieval row — that edge is the evidence, never an
   assertion. The used memories get reinforced by the outcome; a second,
   isolated agent sees none of it.

## Quick start

```bash
npm install                 # TS workspaces
# Python sidecar (Sibyl substrate)
cd sidecar && uv venv && uv pip install -e . && uvicorn sibyl_sidecar.main:app --port 8765
# Contracts (optional, for the on-chain demo)
cd contracts && forge build
npm test -w @cepid/server   # engine + isolation + load-bearing tests
```

Full setup, API reference, and the demo walkthrough: [`docs/`](docs/) and
[`architecture.md`](architecture.md).

## Documentation

- [`architecture.md`](architecture.md) — the restructure plan, boundaries, schema, phases (source of truth)
- [`prd.md`](prd.md) — product requirements
- [`project-plan.md`](project-plan.md) — phase log and progress
- [`handoff.md`](handoff.md) — current state
- [`memory.md`](memory.md) — engineering decisions worth remembering

## Safety

- Private keys live only in the demo agent's and the payment receiver's
  environments — never logged, never serialized, never in memory, never in API
  responses. Regression tests enforce this.
- Agent memory isolation is server-enforced (API key → tenant). One agent can
  never read another's memories.
- The demo market handles trivial testnet amounts only.

MIT license. See [LICENSE](LICENSE).
