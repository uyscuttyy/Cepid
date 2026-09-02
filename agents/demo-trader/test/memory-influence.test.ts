/**
 * THESIS TEST — memory changes the decision.
 *
 * Runs against the REAL Sibyl substrate (sidecar on a scratch DB): the same
 * persistence the product uses in production. Given the same market
 * conditions, the base strategy fires when no relevant memory exists, and
 * gets vetoed once the agent has accumulated bad memories + a scar from
 * similar setups. If this ever fails, the product thesis is broken.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { linkPatterns, updateScars, evaluateAndStore, markMemoryUsed } from '@cepid/server';
import type { MemoryOutcome, Situation } from '@cepid/server';
import { MemoryInformedDecisionEngine } from '../src/decision/engine.js';
import { DeterministicStrategy } from '../src/strategy/base-strategy.js';
import { deriveContext } from '../src/strategy/context.js';
import { toSituation } from '../src/config/types.js';
import type { MarketSnapshot, OrderBook } from '../src/config/types.js';
import { withSidecar } from './helpers/sidecar.js';

const AGENT = 'agent-demo-trader';

const baseMarket: MarketSnapshot = {
  id: 'm-btc-15m',
  title: 'BTC 15m',
  asset: 'BTC',
  timeframe: '15M',
  expiresAt: Math.floor(Date.now() / 1000) + 600,
  active: true,
  yesPrice: 0.58,
  yesBidSize: 10,
  yesAskSize: 10,
  minShares: 1,
  liquidity: 500,
};

const baseBook: OrderBook = {
  marketId: 'm-btc-15m',
  bids: [{ price: 0.57, size: 10 }],
  asks: [{ price: 0.59, size: 10 }],
  midpoint: 0.58,
};

test('memory changes the decision (the central product thesis, on Sibyl)', async (t) => {
  await withSidecar(async (h) => {
    const repo = h.repo;
    const conditions = deriveContext(baseMarket, baseBook);
    const situation = toSituation(conditions, 'YES');
    const engine = new MemoryInformedDecisionEngine({
      strategy: new DeterministicStrategy(),
      memory: repo,
      agentId: AGENT,
    });

    // 1) Empty substrate → base strategy fires, nothing retrieved.
    const before = await engine.decide(baseMarket, baseBook, conditions, 'YES');
    assert.equal(before.intent.direction, 'YES', 'no memory → base strategy should fire');
    assert.equal(before.retrieved.length, 0, 'fresh agent retrieves nothing');

    // 2) Seed earned memory: repeated losses under identical conditions.
    const loss: MemoryOutcome = {
      result: 'LOSS', valence: 'bad', magnitude: -0.58,
      metrics: { pnl: -0.58, shares: 1, entryPrice: 0.58 },
      marketOutcome: 'NO_WON', tradeOutcome: 'LOSS',
      observedAt: new Date().toISOString(),
    };
    for (let i = 0; i < 4; i++) {
      await evaluateAndStore(repo, {
        agentId: AGENT, situation,
        decision: { action: 'YES', confidenceBase: 0.78, confidenceFinal: 0.78, memoryInfluence: 0, memoryIds: [], reasoning: ['seed'] },
        outcome: loss, source: 'seed', decisionId: null,
      });
    }
    await linkPatterns(repo, AGENT);
    await updateScars(repo, AGENT);

    // 3) Same market, now with memory → veto.
    const after = await engine.decide(baseMarket, baseBook, conditions, 'YES');
    assert.equal(after.intent.direction, 'NO_TRADE', 'with negative memory → should veto');
    assert.ok(after.decision.memoryIds.length > 0, 'decision must reference retrieved memories');
    assert.ok(after.decision.finalConfidence < 0.5, 'final confidence must drop below threshold');

    // 4) Pattern + scar formed — the veto came from earned structure.
    const patterns = await repo.listPatterns(AGENT);
    const scars = await repo.listScars(AGENT);
    assert.ok(patterns.length > 0, 'a pattern should be detected');
    assert.ok(scars.length > 0, 'a scar should be created');

    // 5) Reasoning cites the memories — influence is explainable.
    const cited = after.decision.reasoning.filter((r) => r.includes('mem-')).length;
    assert.ok(cited > 0, 'reasoning must cite participating memory ids');

    // 6) Real usage counting.
    await markMemoryUsed(repo, AGENT, after.decision.memoryIds);
    const first = await repo.getMemory(AGENT, after.decision.memoryIds[0]!);
    assert.equal(first!.retrievedCount, 1, 'usage recorded when the agent uses memory');
  });
});
