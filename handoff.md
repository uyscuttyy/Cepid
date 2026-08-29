# CEPID — Handoff

## Project

CEPID (Continuity Experience & Persistent Institutional Decision-memory) — a trading agent that accumulates experiential memory and uses it to change future decisions. Submission for the Sibyl Memory Hackathon.

## Current state (audit complete, before restructure)

Repo at `/home/user_uy_scutty/cepid` was scaffolded for a different project (binary-market agent against Somnia testnet + DreamDEX + a CLASH registration/activity layer). No commits yet, no `node_modules`, no `.env`.

## Audit summary

| File | Classification | Notes |
| --- | --- | --- |
| `src/market-data.ts` | REFACTOR | Replace Somnia chain + DreamDEX SDK with Base testnet provider. Keep the `MarketSnapshot` shape. |
| `src/wallet.ts` | REFACTOR | Clean viem abstraction. Swap RPC to Base Sepolia. Drop Somnia chain import. |
| `src/persistence.ts` | REFACTOR | Generic JSON file store. Becomes one of several repositories. |
| `src/strategy.ts` | REFACTOR | Keep `DeterministicStrategy`. Decouple from CLASH/Somnia naming. |
| `src/risk.ts` | REFACTOR | Keep rule shape. Extend per spec (slippage, gas, balance, exposure). |
| `src/policy.ts` | REFACTOR | Rename `ExecutionPolicy` → `SessionBudget`. Drop `AGENT_AUTONOMY_*` env names. |
| `src/types.ts` | KEEP | Extend with memory, session, decision types. |
| `src/clash.ts` | REMOVE | CLASH registration/activity not part of CEPID. |
| `src/index.ts` | REPLACE | Rewrite as orchestrator + CLI. Current file mixes registration, execution, and output. |
| `src/config.ts` | REPLACE | Strip `clashApiUrl`, agent identity, integration URL. Add network config. |
| `package.json` | REPLACE | Drop `@somnia-chain/markets-sdk`. Add `serve` script for UI. |
| `.env.example` | REPLACE | Drop CLASH/AGENT_AUTONOMY_*. Add CEPID network + session vars. |
| `README.md` | REPLACE | Full CEPID README. |
| `test/core.test.ts` | REPLACE | CEPID test suite, including the "memory changes decision" proof. |

## Key decisions made in audit

- **No Somnia / no DreamDEX.** The existing SDK is coupled to a market format and a registration layer that don't fit CEPID. Replace with a viem-only Base Sepolia path plus a deterministic mock market provider for V1.
- **No paid LLM dependency.** Architecture leaves room (`DeterministicExperienceExtractor` / `LLMExperienceExtractor`, `DeterministicDecisionEngine` / `LLMDecisionEngine`) but the running system is fully deterministic.
- **JSON file persistence for V1.** A single SQLite database would be premature; the spec's "real, persistent, testable, visible" bar is met by a clear repository interface backed by a JSON file under `data/`.
- **No framework UI.** Vanilla HTML/CSS/JS dashboard served by a tiny Node static server. Cleaner typography, no build step, no React-on-crypto slop.

## Open questions deferred to execution

- Real Base testnet market source. For V1 the mock provider is honest and labelled. A live integration comes through the same `MarketProvider` interface.
- Wallet session-key / smart-account evolution. The `Wallet` interface is shaped to accept these later; V1 ships a local viem signer with a private key from env.

## Next phase

PHASE 2 — Clean restructure. Remove legacy code, build the new module tree per the audit table.
