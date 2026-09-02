# CEPID — Product Requirements (v2)

## What CEPID is

CEPID is **persistent memory infrastructure for autonomous agents**. An agent
— any agent — connects to CEPID, stores what happens to it, and retrieves the
experiences that matter before its next decision. The agent owns observation,
reasoning, decisions, and actions. CEPID owns remembering: what happened, what
worked, what failed, what it cost, and what to recall next time.

Mental model: **AGENT = brain. CEPID = memory.** The trading agent is one
consumer — the reference demo — not the product.

## The core loop (the product is this loop)

```
observe → query CEPID (paid, x402) → retrieve from Sibyl → rank → return
→ agent reasons with memories → decides → acts (on Base, in the demo)
→ outcome → record outcome → validate used memories → reinforce/decay
→ next decision behaves differently
```

Memory must be **load-bearing**: remove the Sibyl substrate and CEPID's core
function fails. No JSON fallback exists. This is a hard product property, not
an integration detail.

## Requirements

1. **Generic memory schema** — `domain`, `text`, `facets`, `importance`,
   `source`, `agentId`, `retrievedCount`, `strength`, relationships. Trading is
   the first *profile*; nothing in the platform layer knows about ETH, PnL, or
   LONG/SHORT.
2. **Agent isolation** — every agent gets a `tenant_id`; one agent can never
   retrieve another's memories. Enforced server-side (API key → tenant), never
   trusted from clients.
3. **Real ranking** — FTS relevance × facet similarity × importance × strength
   × recency × retrieval history × scar/pattern boosts. Deterministic,
   documented, tested. Never "newest first".
4. **Full lifecycle** — `retrieved → used → outcome → validated →
   reinforced/weakened`. Retrieval rows record which memories fed which
   decisions (the influence edge). Counts are real; nothing is invented.
5. **Separate outcomes** — `marketOutcome` (what the environment resolved to)
   vs `tradeOutcome` (whether the agent's action was right), never inferred
   from each other. PnL independent and authoritative.
6. **Paid retrieval** — `POST /v1/memories/query` costs $0.01 testnet USDC via
   x402 (real payment, real facilitator, real Usage rows). Writes and
   registration are free — CEPID wants the data.
7. **Demo agent parity** — the demo trading agent consumes CEPID through the
   same HTTP API + SDK as any external agent. No privileged paths.
8. **Honest UI** — every number on screen comes from real API data. Empty
   states where empty. Demo data labelled as demo data.

## Non-goals

- No LLM dependency (deterministic V1; seams exist for later).
- No user accounts/PII — the agent is the identity.
- No generic crypto-dashboard aesthetics; no fabricated anything.

## Success criteria (the hackathon demo, all real)

A fresh agent session: encounters a situation → pays x402 → CEPID retrieves
the losing experience + pattern from Sibyl → the agent's confidence visibly
drops → it declines the trade → on the earlier run (also real) it took that
trade and lost on-chain. A second, isolated agent sees none of it. Every step
evidenced: retrieval row, decision row referencing it, Base Sepolia txHash,
settled payment, reinforced memory.
