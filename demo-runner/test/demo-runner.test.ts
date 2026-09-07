/**
 * Demo-runner tests — full two-run proof on a THROWAWAY stack.
 *
 * withStack boots a scratch sidecar + API (never the shipping substrate).
 * Trades run against the demo-trader mock provider; chain ops run against
 * FakeChainAdapter (no network, clock advanced by the injected sleep).
 * What IS real: the CEPID API, the gate, the lifecycle loop, scar
 * formation, and the runner's orchestration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withStack } from '@cepid/agent-demo-trader/test/helpers/stack.js';
import { FakeChainAdapter } from '../src/chain.js';
import { runDemoJob } from '../src/runner.js';

const mockSeed = () => ({
  markets: [
    {
      snapshot: {
        id: 'm-btc', title: 'BTC 15m', asset: 'BTC' as const, timeframe: '15M' as const,
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        active: true, yesPrice: 0.58, yesBidSize: 10, yesAskSize: 10, minShares: 1, liquidity: 500,
      },
      book: { bids: [{ price: 0.57, size: 10 }], asks: [{ price: 0.59, size: 10 }] },
    },
  ],
});

test('demo runner: full two-run proof on a throwaway stack (ALLOW×3 → losses → scar → DENY)', async () => {
  await withStack(async (stack) => {
    const dir = mkdtempSync(join(tmpdir(), 'cepid-demo-test-'));
    const chain = new FakeChainAdapter(10_000_000n);

    const result = await runDemoJob('test-job-1', {
      cepidBaseUrl: stack.baseUrl,
      chain,
      rpcUrl: 'http://127.0.0.1:1',
      keyStorePath: join(dir, 'demo-agent.json'),
      dataDir: join(dir, 'sessions'),
      network: 'mock',
      mockSeed: mockSeed(),
      // Advance the fake clock instead of sleeping: expiry passes instantly.
      sleepMs: async (ms: number) => {
        chain.advance(ms);
      },
    });

    assert.equal(result.status, 'done', `demo failed: ${result.error}`);
    assert.ok(result.agentId, 'demo agent registered');

    // Run 1: three ALLOW legs with trade evidence.
    assert.equal(result.legs.length, 3, 'three run-1 legs');
    for (const leg of result.legs) {
      assert.equal(leg.gateVerdict, 'ALLOW', `leg ${leg.leg} ALLOW on fresh memory`);
      assert.ok(leg.txHash, `leg ${leg.leg} has trade evidence`);
      assert.ok(leg.memoryId, `leg ${leg.leg} recorded a memory`);
    }

    // Run 2: DENY, NO_TRADE, no transaction, blocking ids named.
    assert.ok(result.run2, 'run 2 recorded');
    assert.equal(result.run2!.gateVerdict, 'DENY', 'scar blocks run 2');
    assert.equal(result.run2!.intent, 'NO_TRADE', 'intent forced to NO_TRADE');
    assert.equal(result.run2!.txHash, null, 'no transaction on the DENY path');
    assert.ok(result.run2!.blockingMemoryIds.length >= 3, 'blocking memories named');

    // The journal shows the full chain on the throwaway stack. The demo
    // key lives in the runner's keystore file (maintainer-side state).
    const stored = JSON.parse(
      (await import('node:fs')).readFileSync(join(dir, 'demo-agent.json'), 'utf8'),
    ) as { apiKey: string };
    const activity = (await (
      await fetch(`${stack.baseUrl}/v1/activity`, {
        headers: { authorization: `Bearer ${stored.apiKey}` },
      })
    ).json()) as { events: Array<{ type: string }> };
    const types = activity.events.map((e) => e.type);
    assert.ok(types.includes('gate.denied'), 'gate.denied journaled');
    assert.ok(types.includes('memory.settled'), 'losses settled');
  });
});
