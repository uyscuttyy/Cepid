# CEPID — Product Requirements

## What

CEPID (Continuity Experience & Persistent Institutional Decision-memory) is a trading agent whose decisions are informed by experiential memory that persists across process restarts.

## Why

A normal trading agent: market → analyze → decide → trade → forget.
A learning agent: market → analyze current conditions → recall similar past conditions → compare previous decisions/outcomes → adjust decision → trade → record conditions + decision + outcome → create new memory.

The product thesis: an agent should not experience every market as if it were seeing it for the first time.

## Core requirements

1. **Memory is the product.** Every meaningful experience produces a memory. Memories capture the conditions surrounding the decision, not just the result.
2. **Memory is selective.** Ordinary wins are remembered weakly. Unexpected losses, repeated losses under similar conditions, and pattern-confirming outcomes are remembered strongly.
3. **Memory changes behavior.** The retrieved memories participate in the decision. A relevant negative memory can veto a trade the base strategy would otherwise make.
4. **Memory is persistent.** Process restart must not lose memories. Sessions are tracked across runs.
5. **Memory is explainable.** Every decision produces a structured explanation: base recommendation, memories retrieved, memory influence, final confidence, final decision.

## Non-goals (V1)

- No LLM dependency. Deterministic only. Architecture leaves room for `LLMExperienceExtractor` later.
- No marketplace, competition, ranking, or agent registry concepts.
- No fabricated performance numbers, fake AI explanations, or invented trades.

## Success criteria

- "CEPID remembers what happened" — every decision produces a memory record.
- "CEPID remembers WHY it happened" — schema captures conditions, decision, expectation, outcome, lesson.
- "CEPID uses what it remembers to change what it does next" — proven by the `memory changes decision` test and visible in the demo.

## Scope (V1)

- Decision engine: deterministic strategy + memory retrieval with scar/pattern boosts
- Memory: importance, similarity, repository, retrieval, patterns, scars, decay
- Risk: per-order, per-session, market validity
- Wallet: local viem signer; interface allows future session keys / smart accounts
- Markets: Limitless on Base mainnet + a self-hosted minimal market on Base Sepolia + a mock for tests
- UI: not in V1; CLI + JSON output. Next.js UI is the next phase.
- Frontend: deferred to a follow-on phase (see project-plan.md)

## Out of scope

- LLM-based explanation
- Multi-agent / social memory
- Cross-chain portfolio
- Mobile UI
- Production settlement / real PnL accounting
