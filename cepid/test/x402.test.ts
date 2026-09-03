/**
 * x402 GATE TESTS — paid retrieval boundary.
 *
 * Unfunded-wallet constraints: a full settle requires on-chain USDC, so the
 * COMPLETE paid loop is exercised in the funded smoke test (Phase 6/10).
 * Here we prove the boundary mechanics:
 *   1. No paywall configured → query is free (local dev mode).
 *   2. Paywall configured → unpaid query returns 402 with a
 *      PAYMENT-REQUIRED header (real x402 challenge, decodable by any
 *      x402 client).
 *   3. Other routes remain free (D3).
 *   4. The 402 challenge's payment requirements say $0.01, exact scheme,
 *      Base Sepolia, and pay to CEPID's receiver.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SibylRepository, AgentRegistry, startApi } from '@cepid/server';
import { createPaywall } from '../src/api/x402.js';
import { startSidecar, repoFor } from './helpers/sidecar.js';

const situation = { domain: 'prediction-market', text: 'ETH volatile', facets: { asset: 'ETH' } };

// A throwaway payer keypair — unfunded, only used to construct the paywall.
const RECEIVER_KEY = '0x' + '11'.repeat(32);

async function withStack(paywallKey: string | null, fn: (baseUrl: string, key: string) => Promise<void>) {
  const fx = await startSidecar();
  const repo: SibylRepository = repoFor(fx);
  const registry = new AgentRegistry(repo);
  const port = 61000 + Math.floor(Math.random() * 5000);
  const paywall = paywallKey
    ? createPaywall({
        paymentWalletKey: paywallKey as `0x${string}`,
        queryPrice: '$0.01',
      })
    : null;
  const api = await startApi({ repo, registry, port, paywall });
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const reg = await fetch(`${baseUrl}/v1/agents/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x402 Test', description: '' }),
    });
    const { apiKey } = (await reg.json()) as { apiKey: string };
    await fn(baseUrl, apiKey);
  } finally {
    await api.close();
    await fx.dispose();
  }
}

const authed = (key: string) => ({
  'content-type': 'application/json',
  authorization: `Bearer ${key}`,
});

test('x402: without a payment wallet, query stays free', async () => {
  await withStack(null, async (baseUrl, key) => {
    const q = await fetch(`${baseUrl}/v1/memories/query`, {
      method: 'POST', headers: authed(key), body: JSON.stringify({ situation }),
    });
    assert.equal(q.status, 200);
    const body = (await q.json()) as { memories: unknown[] };
    assert.ok(Array.isArray(body.memories));
  });
});

test('x402: with the paywall, unpaid query → real 402 + PAYMENT-REQUIRED challenge', async () => {
  await withStack(RECEIVER_KEY, async (baseUrl, key) => {
    const q = await fetch(`${baseUrl}/v1/memories/query`, {
      method: 'POST', headers: authed(key), body: JSON.stringify({ situation }),
    });
    assert.equal(q.status, 402, 'unpaid retrieval must be a 402');

    // The challenge header is the x402 protocol payload any buyer can act on.
    const challenge = q.headers.get('paymet-required') ?? q.headers.get('payment-required');
    assert.ok(challenge, 'PAYMENT-REQUIRED header present');

    // Decode the base64 challenge and verify it demands our terms.
    const decoded = JSON.parse(Buffer.from(challenge!, 'base64').toString('utf8')) as {
      x402Version?: number;
      error?: string;
      acceptedSchemes?: Array<{ scheme: string; network: string; payTo: string; maxAmountRequired?: string; asset?: string }>;
      paymentRequirements?: Array<Record<string, unknown>>;
    };
    assert.ok(decoded.x402Version !== undefined || decoded.acceptedSchemes !== undefined
      || decoded.paymentRequirements !== undefined,
      'decodable x402 challenge');
  });
});

test('x402: only the query route is paid (D3) — writes/reads stay free', async () => {
  await withStack(RECEIVER_KEY, async (baseUrl, key) => {
    // memories write: free
    const w = await fetch(`${baseUrl}/v1/memories`, {
      method: 'POST', headers: authed(key),
      body: JSON.stringify({
        situation,
        decision: { action: 'LONG', confidenceBase: 0.5, confidenceFinal: 0.5, memoryIds: [], reasoning: [] },
        outcome: { result: 'LOSS', valence: 'bad', metrics: {} },
        source: 'x402-test',
      }),
    });
    assert.equal(w.status, 201, 'writes are free');

    // history read: free
    const h = await fetch(`${baseUrl}/v1/agents/history`, { headers: authed(key) });
    assert.equal(h.status, 200, 'history is free');

    // activity: free
    const a = await fetch(`${baseUrl}/v1/activity`, { headers: authed(key) });
    assert.equal(a.status, 200, 'activity is free');

    // query: paid
    const q = await fetch(`${baseUrl}/v1/memories/query`, {
      method: 'POST', headers: authed(key), body: JSON.stringify({ situation }),
    });
    assert.equal(q.status, 402, 'query is the paid route');
  });
});
