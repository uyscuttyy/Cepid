/**
 * THESIS TEST — memory changes the decision, over the FULL STACK.
 *
 * The demo agent consumes CEPID exactly like an external agent: registered
 * via the API, driving the SDK, HTTP only. Empty memory → base strategy
 * fires. Earned bad memories + scar (recorded through the API by earlier
 * runs) → the same situation gets vetoed. Everything the agent knows about
 * memory came over the wire.
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

test('thesis (full stack): fresh agent trades; scarred agent vetoes', async () => {
  await withStack(async (stack) => {
    process.env.CEPID_NETWORK = 'mock';
    process.env.CEPID_MAX_COLLATERAL = '1.0';
    delete process.env.AGENT_PRIVATE_KEY;

    // 1) Fresh agent: no memory → base strategy fires, nothing retrieved.
    const first = await runOnce({ execute: false, confirmApproval: false, confirmOrder: false, mockSeed: mockSeed() });
    assert.equal(first.intent.direction, 'YES', 'no memory → base strategy fires');
    assert.equal(first.retrieved.length, 0, 'empty substrate → zero memories returned');
    assert.ok(first.retrievalId, 'a retrieval row exists anyway (the edge is recorded even when empty)');

    // 2) Earn bad memory through the PUBLIC API — exactly what another run
    //    of this agent (or any trading agent) would leave behind.
    const cepid = new CepidClient({ baseUrl: stack.baseUrl, apiKey: stack.apiKey });
    const situation = toSituation(conditions, 'YES');
    for (let i = 0; i < 4; i++) {
      await cepid.recordExperience({
        situation,
        decision: { action: 'YES', confidenceBase: 0.78, confidenceFinal: 0.78, memoryInfluence: 0, memoryIds: [], reasoning: ['seed'] },
        outcome: { result: 'LOSS', valence: 'bad', magnitude: -0.58, metrics: { pnl: -0.58 }, marketOutcome: 'NO_WON', tradeOutcome: 'LOSS' },
        source: 'seed',
      });
    }

    // 3) Same market again — the memories come back over HTTP and the
    //    agent's reasoning vetoes the trade.
    const second = await runOnce({ execute: false, confirmApproval: false, confirmOrder: false, mockSeed: mockSeed() });
    assert.ok(second.retrieved.length > 0, 'earned memories retrieved over the API');
    const scarHit = second.retrieved.some((m) => m.isScar || m.isPattern);
    assert.ok(scarHit, 'a pattern or scar formed and was returned');
    assert.equal(second.intent.direction, 'NO_TRADE', 'memory vetoes the same setup');
    assert.ok(second.decisionContext.finalConfidence < 0.5, 'confidence dropped below threshold');
    assert.ok(second.decisionContext.memoryIds.length > 0, 'decision cites the used memories');

    // 4) The influence chain is REAL in the platform: the decision row
    //    references the retrieval row. Verify via the API.
    const activity = (await (await fetch(`${stack.baseUrl}/v1/activity`, {
      headers: { authorization: `Bearer ${stack.apiKey}` },
    })).json()) as { events: Array<{ type: string; usedMemories?: number; retrievalId?: string }> };
    const decisionEvent = activity.events.find((e: { type: string }) => e.type === 'decision.recorded');
    assert.ok(decisionEvent, 'decision recorded');
    assert.ok((decisionEvent.usedMemories ?? 0) > 0, 'the decision used memories');
    assert.ok(decisionEvent.retrievalId, 'decision cites its retrieval — the influence edge');
  });
});
