# CEPID — memory.md

Engineering and product decisions worth remembering across sessions.

## Architecture

- **One MarketProvider interface**, three implementations. The agent does not know which it talks to. This was the central design call made during the Phase 0 research.
- **JSON file persistence** for V1. A SQLite layer would be premature; the spec's "persistent, testable, visible" bar is met by a clean repository interface backed by JSON files under `data/memory/`.
- **No LLM dependency in V1.** Architecture leaves seams (`DeterministicExperienceExtractor` / `LLMExperienceExtractor`, `DeterministicDecisionEngine` / `LLMDecisionEngine`) but the running system is fully deterministic. The product thesis must work without an LLM; if it doesn't, adding one later won't fix it.

## Market infrastructure

- **Limitless Exchange** is the real Base mainnet prediction market ($1B+ monthly volume, EIP-712 CLOB). It has NO testnet, NO Base Sepolia deployment, and NO sandbox mode. Source: their own docs.
- For Base Sepolia, we deploy a minimal self-hosted market contract (`contracts/CepidTestMarket.sol`) — constant-product AMM, YES/NO conditional tokens, USDC-collateralized, owner-resolved. Not a Limitless clone, not audited, demo-only.

## Memory design

- **Scars** are the most important memory type. A scar is created when a pattern's win rate ≤ 35% AND avg PnL ≤ -0.01 USDC AND ≥ 3 samples. Scars decay at 25% the rate of ordinary memories and receive a 0.15 retrieval score boost.
- **Importance** combines: magnitude (|pnl|), prediction error, surprise, novelty, pattern reinforcement. Range [0, 1]. Ordinary wins: low. Unexpected high-confidence losses: high.
- **Similarity** is a weighted sum across asset, timeframe, yesPrice, midpointDistance, volatility, momentum, liquidity, and timeRemainingBucket. Weights are tuned for the binary-options use case.
- **Patterns** are anchored on a coarse tag key (e.g. `BTC|15M|vol:high|mom:up|liq:medium|time:>10m`). They form when ≥ 3 experiences share a tag.
- **Memory strength** decays at 1% per hour (scars: 0.25%/hr). Memories do NOT get deleted — they decay to a minimum strength of 0.05, preserving the audit trail.

## Decision engine

- Base strategy produces a confidence via a deterministic midpoint rule.
- Decision engine computes memory influence: aligned-loss → -0.25 × weight, aligned-win → +0.10 × weight, etc. `weight = similarity × scar_boost × pattern_boost × strength`.
- Strong scars (loss + scar + high similarity) apply an additional -0.15 × similarity penalty.
- Final confidence below 0.5 → NO_TRADE.
- The decision engine NEVER bypasses the risk engine.

## Test discipline

- The test `memory changes the decision` is non-negotiable. It fails = product thesis broken = revert.
- The test `session 2 retrieves session 1 memory and changes decision` proves process-restart continuity.
- All tests use a temp directory created via `mkdtempSync` and clean up via `t.after(rmSync)`. No test writes to `./data/`.

## Configuration discipline

- No CLASH, no Somnia, no marketplace/competition/registry concepts anywhere.
- Env vars are `CEPID_*` and `AGENT_*` (only for the private key, since that's the universal name). No `CLASH_API_URL`, no `AGENT_AUTONOMY_*`, no `AGENT_NAME/DESCRIPTION/BUILDER`.
- Private key is loaded from env, never logged, never committed (`.env` is gitignored), never sent to any remote.
- The `.env.example` ships with placeholders; users must fill in their own.

## What we'd build next (not in V1)

1. Next.js frontend with the design system in `/home/user_uy_scutty/skills/ui-design/SKILL.md` (memory-first hierarchy, scan-then-detail, no crypto-dashboard slop, typography as the hero).
2. Real Base Sepolia deployment of the test market and end-to-end integration test.
3. LLM-backed `ExperienceExtractor` for richer lesson text. Optional.
4. Session-key / smart-account wallet implementation behind the existing `Wallet` interface.
5. SQLite-backed memory repository behind the same `MemoryRepository` interface for larger datasets.

## Open questions

- How aggressive should scar decay be in practice? 0.25× the ordinary rate is a starting point. Tunable.
- Should we ever suppress a memory outright (forgetting)? Current design: no. Minimum strength is 0.05; the memory is dormant but available. This preserves auditability and avoids accidentally forgetting a critical scar.
- Should the Base Sepolia test market be replaced with a Limitless order placed on a tiny live market? The Limitless docs explicitly suggest this. We've left both paths open.
