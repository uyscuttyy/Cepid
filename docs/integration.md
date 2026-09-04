# Integration

A stranger's guide to running an agent against a live CEPID instance.
At the end of this you have a registered agent, an API key, and a
working `cepid.retrieve()` call against a live platform.

## 0. Prerequisites

- A CEPID API URL (default port `8787`). For local dev:
  `http://127.0.0.1:8787`. For the hosted instance, ask the operator.
- A `viem` account on Base Sepolia funded with a few cents of testnet
  USDC. This is the **payer** for the x402 retrieval fee, not the
  platform's identity — your agent identity is the API key you mint
  in step 2.

If you don't have USDC, the free Coinbase Base Sepolia faucet is the
fastest path; the agent's `CEPID_PAYMENT_WALLET` operator typically
also funds payer accounts on request during a demo.

## 1. Install the SDK

```bash
npm install @cepid/client
```

The SDK is a thin TypeScript client around the `/v1/*` HTTP surface.
It has zero runtime dependencies. If you want x402-paid retrieval
without writing payment code, also install:

```bash
npm install viem @x402/fetch @x402/evm
```

These are needed for `buildPayingFetch()` only. The SDK is
side-effect-free without them.

## 2. Register an agent

```ts
import { CepidClient } from '@cepid/client';

const { agent, apiKey, keyPrefix, keyLast4 } = await CepidClient.register(
  'http://127.0.0.1:8787',
  { name: 'My First Agent', description: 'A short sentence about what it does.' },
);

console.log(agent.id);     // agent-…
console.log(apiKey);       // cepid_…  — STORE THIS. Shown once, never again.
console.log(keyPrefix);    // first 6 chars of the key (for display)
console.log(keyLast4);     // last 4 chars of the key (for display)
```

Save `apiKey` to your agent's environment as `CEPID_API_KEY` and
immediately forget the variable in your code. If you lose it, register
a new agent.

The dashboard's **Developers** page at `/developers` does the same
thing through a form. It exists so a human operator can mint a key
without writing code.

## 3. First call — without payment (free routes)

The free routes are: `recordExperience`, `recordDecision`,
`recordOutcome`, `getMemory`, `history`, `activity`. Construct the
client and call:

```ts
const cepid = new CepidClient({
  baseUrl: 'http://127.0.0.1:8787',
  apiKey: process.env.CEPID_API_KEY!,
});

// Empty: this is the very first call. The history is [].
const hist = await cepid.history();
console.log(hist);
```

The `history()` call maps to `GET /v1/agents/history`. The response
is `{ agentId, memories, patterns, scars }` — all empty arrays on a
fresh agent.

## 4. Record a first experience

```ts
await cepid.recordExperience({
  situation: {
    domain: 'support',
    text: 'user asked for a refund on a free-tier charge',
    facets: { tier: 'free', region: 'eu', amount_usdc: 12 },
  },
  decision: {
    action: 'refund',
    confidenceBase: 0.5,
    confidenceFinal: 0.5,
    memoryInfluence: 0,
    memoryIds: [],
    reasoning: ['no prior memory to consult — first encounter'],
  },
  outcome: {
    result: 'refund_approved',
    valence: 'good',
    magnitude: 12,
    metrics: { refund_usdc: 12 },
    observedAt: new Date().toISOString(),
  },
});
```

The platform stores the memory, recomputes patterns, and appends
events to the journal. The next `history()` call returns one row.

## 5. The retrieve() + decision() + outcome() loop

The defining flow. Your agent asks CEPID for similar past
experiences, decides, and reports what happened.

```ts
// 5a — retrieve (this is the x402-gated route)
const { retrievalId, memories } = await cepid.retrieve({
  situation: {
    domain: 'support',
    text: 'user asked for a refund on a free-tier charge',
    facets: { tier: 'free', region: 'eu', amount_usdc: 12 },
  },
  limit: 10,
});

// 5b — reason over what was returned. The agent owns this step.
// For this example, imagine memories contains one prior loss
// (a "refund" that was reversed). Pull the ids and reason.
const usedIds = memories.slice(0, 3).map((m) => m.id);

// 5c — record the decision, citing the retrieval. This is the
// influence edge. Fabricated influence is rejected with 400.
const { decision, usedMemoryIds } = await cepid.recordDecision({
  retrievalId,
  memoryIds: usedIds,
  situation: {
    domain: 'support',
    text: 'user asked for a refund on a free-tier charge',
    facets: { tier: 'free', region: 'eu', amount_usdc: 12 },
  },
  action: 'refund',
  confidenceBase: 0.5,
  confidenceFinal: 0.3,        // pulled down by the retrieved loss
  memoryInfluence: -0.2,      // negative = memory moved it down
  reasoning: [
    'retrieved 1 prior loss on a refund in similar conditions',
    'reducing confidence from 50% to 30%',
  ],
});

// 5d — after the action runs, record the outcome. The platform
// walks decision → retrieval → used memories and reinforces
// or weakens each.
await cepid.recordOutcome({
  decisionId: decision.id,
  outcome: {
    result: 'refund_approved',
    valence: 'good',
    magnitude: 12,
    metrics: { refund_usdc: 12 },
    observedAt: new Date().toISOString(),
  },
});
```

`usedMemoryIds` is what the platform computed as the intersection
of your `memoryIds` and the retrieval's `returnedMemoryIds`. The
`markMemoryUsed` call that ran server-side bumped each used memory's
`retrievedCount`. Both are real, not inferred.

## 6. Paying for retrieval (x402)

Without a payer, `cepid.retrieve()` throws
`CepidError(402, "PAYMENT-REQUIRED", "...")`. To pay, swap the
global `fetch` for one that handles the 402→sign→retry loop:

```ts
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { CepidClient, buildPayingFetch } from '@cepid/client';

const account = privateKeyToAccount(process.env.AGENT_PAYER_KEY as `0x${string}`);
const wallet = createWalletClient({ account, chain: baseSepolia, transport: http() });

const payingFetch = await buildPayingFetch(account, 'https://sepolia.base.org');

const cepid = new CepidClient({
  baseUrl: 'http://127.0.0.1:8787',
  apiKey: process.env.CEPID_API_KEY!,
  payer: wallet, // future: SDK uses this to scope the payer account
});

// In a future SDK release, this triggers the buyer loop automatically.
// Today, pass the payingFetch explicitly via the internal transport.
const result = await cepid.retrieve({ situation: { domain: 'support', text: '…', facets: {} } });
```

`buildPayingFetch()` is the seam — it returns a `fetch` you can swap
into any HTTP client. The 402 challenge is decoded, an EIP-3009
payment is signed against the same USDC the platform quotes, the
request is retried, and the settlement is verified before the
response body is returned. Failed settlements return
`402 SETTLEMENT_FAILED` and the platform does **not** run the
retrieval logic — the integrity check is the point.

**Do not** use your mainnet signer here. The payer key signs USDC
authorizations; treat it with the same care as a hot wallet.

## 7. What "live" looks like

A live integration looks like this from the outside:

1. The agent boots, loads `CEPID_API_URL` and `CEPID_API_KEY`.
2. It registers (one-time, the key is stored permanently).
3. Each decision: `cepid.retrieve()` → reason → `cepid.recordDecision()`.
4. After the action: `cepid.recordOutcome()`.
5. The platform's lifecycle loop reinforces the memories that
   helped and weakens the ones that misled.
6. The dashboard's **Memories** page shows the experience, the
   retrieval that informed it, the decision row that references
   the retrieval, and the outcome that closed the loop. None of
   it is narrated — it is derived from the rows.

The acceptance test for the product is in `architecture.md` §15:
two runs, second one different from the first because of memory.
A working integration is one where that happens with your agent.

## Troubleshooting

- **`401 UNAUTHORIZED`** — the key is missing, malformed, or revoked.
  Re-register.
- **`400 INFLUENCE_NOT_SUPPORTED`** — you cited memories the cited
  retrieval did not return. Make sure `memoryIds` is a subset of
  `memories.map(m => m.id)` from the previous `retrieve()`.
- **`404 RETRIEVAL_NOT_FOUND`** — the `retrievalId` does not exist
  in your tenant. The retrieval must come from your own `retrieve()`
  call.
- **`503 MEMORY_SUBSTRATE_UNAVAILABLE`** — the Sibyl sidecar is down.
  The platform is up; the memory function is not. Restore the sidecar
  and the platform recovers automatically. This is the
  load-bearing test in action.
- **`402 PAYMENT-REQUIRED`** on `retrieve()` — the route is x402-gated
  and no payment header was sent. Use `buildPayingFetch()`.

## Where the source lives

- `cepid/src/api/server.ts` — route definitions, request parsing,
  response shapes, error mapping. The source of truth for the
  contract in `api.md`.
- `sdk/src/index.ts` — the SDK's class and static methods, the
  `CepidError` shape, and `buildPayingFetch()`. The source of
  truth for the integration steps above.
- `cepid/src/core/domain.ts` — the generic `MemoryRecord`,
  `DecisionRecord`, `OutcomeRecord`, `MemoryOutcome` types. The
  fields returned by every endpoint.
- `cepid/test/api.test.ts` — the API contract tests. If your
  integration is failing in a way the docs don't cover, the test
  probably covers it.
