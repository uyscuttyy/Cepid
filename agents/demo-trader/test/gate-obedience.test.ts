/**
 * GATE OBEDIENCE — when CEPID says DENY, the agent must not trade.
 *
 * The constraint gate runs server-side after retrieval. This test proves
 * the agent obeys it over the full stack: seed bad memories through the
 * public API (so the gate fires), then runOnce with execute:true and
 * assert that NO trade is submitted, NO txHash exists, and the blocked
 * decision is recorded with the gate's reason and blocking ids.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CepidClient } from '@cepid/client';
import { runOnce } from '../src/app.js';
import { toSituation, type TradingConditions } from '../src/config/types.js';
import { withStack } from './helpers/stack.js';

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

const conditions: TradingConditions = {
  asset: 'BTC', timeframe: '15M', yesPrice: 0.58, midpointDistance: 0.08,
  volatility: 'high', momentum: 'up', liquidity: 'medium', timeRemainingBucket: '>10m',
};

test('gate obedience (full stack): DENY → no trade, no txHash, blocked decision recorded', async () => {
  await withStack(async (stack) => {
    process.env.CEPID_NETWORK = 'mock';
    process.env.CEPID_MAX_COLLATERAL = '1.0';
    delete process.env.AGENT_PRIVATE_KEY;

    // Seed 4 bad experiences through the PUBLIC API — the gate's
    // bad-experience criterion (similarity ≥ 0.7) will fire on the
    // same situation.
    const client = new CepidClient({ baseUrl: stack.baseUrl, apiKey: stack.apiKey });
    const situation = toSituation(conditions, 'YES');
    for (let i = 0; i < 4; i++) {
      await client.recordExperience({
        situation,
        decision: { action: 'YES', confidenceBase: 0.78, confidenceFinal: 0.78, memoryInfluence: 0, memoryIds: [], reasoning: ['seed'] },
        outcome: { result: 'LOSS', valence: 'bad', magnitude: -0.58, metrics: { pnl: -0.58 }, marketOutcome: 'NO_WON', tradeOutcome: 'LOSS' },
        source: 'seed',
      });
    }

    // Gate fires server-side; agent must obey even with execute:true.
    const result = await runOnce({
      execute: true, confirmApproval: true, confirmOrder: true,
      mockSeed: mockSeed(),
    });

    assert.equal(result.intent.direction, 'NO_TRADE', 'DENY forces NO_TRADE');
    assert.equal(result.gateVerdict, 'DENY', 'the gate verdict came back DENY over the wire');
    assert.ok(result.gateReason.length > 0, 'the gate gave a reason');
    assert.ok(result.gateBlockingMemoryIds.length > 0, 'the gate named blocking memories');
    assert.equal(result.execution.txHash, undefined, 'no transaction hash — nothing was submitted');
    assert.ok(!result.execution.entryPrice, 'no entry price — no fill occurred');

    // The blocked decision is recorded with the gate's evidence.
    const activity = (await (await fetch(`${stack.baseUrl}/v1/activity`, {
      headers: { authorization: `Bearer ${stack.apiKey}` },
    })).json()) as { events: Array<Record<string, unknown>> };
    const denied = activity.events.find((e) => e.type === 'gate.denied');
    assert.ok(denied, 'gate.denied event recorded in the journal');
    assert.equal(denied.blockedBy, 'bad-experience');
    assert.ok(Array.isArray(denied.blockingMemoryIds) && (denied.blockingMemoryIds as unknown[]).length > 0,
      'blocking memory ids are real');

    // No order_submitted event exists for this run (the agent only
    // appends it when execution.txHash is set).
    const orders = activity.events.filter((e) => e.type === 'order_submitted');
    assert.equal(orders.length, 0, 'zero order_submitted events — the market was never touched');
  });
});

test('gate obedience (full stack): ALLOW → trade proceeds normally', async () => {
  await withStack(async (stack) => {
    process.env.CEPID_NETWORK = 'mock';
    process.env.CEPID_MAX_COLLATERAL = '1.0';
    delete process.env.AGENT_PRIVATE_KEY;

    // Fresh agent, no memory → ALLOW → base strategy fires.
    const result = await runOnce({
      execute: true, confirmApproval: true, confirmOrder: true,
      mockSeed: mockSeed(),
    });

    assert.equal(result.intent.direction, 'YES', 'ALLOW lets the base strategy fire');
    assert.equal(result.gateVerdict, 'ALLOW', 'the gate verdict came back ALLOW over the wire');
    assert.ok(result.execution.txHash, 'a transaction hash exists — the trade was submitted');
  });
});
