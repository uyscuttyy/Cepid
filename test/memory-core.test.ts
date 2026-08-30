/**
 * Memory core: importance, similarity, persistence, decay, scars.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JsonMemoryRepository } from '../src/memory/repository.js';
import { deriveSignals, scoreImportance } from '../src/memory/importance.js';
import { similarity } from '../src/memory/similarity.js';
import { runDecay, reinforce } from '../src/memory/decay.js';
import { linkPatterns } from '../src/memory/linker.js';
import { updateScars } from '../src/memory/scars.js';
import { evaluateAndStore } from '../src/memory/evaluator.js';
import type { Experience, MarketContext } from '../src/config/types.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'cepid-memcore-'));
  return { repo: new JsonMemoryRepository(dir), dir };
}

const ctxA: MarketContext = {
  asset: 'BTC',
  timeframe: '15M',
  yesPrice: 0.6,
  midpointDistance: 0.1,
  volatility: 'high',
  momentum: 'up',
  liquidity: 'medium',
  timeRemainingBucket: '>10m',
};

const ctxB: MarketContext = {
  ...ctxA,
  yesPrice: 0.62,
};

const ctxFar: MarketContext = {
  ...ctxA,
  asset: 'ETH',
  timeframe: '1H',
  yesPrice: 0.4,
  volatility: 'low',
  momentum: 'down',
  liquidity: 'low',
  timeRemainingBucket: '<2m',
};

test('importance: surprising high-confidence loss scores high', () => {
  const baseConfidence = 0.8;
  const signals = deriveSignals(
    { outcome: { outcome: 'LOSS', pnl: -0.5, expectation: 'x', lesson: 'l' }, conditions: ctxA, decision: { direction: 'YES', baseConfidence, memoryInfluence: 0, finalConfidence: baseConfidence, memoryIds: [] } },
    false,
    null,
    0.5,
  );
  assert.equal(signals.surprise, true);
  const score = scoreImportance(
    { outcome: { outcome: 'LOSS', pnl: -0.5, expectation: 'x', lesson: 'l' }, conditions: ctxA, decision: { direction: 'YES', baseConfidence, memoryInfluence: 0, finalConfidence: baseConfidence, memoryIds: [] } },
    signals,
    { memoryCount: 0, hasSimilar: false, patternWinRate: null, pnlScale: 0.5 },
  );
  assert.ok(score > 0.4, `expected high importance, got ${score}`);
});

test('importance: ordinary win scores low', () => {
  const baseConfidence = 0.55;
  const exp = { outcome: { outcome: 'WIN' as const, pnl: 0.1, expectation: 'x', lesson: 'l' }, conditions: ctxA, decision: { direction: 'YES' as const, baseConfidence, memoryInfluence: 0, finalConfidence: baseConfidence, memoryIds: [] as string[] } };
  const signals = deriveSignals(exp, true, 0.6, 0.5);
  const score = scoreImportance(
    exp,
    signals,
    { memoryCount: 5, hasSimilar: true, patternWinRate: 0.6, pnlScale: 0.5 },
  );
  assert.ok(score < 0.6, `expected low-ish importance for ordinary win, got ${score}`);
});

test('similarity: near-identical contexts score high', () => {
  assert.ok(similarity(ctxA, ctxB) > 0.9);
});

test('similarity: very different contexts score low', () => {
  assert.ok(similarity(ctxA, ctxFar) < 0.3);
});

test('persistence: experiences survive a fresh repository', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'cepid-persist-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const repo1 = new JsonMemoryRepository(dir);
  const exp: Experience = {
    id: 'exp-1',
    sessionId: 's',
    marketId: 'm',
    asset: 'BTC',
    timeframe: '15M',
    createdAt: new Date().toISOString(),
    conditions: ctxA,
    decision: { direction: 'YES', baseConfidence: 0.7, memoryInfluence: 0, finalConfidence: 0.7, memoryIds: [] },
    execution: { executedAt: new Date().toISOString() },
    outcome: { outcome: 'WIN', pnl: 0.1, expectation: 'x', lesson: 'l' },
    importance: 0.5,
    surprising: false,
    strength: 1,
    tags: ['t'],
  };
  await repo1.putExperience(exp);

  // Fresh repo instance — simulates process restart
  const repo2 = new JsonMemoryRepository(dir);
  const reloaded = await repo2.getExperience('exp-1');
  assert.ok(reloaded, 'experience should survive a fresh repository');
  assert.equal(reloaded.outcome.outcome, 'WIN');
});

test('patterns and scars: repeated losses produce a scar', async (t) => {
  const { repo, dir } = tempRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  for (let i = 0; i < 3; i++) {
    await evaluateAndStore(repo, {
      sessionId: 's',
      market: { id: 'm', title: 'm', asset: 'BTC', timeframe: '15M', expiresAt: 0, active: false, yesPrice: 0, yesBidSize: 0, yesAskSize: 0, minShares: 1 },
      conditions: ctxA,
      decision: { decision: 'YES', baseConfidence: 0.8, memoryInfluence: 0, finalConfidence: 0.8, memoryIds: [], reasoning: [] },
      intent: { marketId: 'm', direction: 'YES', shares: 1, price: 0.6, baseConfidence: 0.8, reason: '', createdAt: '' },
      execution: { executedAt: '' },
      outcome: 'LOSS',
      pnl: -0.5,
      expectation: '',
      lesson: '',
    });
  }
  await linkPatterns(repo);
  await updateScars(repo);
  const patterns = await repo.listPatterns();
  const scars = await repo.listScars();
  assert.ok(patterns.length > 0);
  assert.ok(scars.length > 0, 'scars should appear after repeated losses');
  assert.ok(scars[0]!.strength >= 0.7);
});

test('decay: experiences lose strength over time', async (t) => {
  const { repo, dir } = tempRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const exp: Experience = {
    id: 'exp-decay',
    sessionId: 's',
    marketId: 'm',
    asset: 'BTC',
    timeframe: '15M',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    conditions: ctxA,
    decision: { direction: 'YES', baseConfidence: 0.7, memoryInfluence: 0, finalConfidence: 0.7, memoryIds: [] },
    execution: { executedAt: '' },
    outcome: { outcome: 'WIN', pnl: 0.1, expectation: '', lesson: '' },
    importance: 0.5,
    surprising: false,
    strength: 1,
    tags: [],
  };
  await repo.putExperience(exp);
  // Seed the meta's lastDecayAt
  await repo.setMeta({
    experienceCount: 1, patternCount: 0, scarCount: 0,
    lastDecayAt: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(), // 10h ago
    pnlScale: 0.1,
  });
  await runDecay(repo, new Date());
  const after = await repo.getExperience('exp-decay');
  assert.ok(after && after.strength < 1, 'strength should have decayed');
});

test('reinforce: bumps strength', async (t) => {
  const { repo, dir } = tempRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const exp: Experience = {
    id: 'exp-r',
    sessionId: 's',
    marketId: 'm',
    asset: 'BTC',
    timeframe: '15M',
    createdAt: new Date().toISOString(),
    conditions: ctxA,
    decision: { direction: 'YES', baseConfidence: 0.7, memoryInfluence: 0, finalConfidence: 0.7, memoryIds: [] },
    execution: { executedAt: '' },
    outcome: { outcome: 'WIN', pnl: 0.1, expectation: '', lesson: '' },
    importance: 0.5,
    surprising: false,
    strength: 0.5,
    tags: [],
  };
  await repo.putExperience(exp);
  await reinforce(repo, 'exp-r', 0.3);
  const after = await repo.getExperience('exp-r');
  assert.equal(after?.strength, 0.8);
});
