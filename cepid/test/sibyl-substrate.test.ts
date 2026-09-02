/**
 * SIBYL SUBSTRATE TESTS — the load-bearing gate, made mechanical.
 *
 * These tests run against the real sidecar process on a scratch DB:
 *   1. Round-trips: memory → Sibyl → retrieval, through the same repository
 *      production uses.
 *   2. Restart survival: kill the sidecar, restart it on the SAME DB file,
 *      memory must still be there (the two-session demo's foundation).
 *   3. THE GATE: kill the sidecar and every core operation must fail with
 *      MEMORY_SUBSTRATE_UNAVAILABLE. No fallback, no graceful degrade —
 *      the product's core function is gone. This is the hackathon's
 *      litmus test in executable form.
 *   4. Tenant isolation through the full stack.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SibylRepository, isSubstrateUnavailable, evaluateAndStore, retrieveMemories } from '@cepid/server';
import type { MemoryRecord, MemoryOutcome, Situation } from '@cepid/server';
import { startSidecar, repoFor, type SidecarFixture } from './helpers/sidecar.js';

const AGENT = 'agent-substrate-test';

const situation: Situation = {
  domain: 'prediction-market',
  text: 'ETH high volatility, liquidity declining, price falling, considering LONG',
  facets: { asset: 'ETH', volatility: 'high', liquidity: 'declining', momentum: 'down' },
};

const loss: MemoryOutcome = {
  result: 'LOSS',
  valence: 'bad',
  magnitude: -0.62,
  metrics: { pnl: -0.62 },
  marketOutcome: 'NO_WON',
  tradeOutcome: 'LOSS',
  observedAt: new Date().toISOString(),
};

async function seedOneLoss(repo: SibylRepository): Promise<MemoryRecord> {
  return evaluateAndStore(repo, {
    agentId: AGENT,
    situation,
    decision: {
      action: 'LONG', confidenceBase: 0.78, confidenceFinal: 0.78,
      memoryInfluence: 0, memoryIds: [], reasoning: ['seed'],
    },
    outcome: loss,
    source: 'substrate-test',
    decisionId: null,
  });
}

test('substrate: memory round-trips through Sibyl', async (t) => {
  const fx = await startSidecar();
  t.after(() => fx.dispose());
  const repo = repoFor(fx);

  const stored = await seedOneLoss(repo);
  const fetched = await repo.getMemory(AGENT, stored.id);
  assert.ok(fetched, 'memory must come back from Sibyl');
  assert.equal(fetched!.id, stored.id);
  assert.equal(fetched!.outcome!.valence, 'bad');
  assert.equal(fetched!.outcome!.marketOutcome, 'NO_WON');
  assert.equal(fetched!.outcome!.tradeOutcome, 'LOSS');
  assert.ok(fetched!.outcome!.metrics.pnl! < 0);

  // Retrieval through the engine finds it
  const hits = await retrieveMemories(repo, AGENT, situation, { minSimilarity: 0.3 });
  assert.ok(hits.length > 0, 'retrieval must find the stored memory');
  assert.equal(hits[0]!.memory.id, stored.id);

  // Meta tracked on the state tier
  const meta = await repo.getMeta(AGENT);
  assert.ok(meta.experienceCount >= 1);
});

test('substrate: memory survives a full sidecar restart (process death)', async (t) => {
  const fx = await startSidecar();
  t.after(() => fx.dispose());
  const repo = repoFor(fx);

  const stored = await seedOneLoss(repo);
  const before = await repo.listMemories(AGENT);
  assert.equal(before.length, 1);

  // PROCESS RESTART: kill the sidecar dead, bring a NEW process up on the
  // SAME DB file. Nothing survives in the dead process's memory.
  const dbPath = fx.dbPath;
  fx.kill();
  await fx.waitDown();

  const fx2 = await startSidecar(dbPath);
  t.after(() => fx2.dispose());
  const repo2 = new SibylRepository(fx2.baseUrl, fx2.token);

  const after = await repo2.listMemories(AGENT);
  assert.equal(after.length, 1, 'memory must survive the restart');
  assert.equal(after[0]!.id, stored.id);
  assert.equal(after[0]!.outcome!.marketOutcome, 'NO_WON');

  const hits = await retrieveMemories(repo2, AGENT, situation, { minSimilarity: 0.3 });
  assert.ok(hits.length > 0, 'a fresh process still retrieves the old memory');
});

test('THE GATE: without Sibyl, every core operation fails — no fallback', async (t) => {
  const fx = await startSidecar();
  t.after(() => fx.dispose());
  const repo = repoFor(fx);

  // Sanity: substrate is up
  await seedOneLoss(repo);

  // Kill it mid-flight — this is "delete the Sibyl Memory layer".
  fx.kill();
  await fx.waitDown();

  // Every core operation must throw MEMORY_SUBSTRATE_UNAVAILABLE.
  const operations: Array<[string, () => Promise<unknown>]> = [
    ['listMemories', () => repo.listMemories(AGENT)],
    ['getMemory', () => repo.getMemory(AGENT, 'anything')],
    ['putMemory', () => repo.putMemory(AGENT, {} as MemoryRecord)],
    ['listPatterns', () => repo.listPatterns(AGENT)],
    ['listScars', () => repo.listScars(AGENT)],
    ['appendEvent', () => repo.appendEvent(AGENT, { type: 'x' })],
    ['getMeta', () => repo.getMeta(AGENT)],
    ['retrieveMemories(engine)', () => retrieveMemories(repo, AGENT, situation)],
    ['evaluateAndStore(engine)', () => evaluateAndStore(repo, {
      agentId: AGENT, situation,
      decision: { action: 'LONG', confidenceBase: 0.5, confidenceFinal: 0.5, memoryInfluence: 0, memoryIds: [], reasoning: [] },
      outcome: loss, source: 'gate', decisionId: null,
    })],
  ];

  for (const [name, op] of operations) {
    await assert.rejects(
      op(),
      (e: unknown) => {
        assert.ok(e instanceof Error, `${name} must fail with an error`);
        assert.ok(isSubstrateUnavailable(e), `${name} must be MEMORY_SUBSTRATE_UNAVAILABLE, got: ${e.message}`);
        return true;
      },
      `${name} must fail when Sibyl is gone`,
    );
  }
});

test('substrate: tenant isolation holds through the full stack', async (t) => {
  const fx = await startSidecar();
  t.after(() => fx.dispose());
  const repo = repoFor(fx);

  await seedOneLoss(repo); // AGENT's memory

  // A different agent sees nothing — through repository AND engine paths.
  const other = 'agent-other';
  assert.equal((await repo.listMemories(other)).length, 0);
  const hits = await retrieveMemories(repo, other, situation, { minSimilarity: 0.0 });
  assert.equal(hits.length, 0, 'isolation must hold at the engine level too');

  // ...and can't fetch AGENT's memory by id either.
  const all = await repo.listMemories(AGENT);
  const stolen = await repo.getMemory(other, all[0]!.id);
  assert.equal(stolen, null, 'cross-agent id fetch returns nothing');
});
