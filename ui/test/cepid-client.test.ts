/**
 * Tests for the typed client over the CEPID /v1/* API.
 *
 * The client is the seam between the dashboard and the live server — it has
 * exactly one job: translate the routes the platform actually exposes into
 * well-typed functions, and refuse to call anything the server does not serve.
 *
 * We test against a hand-rolled fake fetch (not a mock of `fetch` itself) so
 * the assertion is "the client assembles the request the server expects and
 * returns the response the server actually sends". That is the contract that
 * matters; how `fetch` is called under the hood is implementation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCepidClient, CepidClientError } from '../src/lib/cepid.js';

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

/** Build a fake `fetch` from a sequence of canned responses. */
function fakeFetch(responses: Array<{ status: number; body: unknown }>): {
  calls: RecordedCall[];
  fetch: typeof fetch;
} {
  const calls: RecordedCall[] = [];
  let i = 0;
  const f: typeof fetch = async (input, init) => {
    const req = input as string;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(init?.headers ?? {})) {
      headers[k] = String(v);
    }
    calls.push({
      url: req,
      method: (init?.method ?? 'GET').toUpperCase(),
      headers,
      body: typeof init?.body === 'string' ? init.body : null,
    });
    const r = responses[i++] ?? responses[responses.length - 1]!;
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { calls, fetch: f };
}

const BASE = 'http://127.0.0.1:8787';
const KEY = 'cepid_testdemo1234';

test('listAgents: GETs /v1/agents with bearer auth and returns the agents array', async () => {
  const { calls, fetch } = fakeFetch([
    { status: 200, body: { agents: [{ id: 'agent-abc', name: 'demo', description: '', status: 'active', createdAt: '2026-01-01T00:00:00Z', keyCount: 1 }] } },
  ]);
  const client = createCepidClient({ baseUrl: BASE, apiKey: KEY, fetch });

  const agents = await client.listAgents();

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `${BASE}/v1/agents`);
  assert.equal(calls[0]!.method, 'GET');
  assert.equal(calls[0]!.headers.authorization, `Bearer ${KEY}`);
  assert.equal(agents.length, 1);
  assert.equal(agents[0]!.id, 'agent-abc');
  assert.equal(agents[0]!.name, 'demo');
});

test('getHealth: GETs /readyz without auth (auth is not required for liveness)', async () => {
  const { calls, fetch } = fakeFetch([
    { status: 200, body: { ok: true, service: 'cepid-api', version: 'v1' } },
  ]);
  const client = createCepidClient({ baseUrl: BASE, apiKey: KEY, fetch });

  const ready = await client.getReadiness();

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `${BASE}/readyz`);
  // Health is open — no auth header even when apiKey is set.
  assert.equal(calls[0]!.headers.authorization, undefined);
  assert.equal(ready.ok, true);
  assert.equal(ready.substrate, 'ok');
});

test('getAgentHistory: GETs /v1/agents/history with bearer auth and returns memories/patterns/scars', async () => {
  const { calls, fetch } = fakeFetch([
    {
      status: 200,
      body: {
        agentId: 'agent-abc',
        memories: [{ id: 'mem-1', agentId: 'agent-abc', kind: 'experience', situation: { domain: 'x', text: 'y', facets: {} }, action: 'LONG', decision: { action: 'LONG', confidenceBase: 0.6, confidenceFinal: 0.4, memoryInfluence: -0.2, memoryIds: [], reasoning: [] }, outcome: null, importance: 0.5, surprising: false, strength: 0.7, retrievedCount: 0, lastRetrievedAt: null, source: 'api', relationships: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }],
        patterns: [],
        scars: [],
      },
    },
  ]);
  const client = createCepidClient({ baseUrl: BASE, apiKey: KEY, fetch });

  const hist = await client.getAgentHistory('agent-abc');

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `${BASE}/v1/agents/history`);
  assert.equal(calls[0]!.headers.authorization, `Bearer ${KEY}`);
  assert.equal(hist.agentId, 'agent-abc');
  assert.equal(hist.memories.length, 1);
  assert.equal(hist.memories[0]!.id, 'mem-1');
  assert.deepEqual(hist.patterns, []);
  assert.deepEqual(hist.scars, []);
});

test('getActivity: GETs /v1/activity?agentId=... (server scopes by auth, not query) and returns events', async () => {
  const { calls, fetch } = fakeFetch([
    { status: 200, body: { agentId: 'agent-abc', events: [{ type: 'memory.retrieved', at: '2026-01-01T00:00:00Z', retrievalId: 'ret-1', query: 'q', returned: 2 }] } },
  ]);
  const client = createCepidClient({ baseUrl: BASE, apiKey: KEY, fetch });

  const activity = await client.getActivity('agent-abc');

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `${BASE}/v1/activity`);
  assert.equal(activity.agentId, 'agent-abc');
  assert.equal(activity.events.length, 1);
  assert.equal(activity.events[0]!.type, 'memory.retrieved');
});

test('getUsage: GETs /v1/usage and returns settled payment rows', async () => {
  const { calls, fetch } = fakeFetch([
    { status: 200, body: { usage: [{ type: 'usage.settled', at: '2026-01-01T00:00:00Z', agentId: 'agent-abc', route: '/v1/memories/query', price: '$0.01', payTo: '0xabc', txHash: '0xdeadbeef', payer: '0xbead' }], count: 1 } },
  ]);
  const client = createCepidClient({ baseUrl: BASE, apiKey: KEY, fetch });

  const usage = await client.getUsage('agent-abc');

  assert.equal(calls[0]!.url, `${BASE}/v1/usage`);
  assert.equal(usage.count, 1);
  assert.equal(usage.usage[0]!.txHash, '0xdeadbeef');
});

test('error response: 401 surfaces as CepidClientError with code + status', async () => {
  const { fetch } = fakeFetch([
    { status: 401, body: { error: 'UNAUTHORIZED', message: 'bad key' } },
  ]);
  const client = createCepidClient({ baseUrl: BASE, apiKey: KEY, fetch });

  await assert.rejects(
    () => client.listAgents(),
    (e: unknown) => {
      assert.ok(e instanceof CepidClientError);
      const ce = e as CepidClientError;
      assert.equal(ce.status, 401);
      assert.equal(ce.code, 'UNAUTHORIZED');
      return true;
    },
  );
});

test('substrate-down: 503 with MEMORY_SUBSTRATE_UNAVAILABLE surfaces a tagged error', async () => {
  const { fetch } = fakeFetch([
    { status: 503, body: { error: 'MEMORY_SUBSTRATE_UNAVAILABLE', message: 'sidecar down' } },
  ]);
  const client = createCepidClient({ baseUrl: BASE, apiKey: KEY, fetch });

  await assert.rejects(
    () => client.getAgentHistory('agent-abc'),
    (e: unknown) => {
      assert.ok(e instanceof CepidClientError);
      const ce = e as CepidClientError;
      assert.equal(ce.status, 503);
      assert.equal(ce.code, 'MEMORY_SUBSTRATE_UNAVAILABLE');
      return true;
    },
  );
});

test('register: POSTs to /v1/agents/register without auth and returns the one-time key', async () => {
  const { calls, fetch } = fakeFetch([
    { status: 201, body: { agent: { id: 'agent-xyz', name: 'New', description: '', status: 'active', createdAt: '2026-01-01T00:00:00Z', keyCount: 1 }, apiKey: 'cepid_abcdef1234567890', keyPrefix: 'abcdef', keyLast4: '7890', warning: 'Store this key now — it is never shown again.' } },
  ]);
  // No apiKey configured — registration is open.
  const client = createCepidClient({ baseUrl: BASE, fetch });

  const result = await client.register({ name: 'New', description: '' });

  assert.equal(calls[0]!.url, `${BASE}/v1/agents/register`);
  assert.equal(calls[0]!.method, 'POST');
  assert.equal(calls[0]!.headers.authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0]!.body!), { name: 'New', description: '' });
  assert.equal(result.apiKey, 'cepid_abcdef1234567890');
  assert.equal(result.agent.id, 'agent-xyz');
});

test('getMemory: GETs /v1/memories/:id and returns the memory record', async () => {
  const { calls, fetch } = fakeFetch([
    {
      status: 200,
      body: {
        memory: {
          id: 'mem-1', agentId: 'agent-abc', kind: 'experience',
          situation: { domain: 'support', text: 'refund denied', facets: { tier: 'free' } },
          action: 'refund',
          decision: { action: 'refund', confidenceBase: 0.5, confidenceFinal: 0.3, memoryInfluence: -0.2, memoryIds: [], reasoning: [] },
          outcome: null, importance: 0.5, surprising: false, strength: 0.7, retrievedCount: 0, lastRetrievedAt: null,
          source: 'api', relationships: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
        },
      },
    },
  ]);
  const client = createCepidClient({ baseUrl: BASE, apiKey: KEY, fetch });

  const mem = await client.getMemory('agent-abc', 'mem-1');

  assert.equal(calls[0]!.url, `${BASE}/v1/memories/mem-1`);
  assert.equal(calls[0]!.method, 'GET');
  assert.equal(calls[0]!.headers.authorization, `Bearer ${KEY}`);
  assert.equal(mem.id, 'mem-1');
  assert.equal(mem.situation.domain, 'support');
});
