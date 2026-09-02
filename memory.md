# CEPID — memory.md

Engineering and product decisions worth remembering across sessions.
(For the restructure's binding decisions, architecture.md v2 is the source of
truth; this file records the why and the gotchas.)

## Product boundary (the repositioning, 01/02-SEP-26)

- **CEPID is memory infrastructure, not the trading agent.** The agent
  observes/reasons/decides/acts; CEPID remembers. The trading agent is the
  first consumer and exists to prove the thesis. Never let agent vocabulary
  (ETH, PnL, LONG) leak into the platform layer.
- The winning story: *the agent met the same situation twice and behaved
  differently the second time because CEPID remembered.* Every phase should
  make that more demonstrable.

## Substrate: Sibyl, and only Sibyl

- Sibyl Memory (`sibyl-memory-client`, Python-only; **no npm package exists**
  — verified: both plausible npm names 404) is the only persistence layer. A
  localhost FastAPI sidecar wraps `MemoryClient`; CEPID talks to it over HTTP
  behind the `MemoryRepository` interface. No JSON fallback — that's the
  hackathon gate, enforced by `load-bearing.test.ts`.
- Verified behaviors the design relies on: `tenant_id` accepts arbitrary
  strings and isolates reads/search/journal per tenant (probed: cross-tenant
  search returned zero); entity categories we need are all accepted; entities
  upsert on `(tenant, category, name)`; `search_entities(query, category=)`
  scopes FTS; free tier cap is exactly 5,242,880 bytes.
- **agentId → tenant_id is 1:1.** The API server derives the tenant from the
  authenticated API key; external callers never specify tenants. The sidecar
  takes a shared token and binds 127.0.0.1 only.

## The two-outcome lesson (the worst bug we shipped)

The old code used one `Outcome` type for both "what the market resolved to"
and "did the agent's trade win", then stored the market's value as the
trade's. Every `NO` trade was recorded inverted; a pattern claimed "100% win
rate" over negative PnL. **Rule: `marketOutcome` and `tradeOutcome` are
separate fields, never inferred from each other; PnL is independent and
authoritative.** A regression test pins the exact inverted case. When you see
one concept serving two meanings, split the type.

## Key hygiene

`app.ts` wrote `wallet: config.privateKey` into `data/events.json` — null only
because no key was configured. Rules now: keys exist only in the two env
vars that need them; never logged, serialized, or stored in any tier; a grep
lint test plus a runtime key-shape scan enforce it.

## Toolchain notes

- Foundry 1.7.1: `forge install` has **no `--no-commit` flag** (default
  behavior now); `libs` in foundry.toml must be a list (`libs = ["lib"]`);
  GitHub clones over this network are flaky — shallow `git clone --depth 1
  --branch <tag>` into `contracts/lib/` + strip `.git` is the reliable path;
  foundry.toml env interpolation uses `${VAR}` in `rpc_endpoints`.
- OZ v5.1.0 + forge-std v1.9.7 are the pinned contract deps (shallow-cloned;
  keep `contracts/lib/` and `contracts/cache/` out of git).
- Base Sepolia public RPC (`https://sepolia.base.org`) is live; USDC =
  `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (same default asset x402 uses
  on 84532 — one token serves trades and payments).
- x402: `@x402/core@2.24` + `@x402/evm@2.24` let us run an in-process
  `x402Facilitator` with a viem-backed `ExactEvmScheme` — no CDP API key
  needed. CDP's hosted facilitator is the fallback if the local path fights us.
- npm workspaces: tests must run per workspace (`npm test -w <name>`);
  `npm test --workspaces` from a subdirectory mis-resolves cwd.

## Decay/reinforcement parameters (carried from V1, still defaults)

- Importance: base 0.1 + magnitude 0.3 + predictionError 0.3 + surprise 0.15
  + novelty 0.1 + pattern-confirmation ±0.1/0.2; losses +0.1, wins −0.05.
- Decay 1%/hr (scars ×0.25), floor 0.05, never deleted. Reinforce +0.05 on
  validated-use; weaken −0.03 when contradicted. Scar: winRate ≤ 0.35 ∧
  losses ≥ 3 ∧ avgPnL ≤ −0.01. These are Phase-5 tuning surface, not law.

## What we'd build next (post-hackathon)

1. SQLite-native repository behind the same interface if Sibyl's 5 MB free cap
   ever binds (account binding is the alternative).
2. LLM lesson-extraction seam (`LLMExperienceExtractor`) — V1 stays
   deterministic.
3. Cross-agent pattern sharing (opt-in, explicit) — today isolation is absolute.
4. UI polish pass: relationship graph view for memories (§16 of the old design
   discussion, still wanted).
