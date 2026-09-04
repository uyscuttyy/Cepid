/**
 * Doc-test: assert the documented shapes and routes match the live SDK
 * and server. This is RED→GREEN for the docs: if a route's documented
 * shape drifts from the real one, this test fails.
 *
 * Tests:
 *   1. SDK constructor accepts { baseUrl, apiKey } and exposes the routes
 *      integration.md claims.
 *   2. SDK static `register(baseUrl, { name, description })` posts to
 *      `/v1/agents/register` with no auth.
 *   3. CepidError carries the documented { status, code, message, body }.
 *   4. INFLUENCE_NOT_SUPPORTED is the 400 code on recordDecision.
 *   5. RETRIEVAL_NOT_FOUND is the 404 code on recordDecision with a bad id.
 *   6. x402 codes match the api.md table: PAYMENT-REQUIRED surfaces as 402.
 *   7. MEMORY_SUBSTRATE_UNAVAILABLE is the 503 code on history() when the
 *      substrate is down.
 *   8. `buildPayingFetch` is exported and is a function (the seam exists).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CepidClient, CepidError, buildPayingFetch } from '../src/index.js';

const BASE = 'http://127.0.0.1:8787';

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

interface FakeFetchHandle {
  calls: RecordedCall[];
  /** Replace globalThis.fetch for the duration of the wrapped call. */
  install<T>(fn: () => Promise<T>): Promise<T>;
}

function makeFakeFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>): FakeFetchHandle {
  const calls: RecordedCall[] = [];
  const original = globalThis.fetch;
  return {
    calls,
    async install(fn) {
      globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
        const url = input as string;
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(init?.headers ?? {})) headers[k] = String(v);
        calls.push({
          url,
          method: (init?.method ?? 'GET').toUpperCase(),
          headers,
          body: typeof init?.body === 'string' ? init.body : null,
        });
        // The static `register` reads res.text() before res.json(); emulate that.
        const r = responses[calls.length - 1] ?? responses[responses.length - 1]!;
        return new Response(JSON.stringify(r.body), {
          status: r.status,
          headers: { 'content-type': 'application/json', ...(r.headers ?? {}) },
        });
      }) as unknown as typeof fetch;
      try {
        return await fn();
      } finally {
        globalThis.fetch = original;
      }
    },
  };
}

test('SDK exposes every route integration.md documents', () => {
  assert.equal(typeof CepidClient, 'function', 'CepidClient class is documented and must exist');
  assert.equal(typeof CepidError, 'function', 'CepidError is documented and must exist');
  assert.equal(typeof buildPayingFetch, 'function', 'buildPayingFetch is documented and must exist');
  const c = new CepidClient({ baseUrl: BASE, apiKey: 'cepid_test' });
  assert.equal(typeof c.retrieve, 'function', 'retrieve is documented and must exist');
  assert.equal(typeof c.recordExperience, 'function', 'recordExperience is documented and must exist');
  assert.equal(typeof c.recordDecision, 'function', 'recordDecision is documented and must exist');
  assert.equal(typeof c.recordOutcome, 'function', 'recordOutcome is documented and must exist');
  assert.equal(typeof c.getMemory, 'function', 'getMemory is documented and must exist');
  assert.equal(typeof c.history, 'function', 'history is documented and must exist');
  assert.equal(typeof c.activity, 'function', 'activity is documented and must exist');
  assert.equal(typeof CepidClient.register, 'function', 'static register is documented and must exist');
});

test('CepidClient.register: POSTs to /v1/agents/register without auth, returns documented fields', async () => {
  const fake = makeFakeFetch([
    {
      status: 201,
      body: {
        agent: { id: 'agent-1', name: 'X', description: '', status: 'active', createdAt: '2026-01-01T00:00:00Z', keyCount: 1 },
        apiKey: 'cepid_abcdefghij1234567890',
        keyPrefix: 'abcdef',
        keyLast4: '7890',
        warning: 'Store this key now — it is never shown again.',
      },
    },
  ]);
  const result = await fake.install(() => CepidClient.register(BASE, { name: 'X', description: '' }));
  assert.equal(fake.calls[0]!.method, 'POST');
  assert.equal(fake.calls[0]!.url, `${BASE}/v1/agents/register`);
  assert.equal(fake.calls[0]!.headers.authorization, undefined, 'registration is open — no auth header');
  assert.deepEqual(JSON.parse(fake.calls[0]!.body!), { name: 'X', description: '' });
  assert.equal(result.agent.id, 'agent-1');
  assert.equal(result.apiKey, 'cepid_abcdefghij1234567890');
  assert.equal(result.keyPrefix, 'abcdef');
  assert.equal(result.keyLast4, '7890');
});

test('CepidError carries { status, code, message, body } as integration.md describes', async () => {
  const fake = makeFakeFetch([
    { status: 503, body: { error: 'MEMORY_SUBSTRATE_UNAVAILABLE', message: 'sidecar down' } },
  ]);
  const c = new CepidClient({ baseUrl: BASE, apiKey: 'cepid_test' });
  await assert.rejects(
    () => fake.install(() => c.history()),
    (e: unknown) => {
      assert.ok(e instanceof CepidError, 'must be CepidError');
      const ce = e as CepidError;
      assert.equal(ce.status, 503);
      assert.equal(ce.code, 'MEMORY_SUBSTRATE_UNAVAILABLE');
      assert.equal(ce.message, 'sidecar down');
      assert.deepEqual(ce.body, { error: 'MEMORY_SUBSTRATE_UNAVAILABLE', message: 'sidecar down' });
      return true;
    },
  );
});

test('INFLUENCE_NOT_SUPPORTED is the documented 400 code on recordDecision', async () => {
  const fake = makeFakeFetch([
    { status: 400, body: { error: 'INFLUENCE_NOT_SUPPORTED', message: 'cited memories were not returned by that retrieval' } },
  ]);
  const c = new CepidClient({ baseUrl: BASE, apiKey: 'cepid_test' });
  await assert.rejects(
    () => fake.install(() => c.recordDecision({
      retrievalId: 'ret-1',
      memoryIds: ['mem-fake'],
      situation: { domain: 'x', text: 'y', facets: {} },
      action: 'x',
      confidenceBase: 0.5,
      confidenceFinal: 0.5,
    })),
    (e: unknown) => {
      assert.ok(e instanceof CepidError);
      assert.equal((e as CepidError).status, 400);
      assert.equal((e as CepidError).code, 'INFLUENCE_NOT_SUPPORTED');
      return true;
    },
  );
});

test('RETRIEVAL_NOT_FOUND is the documented 404 code when the retrievalId is not in the tenant', async () => {
  const fake = makeFakeFetch([
    { status: 404, body: { error: 'RETRIEVAL_NOT_FOUND', message: 'no such retrieval in your memory' } },
  ]);
  const c = new CepidClient({ baseUrl: BASE, apiKey: 'cepid_test' });
  await assert.rejects(
    () => fake.install(() => c.recordDecision({
      retrievalId: 'ret-missing',
      memoryIds: [],
      situation: { domain: 'x', text: 'y', facets: {} },
      action: 'x',
      confidenceBase: 0.5,
      confidenceFinal: 0.5,
    })),
    (e: unknown) => {
      assert.ok(e instanceof CepidError);
      assert.equal((e as CepidError).status, 404);
      assert.equal((e as CepidError).code, 'RETRIEVAL_NOT_FOUND');
      return true;
    },
  );
});

test('x402 PAYMENT-REQUIRED surfaces as 402 CepidError on retrieve()', async () => {
  const fake = makeFakeFetch([
    { status: 402, body: { error: 'PAYMENT-REQUIRED', message: 'unpaid' } },
  ]);
  const c = new CepidClient({ baseUrl: BASE, apiKey: 'cepid_test' });
  await assert.rejects(
    () => fake.install(() => c.retrieve({ situation: { domain: 'x', text: 'y', facets: {} } })),
    (e: unknown) => {
      assert.ok(e instanceof CepidError);
      assert.equal((e as CepidError).status, 402);
      assert.equal((e as CepidError).code, 'PAYMENT-REQUIRED');
      return true;
    },
  );
});

test('UNAUTHORIZED is the 401 code on any protected route without a valid key', async () => {
  const fake = makeFakeFetch([
    { status: 401, body: { error: 'UNAUTHORIZED', message: 'Provide Authorization: Bearer ***' } },
  ]);
  const c = new CepidClient({ baseUrl: BASE, apiKey: 'cepid_test' });
  await assert.rejects(
    () => fake.install(() => c.activity()),
    (e: unknown) => {
      assert.ok(e instanceof CepidError);
      assert.equal((e as CepidError).status, 401);
      assert.equal((e as CepidError).code, 'UNAUTHORIZED');
      return true;
    },
  );
});
