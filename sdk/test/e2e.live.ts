/**
 * End-to-end test against a live CEPID API + Sibyl sidecar.
 *
 * Pre-requisites (this test does NOT start the stack):
 *   1. Sidecar listening on http://127.0.0.1:8765 with SIDECAR_TOKEN=dev
 *   2. CEPID API listening on http://127.0.0.1:8787, sidecar URL set
 *
 * Run with:
 *   CEPID_E2E=1 npx tsx sdk/test/e2e.live.ts
 *
 * What it proves (this is the dev-loop end-to-end, not the on-chain demo):
 *   - The SDK registers an agent against a real platform.
 *   - The SDK retrieves against a real sidecar and gets a real retrievalId.
 *   - recordDecision succeeds when memoryIds is a subset of the retrieval.
 *   - recordOutcome runs the lifecycle loop and the journal reflects it.
 *   - The influence edge is real: the decision row carries the retrievalId,
 *     and the retrieval's returnedMemoryIds is what the platform used.
 *
 * This is the path the user follows on first run; if it works here, the
 * docs in docs/integration.md are correct and the platform is shippable.
 */
import { CepidClient, CepidError } from '../src/index.js';

const API = process.env.CEPID_E2E_API ?? 'http://127.0.0.1:8787';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

async function main() {
  console.log(`# E2E against ${API}`);
  console.log('');

  // 1. Liveness
  const ready = await fetch(`${API}/readyz`);
  assert(ready.status === 200, `readyz returns 200 (got ${ready.status})`);
  const readyBody = (await ready.json()) as { ok: boolean; service: string; version: string };
  assert(readyBody.ok === true, 'readyz reports ok=true');
  assert(readyBody.service === 'cepid-api', 'readyz service is cepid-api');

  // 2. Register an agent
  const reg = await CepidClient.register(API, {
    name: `E2E ${new Date().toISOString()}`,
    description: 'Live end-to-end test of the dev loop',
  });
  assert(typeof reg.agent.id === 'string' && reg.agent.id.startsWith('agent-'), 'agent id has the expected shape');
  assert(typeof reg.apiKey === 'string' && reg.apiKey.startsWith('cepid_'), 'api key has the expected shape');
  assert(typeof reg.keyPrefix === 'string', 'key prefix returned');
  assert(typeof reg.keyLast4 === 'string', 'key last4 returned');
  console.log(`  agent.id = ${reg.agent.id}`);

  // 3. First retrieve (no memory yet → empty result, real retrievalId)
  const cepid = new CepidClient({ baseUrl: API, apiKey: reg.apiKey });
  const r1 = await cepid.retrieve({
    situation: {
      domain: 'e2e',
      text: 'user asked for a refund on a free-tier charge',
      facets: { tier: 'free', region: 'eu', amount_usdc: 12 },
    },
  });
  assert(typeof r1.retrievalId === 'string' && r1.retrievalId.startsWith('ret-'), 'retrievalId is well-formed');
  assert(Array.isArray(r1.memories), 'memories is an array');
  assert(r1.memories.length === 0, `first retrieve is empty (got ${r1.memories.length})`);
  console.log(`  retrievalId = ${r1.retrievalId}`);

  // 4. Record an experience so retrieval on a similar situation finds it
  const exp = await cepid.recordExperience({
    situation: {
      domain: 'e2e',
      text: 'user asked for a refund on a free-tier charge',
      facets: { tier: 'free', region: 'eu', amount_usdc: 12 },
    },
    decision: {
      action: 'refund',
      confidenceBase: 0.5,
      confidenceFinal: 0.5,
      memoryInfluence: 0,
      memoryIds: [],
      reasoning: ['first encounter, no memory to consult'],
    },
    outcome: {
      result: 'refund_approved',
      valence: 'bad',                                  // a refund that lost money
      magnitude: -12,
      metrics: { refund_usdc: 12 },
    },
    source: 'e2e',
  });
  const memId = (exp.memory as { id: string }).id;
  assert(typeof memId === 'string' && memId.startsWith('mem-'), 'memory id is well-formed');
  console.log(`  memory = ${memId}`);

  // 5. Retrieve again with a *similar* situation. The product story is
  // "the agent met the same situation twice and behaved differently
  // the second time because CEPID remembered." A *similar* text is what
  // the retriever is for; identical text would be a self-match.
  const r2 = await cepid.retrieve({
    situation: {
      domain: 'e2e',
      text: 'user requested a refund on a free-tier charge',
      facets: { tier: 'free', region: 'eu', amount_usdc: 12 },
    },
  });
  assert(r2.memories.length >= 1, `second retrieve finds the prior memory (got ${r2.memories.length})`);
  const foundIds = r2.memories.map((m) => m.id);
  assert(foundIds.includes(memId), 'the prior memory is in the retrieval results');

  // 6. recordDecision: cite only memories that were actually returned
  const citedIds = foundIds.slice(0, 1);
  const dec = await cepid.recordDecision({
    retrievalId: r2.retrievalId,
    memoryIds: citedIds,
    situation: {
      domain: 'e2e',
      text: 'second encounter — there should be one memory now',
      facets: { phase: 'after' },
    },
    action: 'do_nothing',
    confidenceBase: 0.5,
    confidenceFinal: 0.3,
    memoryInfluence: -0.2,
    reasoning: ['prior memory pulled confidence down'],
  });
  assert(typeof dec.decision.id === 'string' && dec.decision.id.startsWith('dec-'), 'decision id is well-formed');
  assert(dec.usedMemoryIds.length === 1, `usedMemoryIds reflects platform-side intersection (got ${dec.usedMemoryIds.length})`);
  assert(dec.usedMemoryIds[0] === memId, 'used memory id matches the cited id');

  // 7. recordOutcome → lifecycle loop runs server-side
  const out = await cepid.recordOutcome({
    decisionId: dec.decision.id,
    outcome: {
      result: 'refund_approved',
      valence: 'bad',
      magnitude: -12,
      metrics: { refund_usdc: 12 },
    },
  });
  assert((out.outcome as { id: string }).id.startsWith('out-'), 'outcome id is well-formed');
  console.log(`  outcome = ${(out.outcome as { id: string }).id}`);

  // 8. INFLUENCE_NOT_SUPPORTED: citing a memory the retrieval did not return
  let caught = false;
  try {
    await cepid.recordDecision({
      retrievalId: r2.retrievalId,
      memoryIds: ['mem-does-not-exist'],
      situation: {
        domain: 'e2e',
        text: 'fabricating influence',
        facets: { phase: 'fraud' },
      },
      action: 'fraud',
      confidenceBase: 0.5,
      confidenceFinal: 0.5,
    });
  } catch (e) {
    if (e instanceof CepidError && e.status === 400 && e.code === 'INFLUENCE_NOT_SUPPORTED') {
      caught = true;
    }
  }
  assert(caught, 'INFLUENCE_NOT_SUPPORTED is returned for fabricated influence');

  // 9. Activity feed shows the chain
  const act = (await cepid.activity()) as { events: Array<{ type: string; at: string; [k: string]: unknown }> };
  const types = act.events.map((e) => e.type);
  assert(types.includes('memory.retrieved'), 'journal has memory.retrieved events');
  assert(types.includes('decision.recorded'), 'journal has decision.recorded events');
  assert(types.includes('outcome.recorded'), 'journal has outcome.recorded events');

  // 10. history() shows the experience
  const hist = (await cepid.history()) as { memories: Array<{ id: string }>; patterns: unknown[]; scars: unknown[] };
  assert(hist.memories.some((m) => m.id === memId), 'history contains the experience we recorded');

  // 11. Tenant isolation: a second agent must not see the first agent's memories
  const reg2 = await CepidClient.register(API, { name: `E2E-isolated ${Date.now()}`, description: 'isolation test' });
  const cepid2 = new CepidClient({ baseUrl: API, apiKey: reg2.apiKey });
  const r3 = await cepid2.retrieve({
    situation: {
      domain: 'e2e',
      text: 'user asked for a refund on a free-tier charge',
      facets: { tier: 'free', region: 'eu', amount_usdc: 12 },
    },
  });
  assert(
    !r3.memories.some((m) => m.id === memId),
    'second agent does NOT see the first agent\'s memory (tenant isolation)',
  );
  const hist2 = (await cepid2.history()) as { memories: Array<{ id: string }> };
  assert(
    !hist2.memories.some((m) => m.id === memId),
    'second agent\'s history does NOT include the first agent\'s memory',
  );

  // 12. /v1/agents lists both registered agents (open route)
  const list = (await (await fetch(`${API}/v1/agents`)).json()) as { agents: Array<{ id: string }> };
  const ids = list.agents.map((a) => a.id);
  assert(ids.includes(reg.agent.id), 'list includes the first agent');
  assert(ids.includes(reg2.agent.id), 'list includes the second agent');

  // 13. UNKNOWN retrieval id → 404 RETRIEVAL_NOT_FOUND
  let notFound = false;
  try {
    await cepid.recordDecision({
      retrievalId: 'ret-does-not-exist',
      memoryIds: [],
      situation: { domain: 'x', text: 'y', facets: {} },
      action: 'x',
      confidenceBase: 0.5,
      confidenceFinal: 0.5,
    });
  } catch (e) {
    if (e instanceof CepidError && e.status === 404 && e.code === 'RETRIEVAL_NOT_FOUND') notFound = true;
  }
  assert(notFound, 'unknown retrieval id returns 404 RETRIEVAL_NOT_FOUND');

  console.log('');
  console.log('# E2E PASSED');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
