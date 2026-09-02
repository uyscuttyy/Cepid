/**
 * THESIS TEST — memory changes the decision.
 *
 * Given the same market conditions, the same base strategy fires when no
 * relevant memory exists, and gets vetoed once the agent has accumulated bad
 * experiences (and scars) from similar setups. This is the product's central
 * claim, expressed as a test. If it ever fails, the thesis is broken.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  JsonMemoryRepository,
  linkPatterns,
  updateScars,
  evaluateAndStore,
  runDecay,
  markMemoryUsed,
  type MemoryOutcome,
} from '@cepid/server';
import { MemoryInformedDecisionEngine } from '../src/decision/engine.js';
import { DeterministicStrategy } from '../src/strategy/base-strategy.js';
import { deriveContext } from '../src/strategy/context.js';
import { toSituation } from '../src/config/types.js';
import type { MarketSnapshot, OrderBook } from '../src/config/types.js';

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

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'cepid-thesis-'));
  return { repo: new JsonMemoryRepository(dir), dir };
}

async function seedLosingStreak(repo: JsonMemoryRepository) {
  const conditions = deriveContext(baseMarket, baseBook);
  const situation = toSituation(conditions, 'YES');
  const loss: MemoryOutcome = {
    result: 'LOSS',
    valence: 'bad',
    magnitude: -0.58,
    metrics: { pnl: -0.58, shares: 1, entryPrice: 0.58 },
    marketOutcome: 'NO_WON',
    tradeOutcome: 'LOSS',
    observedAt: new Date().toISOString(),
  };
  for (let i = 0; i < 4; i++) {
    await evaluateAndStore(repo, {
      agentId: AGENT,
      situation,
      decision: {
        action: 'YES',
        confidenceBase: 0.78,
        confidenceFinal: 0.78,
        memoryInfluence: 0,
        memoryIds: [],
        reasoning: ['seed'],
      },
      outcome: loss,
      source: 'seed',
      decisionId: null,
    });
  }
  await linkPatterns(repo, AGENT);
  await updateScars(repo, AGENT);
}

test('memory changes the decision (the central product thesis)', async (t) => {
  const { repo, dir } = tempRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const conditions = deriveContext(baseMarket, baseBook);
  const engine = new MemoryInformedDecisionEngine({
    strategy: new DeterministicStrategy(),
    memory: repo,
    agentId: AGENT,
  });

  // 1) Without memory, the base strategy is allowed to act.
  const before = await engine.decide(baseMarket, baseBook, conditions, 'YES');
  assert.equal(before.intent.direction, 'YES', 'no memory → base strategy should fire');

  // 2) Seed the memory with repeated losses under identical conditions.
  await seedLosingStreak(repo);

  // 3) With memory, the same market produces NO_TRADE.
  const after = await engine.decide(baseMarket, baseBook, conditions, 'YES');
  assert.equal(after.intent.direction, 'NO_TRADE', 'with negative memory → should veto');
  assert.ok(after.decision.memoryIds.length > 0, 'decision must reference retrieved memories');
  assert.ok(after.decision.finalConfidence < 0.5, 'final confidence must be below the no-trade threshold');

  // 4) Pattern and scar are present — the veto came from earned memory.
  const patterns = await repo.listPatterns(AGENT);
  const scars = await repo.listScars(AGENT);
  assert.ok(patterns.length > 0, 'a pattern should be detected');
  assert.ok(scars.length > 0, 'a scar should be created');

  // 5) The reasoning trace cites the memories — influence is explainable.
  const cited = after.decision.reasoning.filter((r) => r.includes('mem-')).length;
  assert.ok(cited > 0, 'reasoning must cite the memory ids that participated');

  // 6) Usage counting happens only through markMemoryUsed (the engine doesn't
  //    silently bump counts on retrieval alone).
  const retrievedIds = after.decision.memoryIds;
  await markMemoryUsed(repo, AGENT, retrievedIds);
  const first = await repo.getMemory(AGENT, retrievedIds[0]!);
  assert.equal(first!.retrievedCount, 1, 'usage is recorded when the agent uses memory');
});
