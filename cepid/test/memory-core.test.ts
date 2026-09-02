/**
 * Engine tests against the generic schema — importance, similarity, patterns,
 * scars, decay, reinforcement, and the repository seam.
 *
 * These are the product's unit tests. The demo agent's behavioral tests live
 * in agents/demo-trader/test; load-bearing substrate tests land in Phase 2.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  JsonMemoryRepository,
  DEFAULT_MEMORY_META,
  type MemoryRecord,
  type Situation,
  type MemoryOutcome,
} from '@cepid/server';
import {
  deriveSignals,
  scoreImportance,
  situationSignature,
} from '../src/memory/importance.js';
import { similarity } from '../src/memory/similarity.js';
import { linkPatterns } from '../src/memory/linker.js';
import { updateScars } from '../src/memory/scars.js';
import { runDecay, reinforce, weaken, VALIDATED_GAIN } from '../src/memory/decay.js';
import { evaluateAndStore } from '../src/memory/evaluator.js';
import { retrieveMemories, markMemoryUsed } from '../src/memory/retriever.js';

const AGENT = 'agent-test';

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'cepid-engine-'));
  return { repo: new JsonMemoryRepository(dir), dir };
}

const ethSituation: Situation = {
  domain: 'prediction-market',
  text: 'ETH high volatility, liquidity declining, price falling rapidly, considering LONG',
  facets: { asset: 'ETH', volatility: 'high', liquidity: 'declining', momentum: 'down', direction: 'LONG' },
};

function badOutcome(magnitude = -0.62): MemoryOutcome {
  return {
    result: 'LOSS',
    valence: 'bad',
    magnitude,
    metrics: { pnl: magnitude },
    marketOutcome: 'NO_WON',
    tradeOutcome: 'LOSS',
    observedAt: new Date().toISOString(),
  };
}

function goodOutcome(magnitude = 0.31): MemoryOutcome {
  return {
    result: 'WIN',
    valence: 'good',
    magnitude,
    metrics: { pnl: magnitude },
    marketOutcome: 'YES_WON',
    tradeOutcome: 'WIN',
    observedAt: new Date().toISOString(),
  };
}

async function seedExperience(
  repo: JsonMemoryRepository,
  situation: Situation,
  outcome: MemoryOutcome,
  confidenceBase = 0.78,
): Promise<MemoryRecord> {
  return evaluateAndStore(repo, {
    agentId: AGENT,
    situation,
    decision: {
      action: 'LONG',
      confidenceBase,
      confidenceFinal: confidenceBase,
      memoryInfluence: 0,
      memoryIds: [],
      reasoning: ['seed'],
    },
    outcome,
    source: 'test-seed',
    decisionId: null,
  });
}

/* ---------------------------------------------------------- importance ---- */

test('importance: bad outcomes outweigh good; surprise and novelty add', () => {
  const base = {
    situation: ethSituation,
    action: 'LONG',
    confidenceBase: 0.78,
  };
  const bad = deriveSignals({ ...base, outcome: badOutcome() }, false, null, 0.6);
  const good = deriveSignals({ ...base, outcome: goodOutcome() }, false, null, 0.6);
  const badScore = scoreImportance({ ...base, outcome: badOutcome() }, bad, {
    memoryCount: 0, hasSimilar: false, patternBadRate: null, magnitudeScale: 0.6,
  });
  const goodScore = scoreImportance({ ...base, outcome: goodOutcome() }, good, {
    memoryCount: 0, hasSimilar: false, patternBadRate: null, magnitudeScale: 0.6,
  });
  assert.ok(badScore > goodScore, `bad (${badScore}) must outweigh good (${goodScore})`);
  assert.ok(badScore > 0.5, 'confident loss should be strongly remembered');
  assert.ok(goodScore >= 0, 'scores are in [0,1]');
  assert.ok(badScore <= 1 && goodScore <= 1);
});

test('importance: novel experiences score higher than repeats', () => {
  const base = { situation: ethSituation, action: 'LONG', confidenceBase: 0.6, outcome: badOutcome() };
  const novel = deriveSignals(base, false, null, 0.6);
  const repeat = deriveSignals(base, true, null, 0.6);
  assert.ok(novel.novel && !repeat.novel);
  const ctx = { memoryCount: 0, patternBadRate: null as number | null, magnitudeScale: 0.6 };
  const n = scoreImportance(base, novel, { ...ctx, hasSimilar: false });
  const r = scoreImportance(base, repeat, { ...ctx, hasSimilar: true });
  assert.ok(n > r, 'novelty must add importance');
});

/* ---------------------------------------------------------- similarity ---- */

test('similarity: shared facets drive score; cross-domain is zero', () => {
  const a: Situation = { domain: 'prediction-market', text: 'ETH volatility high', facets: { asset: 'ETH', volatility: 'high' } };
  const b: Situation = { domain: 'prediction-market', text: 'ETH volatility high', facets: { asset: 'ETH', volatility: 'high' } };
  const c: Situation = { domain: 'prediction-market', text: 'BTC calm', facets: { asset: 'BTC', volatility: 'low' } };
  const d: Situation = { domain: 'support', text: 'ETH volatility high', facets: { asset: 'ETH', volatility: 'high' } };
  assert.equal(similarity(a, b), 1);
  assert.ok(similarity(a, c) < 0.5);
  assert.equal(similarity(a, d), 0, 'different domains are never similar');
});

test('similarity: numeric facets compare by distance, not equality', () => {
  const a: Situation = { domain: 'prediction-market', text: 'price', facets: { price: 0.58 } };
  const near: Situation = { domain: 'prediction-market', text: 'price', facets: { price: 0.60 } };
  const far: Situation = { domain: 'prediction-market', text: 'price', facets: { price: 0.05 } };
  assert.ok(similarity(a, near) > similarity(a, far));
});

test('signatures are stable and action-facet free', () => {
  const s1: Situation = { domain: 'x', text: 't', facets: { a: 1, direction: 'LONG' } };
  const s2: Situation = { domain: 'x', text: 't', facets: { direction: 'LONG', a: 1 } };
  assert.equal(situationSignature(s1), situationSignature(s2));
  const s3: Situation = { domain: 'x', text: 't', facets: { a: 1, direction: 'SHORT' } };
  assert.equal(situationSignature(s1), situationSignature(s3), 'action facets do not group');
});

/* ------------------------------------------------------------ repository --- */

test('repository: per-agent isolation in the store itself', async (t) => {
  const { repo, dir } = tempRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const mine = await seedExperience(repo, ethSituation, badOutcome());
  const theirs = await seedExperience(repo, { ...ethSituation, domain: 'other-agent-view' }, goodOutcome());

  // Direct id access is scoped by agentId
  assert.ok(await repo.getMemory('agent-A', mine.id) === null);
  // Listing is scoped
  assert.equal((await repo.listMemories('agent-A')).length, 0);
  assert.equal((await repo.listMemories(AGENT)).length, 2);
  // Cross-agent retrieval returns nothing
  const hits = await retrieveMemories(repo, 'agent-A', ethSituation);
  assert.equal(hits.length, 0, 'agent A must not retrieve agent B memories');
  assert.ok(theirs.agentId === AGENT);
});

/* --------------------------------------------------- patterns and scars --- */

test('patterns form from repeated situations; scars from repeated failures', async (t) => {
  const { repo, dir } = tempRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  for (let i = 0; i < 4; i++) await seedExperience(repo, ethSituation, badOutcome());
  const patterns = await linkPatterns(repo, AGENT);
  assert.ok(patterns.length > 0, 'a pattern should form from 4 similar experiences');
  assert.ok(patterns[0]!.badRate >= 0.9);

  const scars = await updateScars(repo, AGENT);
  assert.ok(scars.length > 0, 'a consistently bad pattern must scar');

  // A good streak in the same situation must NOT scar
  const { repo: repo2, dir: dir2 } = tempRepo();
  t.after(() => rmSync(dir2, { recursive: true, force: true }));
  for (let i = 0; i < 4; i++) await seedExperience(repo2, ethSituation, goodOutcome());
  await linkPatterns(repo2, AGENT);
  assert.equal((await updateScars(repo2, AGENT)).length, 0, 'winning patterns never scar');
});

/* ---------------------------------------------------------------- decay --- */

test('decay weakens over time; scars decay slower; reinforce counters it', async (t) => {
  const { repo, dir } = tempRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const m = await seedExperience(repo, ethSituation, badOutcome());
  assert.equal(m.strength, 1.0);

  // Baseline decay tick (first run establishes timestamp)
  await runDecay(repo, AGENT);
  // Simulate 10 hours later
  const later = new Date(Date.now() + 10 * 3_600_000);
  await runDecay(repo, AGENT, later);
  const decayed = await repo.getMemory(AGENT, m.id);
  assert.ok(decayed!.strength < 1.0, 'strength must decay');
  assert.ok(decayed!.strength >= 0.05, 'floor is 0.05');

  // Reinforcement raises it back (bounded at 1)
  await reinforce(repo, AGENT, m.id, VALIDATED_GAIN);
  const reinforced = await repo.getMemory(AGENT, m.id);
  assert.ok(reinforced!.strength > decayed!.strength, 'reinforce must raise strength');

  // Weaken lowers toward the floor but never below
  await weaken(repo, AGENT, m.id, 5);
  const weakened = await repo.getMemory(AGENT, m.id);
  assert.ok(Math.abs(weakened!.strength - 0.05) < 1e-9, 'weaken clamps at floor');
});

/* ----------------------------------------------------------- retrieval ---- */

test('retrieval ranks by score and markMemoryUsed bumps real counts only', async (t) => {
  const { repo, dir } = tempRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const loser = await seedExperience(repo, ethSituation, badOutcome());
  const calm: Situation = {
    domain: 'prediction-market',
    text: 'BTC low volatility deep liquidity stable',
    facets: { asset: 'BTC', volatility: 'low', liquidity: 'deep', momentum: 'flat', direction: 'LONG' },
  };
  await seedExperience(repo, calm, goodOutcome());

  const hits = await retrieveMemories(repo, AGENT, ethSituation, { minSimilarity: 0.2 });
  assert.ok(hits.length > 0);
  assert.equal(hits[0]!.memory.id, loser.id, 'most similar memory ranks first');

  // Usage counting: only explicit marking increments
  assert.equal((await repo.getMemory(AGENT, loser.id))!.retrievedCount, 0);
  await markMemoryUsed(repo, AGENT, [loser.id]);
  assert.equal((await repo.getMemory(AGENT, loser.id))!.retrievedCount, 1);
  // A fabricated id is a no-op, never an invented count
  await markMemoryUsed(repo, AGENT, ['mem-does-not-exist']);
  assert.equal((await repo.getMemory(AGENT, loser.id))!.retrievedCount, 1);
});

/* ------------------------------------------- THE correctness regression --- */

test('REGRESSION: marketOutcome and tradeOutcome stay independent (the old inversion bug)', async (t) => {
  const { repo, dir } = tempRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  // The exact case the old code got wrong: agent holds NO, market resolves
  // YES-won. Old code stored marketOutcome as the trade outcome (WIN) with
  // negative PnL. Both fields must now be recorded independently and PnL
  // remains the authoritative financial result.
  const noHoldOutcome: MemoryOutcome = {
    result: 'LOSS',
    valence: 'bad',
    magnitude: -0.615,
    metrics: { pnl: -0.615, shares: 1 },
    marketOutcome: 'YES_WON',   // what the environment resolved to
    tradeOutcome: 'LOSS',       // the agent's NO position lost
    observedAt: new Date().toISOString(),
  };
  const mem = await seedExperience(repo, ethSituation, noHoldOutcome);
  assert.ok(mem.outcome);
  assert.equal(mem.outcome.marketOutcome, 'YES_WON');
  assert.equal(mem.outcome.tradeOutcome, 'LOSS');
  const pnl1 = mem.outcome.metrics.pnl;
  assert.ok(pnl1 !== undefined && pnl1 < 0, 'PnL is independent and authoritative');
  assert.equal(mem.outcome.valence, 'bad');

  // And the mirror case: market YES_WON, agent held YES → trade won
  const yesWin: MemoryOutcome = {
    result: 'WIN', valence: 'good', magnitude: 0.385, metrics: { pnl: 0.385 },
    marketOutcome: 'YES_WON', tradeOutcome: 'WIN',
    observedAt: new Date().toISOString(),
  };
  const mem2 = await seedExperience(repo, ethSituation, yesWin);
  assert.ok(mem2.outcome);
  assert.equal(mem2.outcome.tradeOutcome, 'WIN');
  assert.equal(mem2.outcome.marketOutcome, 'YES_WON');
  const pnl2 = mem2.outcome.metrics.pnl;
  assert.ok(pnl2 !== undefined && pnl2 > 0);
});

/* ------------------------------------------------------------ key hygiene - */

test('REGRESSION: key-shaped input is rejected at the engine boundary', async (t) => {
  const { repo, dir } = tempRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  // A key smuggled into situation content must be REJECTED, not stored.
  const key = '0x' + 'a'.repeat(64);
  const poisonedSituation: Situation = {
    domain: 'prediction-market',
    text: `agent wallet ${key}`,
    facets: { asset: 'ETH', wallet: key },
  };
  await assert.rejects(
    () => seedExperience(repo, poisonedSituation, badOutcome()),
    (e: unknown) => e instanceof Error && /key-shaped/i.test(e.message),
    'the engine must refuse key material with a precise error',
  );

  // And a txHash in the structured evidence field is fine (by name).
  const ok = await seedExperience(repo, ethSituation, {
    ...badOutcome(),
    evidence: { chain: 'base-sepolia', txHash: '0x' + 'b'.repeat(64), blockNumber: 42 },
  });
  assert.ok(ok.outcome?.evidence?.txHash);

  // Store is clean of key-shaped strings outside evidence.
  const raw = await import('node:fs/promises').then((fs) =>
    fs.readFile(join(dir, 'memory', 'store.json'), 'utf8'),
  );
  const outsideEvidence = raw.replace(/"txHash":\s*"0x[0-9a-fA-F]{64}"/g, '');
  const keyShape = /0x[0-9a-fA-F]{64}/;
  assert.equal(keyShape.test(outsideEvidence), false, 'no key-shaped strings outside evidence');
});

test('evaluator stores what it is given — nothing invented', async (t) => {
  const { repo, dir } = tempRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const before = await repo.getMeta(AGENT);
  assert.equal(before.experienceCount, 0);
  const mem = await seedExperience(repo, ethSituation, badOutcome());
  const after = await repo.getMeta(AGENT);
  assert.equal(after.experienceCount, 1);
  assert.ok(mem.importance > 0 && mem.importance <= 1);
  assert.equal(mem.agentId, AGENT);
  assert.equal(mem.retrievedCount, 0, 'fresh memories have zero usage — counts are earned');
  assert.equal(mem.decision.memoryIds.length, 0);
});
