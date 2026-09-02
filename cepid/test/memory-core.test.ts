/**
 * Engine tests against the generic schema — run on the REAL Sibyl substrate
 * (sidecar on a scratch DB) since Phase 2 removed the JSON fallback store.
 * Covers: importance, similarity, patterns, scars, decay, reinforcement,
 * retrieval ranking, usage counting, the outcome-independence regression,
 * and the key-material rejection boundary.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  type MemoryRecord,
  type Situation,
  type MemoryOutcome,
  type SibylRepository,
  assertNoKeyMaterial,
  CepidError,
} from '@cepid/server';
import { startSidecar, repoFor, type SidecarFixture } from './helpers/sidecar.js';
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

/** Boot the real substrate + repository for one test; auto-disposed. */
async function withRepo(fn: (repo: SibylRepository, fx: SidecarFixture) => Promise<void>): Promise<void> {
  const fx = await startSidecar();
  try {
    await fn(repoFor(fx), fx);
  } finally {
    await fx.dispose();
  }
}

const ethSituation: Situation = {
  domain: 'prediction-market',
  text: 'ETH high volatility, liquidity declining, price falling rapidly, considering LONG',
  facets: { asset: 'ETH', volatility: 'high', liquidity: 'declining', momentum: 'down', direction: 'LONG' },
};

function badOutcome(magnitude = -0.62): MemoryOutcome {
  return {
    result: 'LOSS', valence: 'bad', magnitude, metrics: { pnl: magnitude },
    marketOutcome: 'NO_WON', tradeOutcome: 'LOSS', observedAt: new Date().toISOString(),
  };
}

function goodOutcome(magnitude = 0.31): MemoryOutcome {
  return {
    result: 'WIN', valence: 'good', magnitude, metrics: { pnl: magnitude },
    marketOutcome: 'YES_WON', tradeOutcome: 'WIN', observedAt: new Date().toISOString(),
  };
}

async function seedExperience(
  repo: SibylRepository,
  situation: Situation,
  outcome: MemoryOutcome,
  confidenceBase = 0.78,
): Promise<MemoryRecord> {
  return evaluateAndStore(repo, {
    agentId: AGENT, situation,
    decision: {
      action: 'LONG', confidenceBase, confidenceFinal: confidenceBase,
      memoryInfluence: 0, memoryIds: [], reasoning: ['seed'],
    },
    outcome, source: 'test-seed', decisionId: null,
  });
}

/* ---------------------------------------------------------- importance ---- */

test('importance: bad outcomes outweigh good; surprise and novelty add', () => {
  const base = { situation: ethSituation, action: 'LONG', confidenceBase: 0.78 };
  const bad = deriveSignals({ ...base, outcome: badOutcome() }, false, null, 0.6);
  const good = deriveSignals({ ...base, outcome: goodOutcome() }, false, null, 0.6);
  const ctx = { memoryCount: 0, patternBadRate: null as number | null, magnitudeScale: 0.6 };
  const badScore = scoreImportance({ ...base, outcome: badOutcome() }, bad, { ...ctx, hasSimilar: false });
  const goodScore = scoreImportance({ ...base, outcome: goodOutcome() }, good, { ...ctx, hasSimilar: false });
  assert.ok(badScore > goodScore, `bad (${badScore}) must outweigh good (${goodScore})`);
  assert.ok(badScore > 0.5, 'confident loss should be strongly remembered');
  assert.ok(badScore <= 1 && goodScore >= 0 && goodScore <= 1);
});

test('importance: novel experiences score higher than repeats', () => {
  const base = { situation: ethSituation, action: 'LONG', confidenceBase: 0.6, outcome: badOutcome() };
  const novel = deriveSignals(base, false, null, 0.6);
  const repeat = deriveSignals(base, true, null, 0.6);
  assert.ok(novel.novel && !repeat.novel);
  const ctx = { memoryCount: 0, hasSimilar: false, patternBadRate: null as number | null, magnitudeScale: 0.6 };
  const n = scoreImportance(base, novel, ctx);
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
  const near: Situation = { domain: 'prediction-market', text: 'price', facets: { price: 0.6 } };
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

test('repository on Sibyl: per-agent isolation through the store', async () => {
  await withRepo(async (repo) => {
    const mine = await seedExperience(repo, ethSituation, badOutcome());
    assert.ok(await repo.getMemory('agent-A', mine.id) === null);
    assert.equal((await repo.listMemories('agent-A')).length, 0);
    assert.equal((await repo.listMemories(AGENT)).length, 1);
    const hits = await retrieveMemories(repo, 'agent-A', ethSituation);
    assert.equal(hits.length, 0, 'agent A must not retrieve agent B memories');
    assert.ok(mine.agentId === AGENT);
  });
});

/* --------------------------------------------------- patterns and scars --- */

test('patterns form from repeated situations; scars from repeated failures', async () => {
  await withRepo(async (repo) => {
    for (let i = 0; i < 4; i++) await seedExperience(repo, ethSituation, badOutcome());
    const patterns = await linkPatterns(repo, AGENT);
    assert.ok(patterns.length > 0, 'a pattern should form from 4 similar experiences');
    assert.ok(patterns[0]!.badRate >= 0.9);
    const scars = await updateScars(repo, AGENT);
    assert.ok(scars.length > 0, 'a consistently bad pattern must scar');
  });
  await withRepo(async (repo) => {
    for (let i = 0; i < 4; i++) await seedExperience(repo, ethSituation, goodOutcome());
    await linkPatterns(repo, AGENT);
    assert.equal((await updateScars(repo, AGENT)).length, 0, 'winning patterns never scar');
  });
});

/* ---------------------------------------------------------------- decay --- */

test('decay weakens over time; reinforce counters it; weaken floors at 0.05', async () => {
  await withRepo(async (repo) => {
    const m = await seedExperience(repo, ethSituation, badOutcome());
    assert.equal(m.strength, 1.0);

    await runDecay(repo, AGENT); // establishes baseline timestamp
    const later = new Date(Date.now() + 10 * 3_600_000);
    await runDecay(repo, AGENT, later);
    const decayed = await repo.getMemory(AGENT, m.id);
    assert.ok(decayed!.strength < 1.0, 'strength must decay');
    assert.ok(decayed!.strength >= 0.05, 'floor is 0.05');

    await reinforce(repo, AGENT, m.id, VALIDATED_GAIN);
    const reinforced = await repo.getMemory(AGENT, m.id);
    assert.ok(reinforced!.strength > decayed!.strength, 'reinforce must raise strength');

    await weaken(repo, AGENT, m.id, 5);
    const weakened = await repo.getMemory(AGENT, m.id);
    assert.ok(Math.abs(weakened!.strength - 0.05) < 1e-9, 'weaken clamps at floor');
  });
});

/* ----------------------------------------------------------- retrieval ---- */

test('retrieval ranks by score; markMemoryUsed bumps real counts only', async () => {
  await withRepo(async (repo) => {
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

    assert.equal((await repo.getMemory(AGENT, loser.id))!.retrievedCount, 0);
    await markMemoryUsed(repo, AGENT, [loser.id]);
    assert.equal((await repo.getMemory(AGENT, loser.id))!.retrievedCount, 1);
    await markMemoryUsed(repo, AGENT, ['mem-does-not-exist']); // no-op, never invented
    assert.equal((await repo.getMemory(AGENT, loser.id))!.retrievedCount, 1);
  });
});

/* ------------------------------------------- THE correctness regression --- */

test('REGRESSION: marketOutcome and tradeOutcome stay independent', async () => {
  await withRepo(async (repo) => {
    // The old bug: NO position, market resolves YES_WON → old code stored
    // WIN with negative PnL. Now: three independent facts.
    const noHold: MemoryOutcome = {
      result: 'LOSS', valence: 'bad', magnitude: -0.615,
      metrics: { pnl: -0.615, shares: 1 },
      marketOutcome: 'YES_WON', tradeOutcome: 'LOSS',
      observedAt: new Date().toISOString(),
    };
    const mem = await seedExperience(repo, ethSituation, noHold);
    assert.ok(mem.outcome);
    assert.equal(mem.outcome.marketOutcome, 'YES_WON');
    assert.equal(mem.outcome.tradeOutcome, 'LOSS');
    assert.ok(mem.outcome.metrics.pnl! < 0, 'PnL is independent and authoritative');

    const yesWin: MemoryOutcome = {
      result: 'WIN', valence: 'good', magnitude: 0.385, metrics: { pnl: 0.385 },
      marketOutcome: 'YES_WON', tradeOutcome: 'WIN',
      observedAt: new Date().toISOString(),
    };
    const mem2 = await seedExperience(repo, ethSituation, yesWin);
    assert.ok(mem2.outcome);
    assert.equal(mem2.outcome.tradeOutcome, 'WIN');
    assert.equal(mem2.outcome.marketOutcome, 'YES_WON');
    assert.ok(mem2.outcome.metrics.pnl! > 0);
  });
});

/* ------------------------------------------------------------ key hygiene - */

test('REGRESSION: key-shaped input is rejected at the engine boundary', async () => {
  await withRepo(async (repo) => {
    const key = '0x' + 'a'.repeat(64);
    const poisoned: Situation = {
      domain: 'prediction-market',
      text: `agent wallet ${key}`,
      facets: { asset: 'ETH', wallet: key },
    };
    await assert.rejects(
      () => seedExperience(repo, poisoned, badOutcome()),
      (e: unknown) => e instanceof Error && /key-shaped/i.test(e.message),
      'engine must refuse key material with a precise error',
    );

    // txHash is fine in the structured evidence field (by name).
    const ok = await seedExperience(repo, ethSituation, {
      ...badOutcome(),
      evidence: { chain: 'base-sepolia', txHash: '0x' + 'b'.repeat(64), blockNumber: 42 },
    });
    assert.ok(ok.outcome?.evidence?.txHash);

    // And the substrate itself must contain no key-shaped strings outside evidence.
    const rows = await repo.listMemories(AGENT);
    const serialized = JSON.stringify(rows).replace(/"txHash":"0x[0-9a-fA-F]{64}"/g, '');
    assert.equal(/0x[0-9a-fA-F]{64}/.test(serialized), false, 'no key-shaped strings outside evidence');
  });
});

test('assertNoKeyMaterial: unit checks of the boundary itself', () => {
  const key = '0x' + 'c'.repeat(64);
  assert.throws(() => assertNoKeyMaterial({ a: key }), CepidError);
  assert.throws(() => assertNoKeyMaterial({ nested: { deep: [key] } }), CepidError);
  assert.throws(() => assertNoKeyMaterial(`plain ${key} text`), CepidError);
  assert.doesNotThrow(() => assertNoKeyMaterial({ evidence: { txHash: key } }), 'evidence.txHash is exempt by name');
  assert.doesNotThrow(() => assertNoKeyMaterial({ ok: '0x1234', price: 0.5 }));
});

/* ------------------------------------------------------------- evaluator -- */

test('evaluator maintains meta and stores nothing invented', async () => {
  await withRepo(async (repo) => {
    const before = await repo.getMeta(AGENT);
    assert.equal(before.experienceCount, 0);
    const mem = await seedExperience(repo, ethSituation, badOutcome());
    const after = await repo.getMeta(AGENT);
    assert.equal(after.experienceCount, 1, 'meta count maintained by the engine');
    assert.ok(mem.importance > 0 && mem.importance <= 1);
    assert.equal(mem.retrievedCount, 0, 'fresh memories have zero usage — counts are earned');
    // journal recorded the write
    const events = await repo.listEvents(AGENT, { limit: 10 });
    assert.ok(events.some((e) => e.type === 'memory.created'));
  });
});
