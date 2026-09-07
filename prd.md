# CEPID — Product Requirements (v3, master-prompt cycle)

## What CEPID is

CEPID is a **behavioral decision and financial execution gate for AI agents
that spend money**. An agent proposes a financial action (e.g. buy YES on a
market, transfer USDC). CEPID captures the current situation, retrieves the
agent's past experiences from Sibyl Memory, and returns a deterministic,
machine-checkable verdict: **ALLOW** or **DENY**. ALLOW → the agent executes
on Base and the real txHash is stored. DENY → nothing executes, zero Base
transactions, and the UI shows the historical memory responsible.

Mental model: **AGENT = brain. CEPID = memory + gate.** The trading agent is
one consumer — the reference demo — not the product.

## The problem it solves

Agents make every financial decision as if the situation were new. They
repeat losing trades because nothing persists between sessions and nothing
stands between a bad idea and a signed transaction. CEPID gives the agent a
persistent behavioral memory of what happened in similar situations, plus a
deterministic permission boundary that stops repeats.

## Target users

1. **Agent developers** — register an agent, call `retrieve()` before acting,
   record decisions/outcomes, get gated behavior. SDK: `@cepid/client`.
2. **Judges / strangers (demo)** — open the UI, click "Run the demo", watch
   the two-run proof with real on-chain evidence. No CLI, no keys, no env.
3. **Operator (maintainer)** — runs sidecar + API + demo-runner + UI,
   funds the demo wallet, keeps the registry clean.

## Core product flow

```
REGISTER AGENT → PROPOSE ACTION → CAPTURE SITUATION → SIBYL RETRIEVES
→ GATE: ALLOW | DENY → (DENY: STOP) / (ALLOW: BASE EXECUTION → TXHASH
→ OUTCOME → SIBYL MEMORY)
```

## Agent behavior

The agent owns observation, reasoning, decisions, and actions. It consumes
CEPID through the same HTTP API + SDK as any external agent (no privileged
paths). On DENY it must set intent NO_TRADE, skip risk/placeOrder/resolution,
sign nothing, and still record the blocked decision so the influence chain
stays inspectable. The demo agent (`agents/demo-trader/src/app.ts`) does
exactly this.

## Memory behavior

Memories are contextual experiences: situation (domain, text, facets) +
action + decision + outcome + evidence (chain txHash). Kinds: experience,
pattern (3+ similar settled outcomes), scar (bad ≥ 3, badRate ≥ 0.55,
meanMagnitude ≤ −0.01, strength 0.7, decays at 25% rate). Retrieval ranks by
FTS rank × facet similarity × importance × strength × recency ×
log(1+retrievedCount) × scar/pattern boosts. Late outcomes backfill PENDING
rows (never overwrite settled rows). Tenant isolation is absolute:
agentId → Sibyl tenant 1:1, enforced server-side.

## ALLOW/DENY behavior

Deterministic `evaluateGate()` (no I/O, no randomness, no LLM): scar
(strength ≥ 0.6, signature match) → pattern (badRate ≥ 0.66, bad ≥ 3) →
bad-experience (valence bad, similarity ≥ 0.7) → ALLOW. Output: verdict,
reason, usedMemoryIds, blockingMemoryIds, blockedBy, matchedSignature.
Verdict rides the retrieve response, the retrieval row, the decision
record, and a `gate.denied` journal event. See `docs/constraint-gate.md`.

## Base execution behavior

Base Sepolia (testnet). Approved actions execute for real: `buyYes`/`buyNo`
on `CepidTestMarket`, resolver settles, txHash + blockNumber land in
`OutcomeRecord.evidence`, visible in the UI and checkable on Basescan.
DENY guarantees zero Base transactions for the proposed action (tested).

## Required user-facing functionality

Register agent (key shown once) · propose via retrieve · decision view
(ALLOW/DENY, reason, relevant + blocking memories) · memory explorer with
influence records · execution view (txHash + explorer link) · history /
activity journal · one-click "Run the demo" (full two-run proof, ~5 min).

## Non-goals

No LLM judge on the permission path · no user accounts/PII · no Morpho,
perpetuals, MCP, ERC-8004, extra chains, policy engine, token systems,
strategy engine · no JSON fallback store · no fake similarity, fake
hashes, or hardcoded verdicts.

## Acceptance criteria

- Scenario A: new action → ALLOW → real Base tx → stored/displayed txHash.
- Scenario B: later similar situation retrieves the negative experience →
  DENY → zero Base tx → UI shows the blocking memory.
- Scenario C: session restart → memory persists → behavior still changes.
- Memory deletion: substrate down → core function fails loudly
  (`MEMORY_SUBSTRATE_UNAVAILABLE`), never silently degrades.
- Full suite green; demo-runner proof green on a throwaway stack.

## Demo requirements

Session 1: ALLOW → Base tx → bad outcome → memory. Fresh session:
similar situation → DENY → zero tx. "This agent has done this before;
CEPID remembers; the situation resembles a previous bad experience;
CEPID blocks the action; no Base transaction." Sibyl → experience →
decision → ALLOW/DENY → execution-or-prevention, all inspectable.

## Current implementation status (07-SEP-26 audit)

Implemented and proven on-chain: gate, lifecycle, x402 paid retrieval,
demo agent, CepidTestMarket, UI (incl. one-click demo mode),
demo-runner service. **Known gap:** `demo-runner` throwaway-stack test
fails ("run 1 produced no on-chain trades" with the mock provider);
live on-chain proof previously succeeded. Uncommitted: API/runner bind
`0.0.0.0`. No services currently running. See `handoff.md`.
