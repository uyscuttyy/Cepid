/**
 * HTTP API v1 tests — the product boundary, end to end.
 *
 * Boots a REAL sidecar + REAL API server on scratch ports and exercises the
 * exact surface an external agent gets:
 *   register → query → record decision (with influence edge) → record
 *   outcome → history — plus the security properties that must hold over
 *   HTTP: unauthorized is rejected, agents cannot read each other's
 *   memories, influence claims that don't match the retrieval are refused,
 *   and a dead substrate surfaces as 503 MEMORY_SUBSTRATE_UNAVAILABLE.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SibylRepository,
  AgentRegistry,
  type SibylRepository as Repo,
} from '@cepid/server';
import { startSidecar, repoFor } from './helpers/sidecar.js';
import { startApi, type CepidApi } from '../src/api/server.js';

const AGENT_A_NAME = 'External Trading Agent';
const situation = {
  domain: 'prediction-market',
  text: 'ETH high volatility, liquidity declining, price falling, considering LONG',
  facets: { asset: 'ETH', volatility: 'high', liquidity: 'declining', momentum: 'down' },
};

interface ApiCtx {
  api: CepidApi;
  apiPort: number;
  baseUrl: string;
  repo: Repo;
}

async function withApi(fn: (ctx: ApiCtx) => Promise<void>): Promise<void> {
  const fx = await startSidecar();
  const repo = repoFor(fx);
  const registry = new AgentRegistry(repo);
  const apiPort = 22000 + Math.floor(Math.random() * 8000);
  const api = await startApi({ repo, registry, port: apiPort });
  try {
    await fn({ api, apiPort, baseUrl: `http://127.0.0.1:${apiPort}`, repo });
  } finally {
    await api.close();
    await fx.dispose();
  }
}

async function registerAgent(baseUrl: string, name: string): Promise<{ agentId: string; key: string }> {
  const res = await fetch(`${baseUrl}/v1/agents/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, description: `${name} — API test` }),
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { agent: { id: string }; apiKey: string };
  return { agentId: body.agent.id, key: body.apiKey };
}

const authed = (key: string) => ({
  'content-type': 'application/json',
  authorization: `Bearer ${key}`,
});

test('api: healthz/readyz', async () => {
  await withApi(async ({ baseUrl }) => {
    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    const ready = await fetch(`${baseUrl}/readyz`);
    assert.equal(ready.status, 200);
    const readyBody = (await ready.json()) as { ok: boolean };
    assert.equal(readyBody.ok, true);
  });
});

test('api: unauthorized requests are rejected', async () => {
  await withApi(async ({ baseUrl }) => {
    const noAuth = await fetch(`${baseUrl}/v1/memories/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ situation }),
    });
    assert.equal(noAuth.status, 401);

    const badKey = await fetch(`${baseUrl}/v1/memories/query`, {
      method: 'POST',
      headers: authed('cepid_totally_invalid'),
      body: JSON.stringify({ situation }),
    });
    assert.equal(badKey.status, 401);
  });
});

test('api: full consumer flow — register, earn memory, retrieve, decide, outcome', async () => {
  await withApi(async ({ baseUrl }) => {
    // 1) Register (open) — key shown once.
    const { agentId, key } = await registerAgent(baseUrl, AGENT_A_NAME);

    // 2) First query on an empty store: retrieval row exists, zero memories.
    const q1 = await fetch(`${baseUrl}/v1/memories/query`, {
      method: 'POST', headers: authed(key),
      body: JSON.stringify({ situation }),
    });
    assert.equal(q1.status, 200);
    const r1 = (await q1.json()) as { retrievalId: string; memories: unknown[] };
    assert.ok(r1.retrievalId.startsWith('ret-'), 'a retrieval row is always written');
    assert.equal(r1.memories.length, 0);

    // 3) Record an experience (the agent reporting what happened).
    const exp = await fetch(`${baseUrl}/v1/memories`, {
      method: 'POST', headers: authed(key),
      body: JSON.stringify({
        situation,
        decision: { action: 'LONG', confidenceBase: 0.78, confidenceFinal: 0.78, memoryInfluence: 0, memoryIds: [], reasoning: ['first run'] },
        outcome: {
          result: 'LOSS', valence: 'bad', magnitude: -0.6, metrics: { pnl: -0.6 },
          marketOutcome: 'NO_WON', tradeOutcome: 'LOSS',
        },
        source: 'api-test',
      }),
    });
    assert.equal(exp.status, 201);
    const { memory: mem1 } = (await exp.json()) as { memory: { id: string } };

    // 4) Second query now finds it, with similarity + score.
    const q2 = await fetch(`${baseUrl}/v1/memories/query`, {
      method: 'POST', headers: authed(key),
      body: JSON.stringify({ situation }),
    });
    const r2 = (await q2.json()) as { retrievalId: string; memories: Array<{ id: string; similarity: number }> };
    assert.equal(r2.memories.length, 1);
    const firstHit = r2.memories[0]!;
    assert.equal(firstHit.id, mem1.id);
    assert.ok(firstHit.similarity > 0.5);

    // 5) Record a decision THAT CITES THE RETRIEVAL — the influence edge.
    const dec = await fetch(`${baseUrl}/v1/decisions`, {
      method: 'POST', headers: authed(key),
      body: JSON.stringify({
        retrievalId: r2.retrievalId,
        memoryIds: [mem1.id],
        situation,
        action: 'NO_TRADE',
        confidenceBase: 0.78,
        confidenceFinal: 0.42,
        memoryInfluence: -0.36,
        reasoning: ['memory warns: similar setup lost -0.6'],
      }),
    });
    assert.equal(dec.status, 201);
    const { decision, usedMemoryIds } = (await dec.json()) as { decision: { id: string }; usedMemoryIds: string[] };
    assert.deepEqual(usedMemoryIds, [mem1.id], 'the used memory is validated against the retrieval');

    // Usage count incremented by the decision, not by the retrieval.
    const detail = await fetch(`${baseUrl}/v1/memories/${mem1.id}`, { headers: authed(key) });
    const { memory: fetched } = (await detail.json()) as { memory: { retrievedCount: number } };
    assert.equal(fetched.retrievedCount, 1, 'used in a decision → count is earned');

    // 6) Record the outcome of that decision.
    const out = await fetch(`${baseUrl}/v1/outcomes`, {
      method: 'POST', headers: authed(key),
      body: JSON.stringify({
        decisionId: decision.id,
        outcome: { result: 'NO_TRADE', valence: 'neutral', metrics: { avoidedLoss: 0.6 } },
      }),
    });
    assert.equal(out.status, 201);

    // 7) History + activity reflect everything.
    const hist = (await (await fetch(`${baseUrl}/v1/agents/history`, { headers: authed(key) })).json()) as { memories: unknown[]; agentId: string };
    assert.equal(hist.memories.length, 1);
    const act = (await (await fetch(`${baseUrl}/v1/activity`, { headers: authed(key) })).json()) as { events: Array<{ type: string }> };
    const types = act.events.map((e) => e.type);
    assert.ok(types.includes('memory.retrieved'));
    assert.ok(types.includes('decision.recorded'));
    assert.ok(types.includes('outcome.recorded'));

    // The influence chain is derivable from stored rows: decision → retrieval.
    const storedDecision = (await (await fetch(`${baseUrl}/v1/agents/history`, { headers: authed(key) })).json()) as { agentId: string };
    assert.ok(storedDecision.agentId === agentId);
  });
});

test('api: influence fraud is rejected — cited memories must come from the cited retrieval', async () => {
  await withApi(async ({ baseUrl }) => {
    const { key } = await registerAgent(baseUrl, 'Fraud Tester');

    // Earn one memory.
    const earn = await fetch(`${baseUrl}/v1/memories`, {
      method: 'POST', headers: authed(key),
      body: JSON.stringify({
        situation,
        decision: { action: 'LONG', confidenceBase: 0.7, confidenceFinal: 0.7, memoryInfluence: 0, memoryIds: [], reasoning: [] },
        outcome: { result: 'LOSS', valence: 'bad', magnitude: -0.5, metrics: {}, marketOutcome: 'NO_WON', tradeOutcome: 'LOSS' },
        source: 'fraud-test',
      }),
    });
    assert.equal(earn.status, 201);

    // A retrieval that returns the memory.
    const q = (await (await fetch(`${baseUrl}/v1/memories/query`, {
      method: 'POST', headers: authed(key),
      body: JSON.stringify({ situation }),
    })).json()) as { retrievalId: string };

    // Now claim influence from a memory id that was NOT in that retrieval.
    const dec = await fetch(`${baseUrl}/v1/decisions`, {
      method: 'POST', headers: authed(key),
      body: JSON.stringify({
        retrievalId: q.retrievalId,
        memoryIds: ['mem-fabricated-000'],
        situation, action: 'NO_TRADE',
        confidenceBase: 0.7, confidenceFinal: 0.1, memoryInfluence: -0.6,
        reasoning: ['fake edge'],
      }),
    });
    assert.equal(dec.status, 400, 'influence must be backed by a real retrieval row');
    const decBody = (await dec.json()) as { error: string };
    assert.equal(decBody.error, 'INFLUENCE_NOT_SUPPORTED');

    // And a nonexistent retrieval id is a 404.
    const dec2 = await fetch(`${baseUrl}/v1/decisions`, {
      method: 'POST', headers: authed(key),
      body: JSON.stringify({
        retrievalId: 'ret-does-not-exist',
        memoryIds: [],
        situation, action: 'NO_TRADE',
        confidenceBase: 0.5, confidenceFinal: 0.5,
        reasoning: [],
      }),
    });
    assert.equal(dec2.status, 404);
  });
});

test('api: cross-agent isolation over HTTP', async () => {
  await withApi(async ({ baseUrl }) => {
    const A = await registerAgent(baseUrl, 'Agent A');
    const B = await registerAgent(baseUrl, 'Agent B');

    // A earns a memory.
    const exp = (await (await fetch(`${baseUrl}/v1/memories`, {
      method: 'POST', headers: authed(A.key),
      body: JSON.stringify({
        situation,
        decision: { action: 'LONG', confidenceBase: 0.7, confidenceFinal: 0.7, memoryInfluence: 0, memoryIds: [], reasoning: [] },
        outcome: { result: 'LOSS', valence: 'bad', magnitude: -0.5, metrics: {}, marketOutcome: 'NO_WON', tradeOutcome: 'LOSS' },
        source: 'iso-test',
      }),
    })).json()) as { memory: { id: string } };
    const memId = exp.memory.id;

    // B queries the same situation and gets NOTHING.
    const qB = (await (await fetch(`${baseUrl}/v1/memories/query`, {
      method: 'POST', headers: authed(B.key),
      body: JSON.stringify({ situation, minSimilarity: 0 }),
    })).json()) as { memories: unknown[] };
    assert.equal(qB.memories.length, 0, 'agent B must not retrieve agent A memory');

    // B cannot fetch A's memory by id — the id is real, but tenant-scoped.
    const direct = await fetch(`${baseUrl}/v1/memories/${memId}`, { headers: authed(B.key) });
    assert.equal(direct.status, 404, 'cross-agent id fetch is a 404, not a leak');
    const own = await fetch(`${baseUrl}/v1/memories/${memId}`, { headers: authed(A.key) });
    assert.equal(own.status, 200);

    // B cannot cite A's retrieval either.
    const qA = (await (await fetch(`${baseUrl}/v1/memories/query`, {
      method: 'POST', headers: authed(A.key),
      body: JSON.stringify({ situation }),
    })).json()) as { retrievalId: string };
    const fraud = await fetch(`${baseUrl}/v1/decisions`, {
      method: 'POST', headers: authed(B.key),
      body: JSON.stringify({
        retrievalId: qA.retrievalId,
        memoryIds: [],
        situation, action: 'X',
        confidenceBase: 0.5, confidenceFinal: 0.5, reasoning: [],
      }),
    });
    assert.equal(fraud.status, 404, 'B cannot use A retrieval rows');
  });
});

test('api: dead substrate → 503 MEMORY_SUBSTRATE_UNAVAILABLE on core routes', async () => {
  const fx = await startSidecar();
  const repo = repoFor(fx);
  const registry = new AgentRegistry(repo);
  const port = 30000 + Math.floor(Math.random() * 8000);
  const api = await startApi({ repo, registry, port });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const { key } = await registerAgent(baseUrl, 'Gate Tester');

    // Substrate dies. The API keeps serving, but memory ops fail honestly.
    fx.kill();
    await fx.waitDown();

    const q = await fetch(`${baseUrl}/v1/memories/query`, {
      method: 'POST', headers: authed(key),
      body: JSON.stringify({ situation }),
    });
    assert.equal(q.status, 503);
    const body = (await q.json()) as { error: string };
    assert.equal(body.error, 'MEMORY_SUBSTRATE_UNAVAILABLE');

    // The API itself is still alive — liveness and honest failure.
    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    const ready = await fetch(`${baseUrl}/readyz`);
    assert.equal(ready.status, 503, 'readyz tells the truth about the substrate');
  } finally {
    await api.close();
    await fx.dispose();
  }
});
