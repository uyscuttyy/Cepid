# CEPID — Documentation

Public surface of the CEPID memory platform. The product is a single
HTTP service at `/v1/*` plus an SDK, `@cepid/client`. The substrate
(Sibyl Memory) is a localhost sidecar the platform depends on — there
is no fallback.

## Start here

- **[`agents.md`](agents.md)** — what an agent is, how identity and
  isolation work, how keys are issued and revoked. Read this first.
- **[`api.md`](api.md)** — every public route, the request and response
  shape, and the error codes a client can encounter.
- **[`integration.md`](integration.md)** — install `@cepid/client`, make
  the first `cepid.retrieve()` call, and pay the $0.01 x402 fee on
  retrieval. The end-to-end flow from a stranger's machine.

## What CEPID is, in one paragraph

CEPID is the memory layer for an autonomous agent. The agent observes
its world, calls `cepid.retrieve(situation)` to ask "what do you
remember that's like this?", reasons over the returned memories, makes
a decision, then calls `cepid.recordDecision(...)` and later
`cepid.recordOutcome(...)`. CEPID stores the experience, reinforces
memories that proved useful, decays the rest, forms patterns and scars
when repetitions emerge, and meters retrieval against an x402 payment
boundary.

The platform never decides anything. The agent owns observation,
reasoning, decisions, and actions. CEPID owns remembering.

## The non-negotiables (architecture.md §3)

These are the rules the implementation enforces and the tests prove:

- **Sibyl is the only substrate.** Killing the sidecar fails every core
  operation with `503 MEMORY_SUBSTRATE_UNAVAILABLE`. There is no JSON
  fallback, by decision.
- **agentId → tenant_id is 1:1.** The platform derives the tenant from
  the authenticated API key. External callers never specify tenants.
- **Influence edges are real.** A decision that cites a retrieval
  must cite memories that retrieval actually returned. Fabricated
  influence is `400 INFLUENCE_NOT_SUPPORTED`.
- **Private keys stay in the agent.** The platform never asks for, never
  stores, never returns a private key. A `assertNoKeyMaterial` boundary
  check fires at every API entry point.
