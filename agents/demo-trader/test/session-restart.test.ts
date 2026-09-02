/**
 * End-to-end over the full stack: session 1 runs and leaves memory in the
 * platform via the API; the SIDECAR PROCESS IS KILLED; a fresh session
 * retrieves that memory over HTTP and gets vetoed. The only continuity is
 * the substrate + the API contract — exactly what a fresh agent session is.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runOnce } from '../src/app.js';
import { toSituation, type TradingConditions } from '../src/config/types.js';
import { withStack } from './helpers/stack.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockSeed = () => ({
  markets: [
    {
      snapshot: {
        id: 'm-1', title: 'BTC 15m', asset: 'BTC' as const, timeframe: '15M' as const,
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        active: true, yesPrice: 0.55, yesBidSize: 10, yesAskSize: 10, minShares: 1, liquidity: 500,
      },
      book: { bids: [{ price: 0.54, size: 10 }], asks: [{ price: 0.56, size: 10 }] },
    },
  ],
});

const conditions: TradingConditions = {
  asset: 'BTC', timeframe: '15M', yesPrice: 0.55, midpointDistance: 0.05,
  volatility: 'high', momentum: 'up', liquidity: 'medium', timeRemainingBucket: '>10m',
};

test('e2e: fresh session (substrate restarted) is vetoed by persisted memory', async () => {
  await withStack(async (stack) => {
    process.env.CEPID_NETWORK = 'mock';
    process.env.CEPID_MAX_COLLATERAL = '1.0';
    process.env.CEPID_DATA_DIR = join(stack.dbPath, '..');
    delete process.env.AGENT_PRIVATE_KEY;

    // Session 1: fresh memory → fires.
    const first = await runOnce({ execute: false, confirmApproval: false, confirmOrder: false, mockSeed: mockSeed() });
    assert.equal(first.intent.direction, 'YES');

    // Earn the bad memories over the public API (as prior runs would).
    const { CepidClient } = await import('@cepid/client');
    const cepid = new CepidClient({ baseUrl: stack.baseUrl, apiKey: stack.apiKey });
    const situation = toSituation(conditions, 'YES');
    for (let i = 0; i < 4; i++) {
      await cepid.recordExperience({
        situation,
        decision: { action: 'YES', confidenceBase: 0.8, confidenceFinal: 0.8, memoryInfluence: 0, memoryIds: [], reasoning: ['seed'] },
        outcome: { result: 'LOSS', valence: 'bad', magnitude: -0.56, metrics: { pnl: -0.56 }, marketOutcome: 'NO_WON', tradeOutcome: 'LOSS' },
        source: 'seed',
      });
    }

    // Kill the substrate process — the "fresh session" boundary.
    await stack.restartSidecar();

    // Session 2: same situation; memory comes only from the restarted store.
    const second = await runOnce({ execute: false, confirmApproval: false, confirmOrder: false, mockSeed: mockSeed() });
    assert.equal(second.intent.direction, 'NO_TRADE', 'fresh session is vetoed by persisted memory');
    assert.ok(second.decisionContext.memoryIds.length > 0);

    // Key-leak regression still holds on the agent's own event file.
    const eventsRaw = readFileSync(join(process.env.CEPID_DATA_DIR!, 'events.json'), 'utf8');
    assert.equal(/0x[0-9a-fA-F]{64}/.test(eventsRaw), false, 'events stay key-free');

    // And the second agent (isolation) still sees nothing.
    const reg2 = await fetch(`${stack.baseUrl}/v1/agents/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Other Agent', description: 'isolation probe' }),
    });
    const other = (await reg2.json()) as { apiKey: string };
    const otherHistory = (await (await fetch(`${stack.baseUrl}/v1/agents/history`, {
      headers: { authorization: `Bearer ${other.apiKey}` },
    })).json()) as { memories: unknown[] };
    assert.equal(otherHistory.memories.length, 0, 'a second agent sees none of the first agent memory');
  });
});
