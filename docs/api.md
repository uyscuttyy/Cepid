# API

The public HTTP surface. One service, one port (default
`http://127.0.0.1:8787`), one base path: `/v1/*`. Open routes are
`/v1/agents/register`, `/healthz`, and `/readyz`; everything else
requires `Authorization: Bearer cepid_…` (see `agents.md`).

The substrate (Sibyl Memory sidecar) is localhost-only. The platform
talks to it over HTTP. If the sidecar is down, every protected route
returns `503 MEMORY_SUBSTRATE_UNAVAILABLE`. There is no fallback.

## Conventions

- All bodies are JSON. Request bodies require `Content-Type: application/json`.
- Timestamps are ISO 8601 strings in UTC.
- Numeric fields that may be absent are `null`, not `0`. The UI and
  the SDK render `null` as an em dash.
- Every protected route is `Content-Type: application/json` on
  response. There are no redirects.

## Errors

Every error response has the shape:

```json
{ "error": "MACHINE_CODE", "message": "human sentence" }
```

| Status | Code                            | Meaning |
|--------|----------------------------------|---------|
| 400    | `VALIDATION`                     | malformed body or missing required field |
| 400    | `INFLUENCE_NOT_SUPPORTED`        | decision cited a memory not returned by the cited retrieval |
| 401    | `UNAUTHORIZED`                   | missing / invalid / revoked key |
| 402    | `PAYMENT-REQUIRED`               | route is x402-gated and no payment header was sent (see x402) |
| 402    | `SETTLEMENT_FAILED`              | payment was attached but settlement on chain failed |
| 404    | `NOT_FOUND`                      | route or resource does not exist |
| 404    | `RETRIEVAL_NOT_FOUND`            | `retrievalId` does not exist in the caller's tenant |
| 404    | `DECISION_NOT_FOUND`             | `decisionId` does not exist in the caller's tenant |
| 413    | (no code)                        | request body > 1 MB |
| 500    | `INTERNAL`                       | unexpected error; check platform logs |
| 503    | `MEMORY_SUBSTRATE_UNAVAILABLE`   | Sibyl sidecar is unreachable — memory function is offline |

The substrate-down code is special: it is the *expected* failure mode
when the sidecar dies. The UI reads this code to show an honest
"memory layer down" state rather than a fake error.

## Open routes

### `GET /healthz`

Liveness. Returns 200 with `{ ok: true, service, version }` if the
process is up. Does not check the substrate. Cheap; safe to poll.

```json
{ "ok": true, "service": "cepid-api", "version": "v1" }
```

### `GET /readyz`

Readiness. Returns 200 if the API is up *and* a platform-tenant
metadata read against the substrate succeeds. Returns 503 with
`{ ok: false, substrate: "down" }` if the substrate is unreachable.

Use this in deploys: `/healthz` says "process exists",
`/readyz` says "memory function is live".

### `POST /v1/agents/register`

Open. See `agents.md` for the full body. Returns the one-time key.

## Protected routes

All require `Authorization: Bearer cepid_…`.

### `POST /v1/memories/query`

**x402-gated** — costs `$0.01` USDC on Base Sepolia. See the x402
section below. The SDK's `cepid.retrieve()` wraps the 402→sign→retry
loop when a payer account is configured.

Request:

```json
{
  "situation": {
    "domain": "support",
    "text": "user asked for a refund on a free-tier charge",
    "facets": { "tier": "free", "region": "eu", "amount_usdc": 12 }
  },
  "limit": 10,
  "minSimilarity": 0.0
}
```

`limit` is clamped to `[1, 50]`. `minSimilarity` filters by the
facet+text similarity (final score may be higher after boosts).

Response (200):

```json
{
  "retrievalId": "ret-…",
  "memories": [
    {
      "id":               "mem-…",
      "situation":        { "domain": "...", "text": "...", "facets": {} },
      "action":           "...",
      "outcome":          { "result": "...", "valence": "good", "metrics": {}, "observedAt": "..." } | null,
      "importance":       0.6,
      "strength":         0.7,
      "retrievedCount":   4,
      "surprising":       false,
      "createdAt":        "...",
      "similarity":       0.82,
      "isScar":           false,
      "isPattern":        false,
      "retrievalScore":   0.88
    }
  ]
}
```

Side effects: a `RetrievalRecord` is written to the agent's tenant
(this is the influence edge that decisions reference), and a
`memory.retrieved` event is appended to the journal. Both are
append-only.

On a successful paid retrieval, a `usage.settled` event is also
appended with the txHash, the route, and the price.

### `POST /v1/memories`

Record an experience. The platform stores the situation, decision,
and outcome, then recomputes patterns and scars for the agent's
tenant.

Request:

```json
{
  "situation":  { "domain": "...", "text": "...", "facets": {} },
  "decision":   { "action": "...", "confidenceBase": 0.5, "confidenceFinal": 0.4, "memoryInfluence": -0.1, "memoryIds": [], "reasoning": [] },
  "outcome":    { "result": "...", "valence": "good", "metrics": {}, "marketOutcome": "...", "tradeOutcome": "...", "evidence": { "chain": "base-sepolia", "txHash": "0x..." }, "observedAt": "..." },
  "source":     "sdk",
  "decisionId": "dec-…"
}
```

`outcome.valence` must be `good | bad | neutral`. The platform never
infers valence from `metrics.pnl` or any other field — your agent
declares it. `marketOutcome` and `tradeOutcome` are independent
optional fields; never inferred from each other.

Response (201):

```json
{ "memory": { "id": "mem-…", "agentId": "agent-…", "kind": "experience", "...": "..." } }
```

### `POST /v1/decisions`

Record a decision. **If you cite a retrieval, the platform enforces
that the cited memories came from that retrieval.** A citation of
memories not in `returnedMemoryIds` is `400 INFLUENCE_NOT_SUPPORTED`
and the decision is not stored.

Request:

```json
{
  "retrievalId":    "ret-…",
  "memoryIds":      ["mem-…", "mem-…"],
  "situation":      { "domain": "...", "text": "...", "facets": {} },
  "action":         "...",
  "confidenceBase":   0.5,
  "confidenceFinal":  0.3,
  "memoryInfluence": -0.2,
  "reasoning":      ["retrieved 3 losses on similar refund requests"]
}
```

Response (201):

```json
{
  "decision":     { "id": "dec-…", "retrievalId": "ret-…", "...": "..." },
  "usedMemoryIds": ["mem-…", "mem-…"]
}
```

`usedMemoryIds` is the intersection of `memoryIds` you sent and the
retrieval's `returnedMemoryIds`. The platform's `markMemoryUsed`
bumps `retrievedCount` on each used memory — counts are real, not
inferred.

### `POST /v1/outcomes`

Record an outcome. Triggers the lifecycle loop: the platform walks
decision → retrieval → cited memories and reinforces or weakens
each used memory based on whether it agreed with the outcome.

Request:

```json
{
  "decisionId": "dec-…",
  "outcome": {
    "result":         "refund_approved",
    "valence":        "good",
    "magnitude":      12.0,
    "metrics":        { "refund_usdc": 12 },
    "marketOutcome":  "...",
    "tradeOutcome":   "...",
    "evidence":       { "chain": "base-sepolia", "txHash": "0x..." },
    "observedAt":     "..."
  }
}
```

Response (201):

```json
{
  "outcome":    { "id": "out-…", "...": "..." },
  "validation": { "adjusted": [ { "memoryId": "mem-…", "before": 0.7, "after": 0.75, "rule": "reinforced" } ] }
}
```

### `GET /v1/memories/:id`

Fetch a single memory by id. Tenant-scoped: a 404 is returned if the
memory exists but belongs to a different agent.

```json
{ "memory": { "id": "mem-…", "agentId": "agent-…", "...": "..." } }
```

### `GET /v1/agents/history`

The agent's full memory dump: experiences (most recent 100),
patterns, scars. Used by the dashboard Memories page.

```json
{
  "agentId":  "agent-…",
  "memories": [ { "id": "mem-…", "...": "..." } ],
  "patterns": [ { "id": "pat-…", "...": "..." } ],
  "scars":    [ { "id": "scar-…", "...": "..." } ]
}
```

### `GET /v1/activity`

The journal feed (most recent 100 events). Includes
`memory.retrieved`, `decision.recorded`, `outcome.recorded`,
`usage.settled`, `agent.registered`, `agent.revoked`, and the
registration-time row.

```json
{
  "agentId": "agent-…",
  "events":  [ { "type": "memory.retrieved", "at": "...", "retrievalId": "ret-…", "query": "...", "returned": 7 } ]
}
```

### `GET /v1/usage`

The agent's settled x402 payments.

```json
{
  "usage": [ { "type": "usage.settled", "at": "...", "agentId": "...", "route": "/v1/memories/query", "price": "$0.01", "payTo": "0x...", "txHash": "0x...", "payer": "0x..." } ],
  "count": 1,
  "note":  "...optional..."
}
```

### `GET /v1/agents`

Open (registry listing). Returns every active agent.

```json
{ "agents": [ { "id": "agent-…", "name": "...", "...": "..." } ] }
```

## x402 (paid retrieval)

`POST /v1/memories/query` is the only paid route. The price is set
at boot by the `CEPID_QUERY_PRICE` env var (default `$0.01` USDC on
Base Sepolia). The platform runs an in-process `x402Facilitator` —
no CDP API key needed. The asset is the Base Sepolia testnet USDC
(`0x036CbD53842c5426634e7929541eC2318f3dCF7e`), the same token the
demo market uses.

When the route is paid, an unpaid request gets:

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: x402 ...
PAYMENT-REQUIRED: <base64 challenge>
```

The SDK's `buildPayingFetch(payerPrivateKey, rpcUrl)` returns a
`fetch` wrapper that decodes the challenge, signs a payment, retries
the request, and verifies the settlement before returning the
payload. See [`integration.md`](integration.md) for the full call.

On settlement, the platform appends a `usage.settled` event with the
txHash. The UI reads these from `/v1/usage` and shows the count and
last txHash on the platform surface.

## What the platform guarantees

- **Tenant isolation is mechanical.** A test
  (`api.test.ts` "cross-agent isolation over HTTP") proves it for
  every list and detail endpoint.
- **Influence edges are real.** A test
  ("influence fraud is rejected — cited memories must come from the
  cited retrieval") proves the `INFLUENCE_NOT_SUPPORTED` rule.
- **The substrate is load-bearing.** A test
  (`sibyl-substrate.test.ts`) kills the sidecar and asserts every
  core endpoint returns `MEMORY_SUBSTRATE_UNAVAILABLE`.

The test surface is in `cepid/test/`. The `load-bearing.test.ts` is
the gate.
