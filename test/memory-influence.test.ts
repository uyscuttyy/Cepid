/**
 * Memory influence — the load-bearing test for CEPID's core thesis.
 *
 * Proves: given the same market conditions, the same base strategy
 * produces BUY_YES when no relevant memory exists, and NO_TRADE when
 * the agent has accumulated scars from similar losing setups.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JsonMemoryRepository } from '../src/memory/repository.js';
import { evaluateAndStore } from '../src/memory/evaluator.js';
import { linkPatterns } from '../src/memory/linker.js';
import { updateScars } from '../src/memory/scars.js';
import { MemoryInformedDecisionEngine } from '../src/decision/engine.js';
import { DeterministicStrategy } from '../src/strategy/base-strategy.js';
import { deriveContext } from '../src/strategy/context.js';
import type { MarketContext, MarketSnapshot, OrderBook, DecisionContext } from '../src/config/types.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  const dir = mkdtempSync(join(tmpdir(), 'cepid-mem-'));
  return { repo: new JsonMemoryRepository(dir), dir };
}

async function seedLosingStreak(repo: JsonMemoryRepository) {
  // Pre-populate the memory with several LOSS outcomes under near-identical conditions.
  // This should produce a pattern and a scar.
  const conditions: MarketContext = {
    asset: 'BTC',
    timeframe: '15M',
    yesPrice: 0.58,
    midpointDistance: 0.08,
    volatility: 'high',
    momentum: 'up',
    liquidity: 'medium',
    timeRemainingBucket: '>10m',
  };
  for (let i = 0; i < 4; i++) {
    const decision: DecisionContext = {
      decision: 'YES',
      baseConfidence: 0.78,
      memoryInfluence: 0,
      finalConfidence: 0.78,
      memoryIds: [],
      reasoning: ['seed'],
    };
    await evaluateAndStore(repo, {
      sessionId: 'seed-session',
      market: baseMarket,
      conditions,
      decision,
      intent: {
        marketId: baseMarket.id,
        direction: 'YES',
        shares: 1,
        price: 0.58,
        baseConfidence: 0.78,
        reason: 'seed',
        createdAt: new Date().toISOString(),
      },
      execution: { executedAt: new Date().toISOString(), entryPrice: 0.58, shares: 1 },
      outcome: 'LOSS',
      pnl: -0.58,
      expectation: 'Continued upward move',
      lesson: 'High volatility near expiry kept producing losses.',
    });
  }
  await linkPatterns(repo);
  await updateScars(repo);
}

test('memory changes the decision (the central product thesis)', async (t) => {
  const { repo, dir } = tempRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const conditions = deriveContext(baseMarket, baseBook);
  const engine = new MemoryInformedDecisionEngine({
    strategy: new DeterministicStrategy(),
    memory: repo,
  });

  // 1) Without memory, the base strategy is allowed to act.
  const before = await engine.decide(baseMarket, baseBook, conditions);
  assert.equal(before.intent.direction, 'YES', 'no memory → base strategy should fire');

  // 2) Seed the memory with repeated losses under identical conditions.
  await seedLosingStreak(repo);

  // 3) With memory, the same market produces NO_TRADE.
  const after = await engine.decide(baseMarket, baseBook, conditions);
  assert.equal(after.intent.direction, 'NO_TRADE', 'with negative memory → should veto');
  assert.ok(after.decision.memoryIds.length > 0, 'decision must reference retrieved memories');
  assert.ok(after.decision.finalConfidence < 0.5, 'final confidence must be below the no-trade threshold');

  // 4) The pattern and scar are present
  const patterns = await repo.listPatterns();
  const scars = await repo.listScars();
  assert.ok(patterns.length > 0, 'a pattern should be detected');
  assert.ok(scars.length > 0, 'a scar should be created');
});
