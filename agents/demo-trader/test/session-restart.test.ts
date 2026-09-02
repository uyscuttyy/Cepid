/**
 * End-to-end: the two-session reproduction — memory survives a process
 * restart and changes the next decision.
 *
 * Session 1 runs (fresh repository instance), loses on similar setups, and
 * memory is written. Session 2 constructs a NEW repository instance over the
 * same data dir (the restart simulation), encounters the same situation, and
 * must be vetoed by the memory it cannot see in-process — only via the
 * persisted store.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runOnce } from '../src/app.js';
import { JsonMemoryRepository } from '@cepid/server';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MemoryOutcome, Situation } from '@cepid/server';
import { evaluateAndStore, linkPatterns, updateScars } from '@cepid/server';
import { toSituation } from '../src/config/types.js';

const AGENT = 'agent-demo-trader';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'cepid-e2e-'));
}

const mockSeed = () => ({
  markets: [
    {
      snapshot: {
        id: 'm-1', title: 'BTC 15m', asset: 'BTC' as const, timeframe: '15M' as const,
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        active: true, yesPrice: 0.55, yesBidSize: 10, yesAskSize: 10, minShares: 1, liquidity: 500,
      },
      book: {
        bids: [{ price: 0.54, size: 10 }],
        asks: [{ price: 0.56, size: 10 }],
      },
    },
  ],
});

test('end-to-end: session 2 retrieves session 1 memory and changes decision', async (t) => {
  const dataDir = tempDir();
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  process.env.CEPID_DATA_DIR = dataDir;
  process.env.DEMO_AGENT_ID = AGENT;
  process.env.CEPID_NETWORK = 'mock';
  process.env.CEPID_MAX_COLLATERAL = '1.0';
  delete process.env.AGENT_PRIVATE_KEY; // no wallet needed for the mock path

  // Session 1: a run with empty memory — base strategy fires.
  const first = await runOnce({ execute: false, confirmApproval: false, confirmOrder: false, mockSeed: mockSeed() });
  assert.equal(first.intent.direction, 'YES', 'no memory → base strategy fires');
  assert.equal(first.retrieved.length, 0, 'fresh agent has no relevant memories');

  // Seed the earned memory: repeated losses under the same conditions.
  // (Seeding via the platform evaluator, not raw file writes: same path the
  // real loop uses, including importance + journal.)
  const situation: Situation = {
    domain: 'prediction-market',
    text: 'BTC 15M binary market, high volatility, liquidity medium, momentum up, midpoint 0.55, >10m remaining, considering YES',
    facets: { asset: 'BTC', timeframe: '15M', volatility: 'high', momentum: 'up', liquidity: 'medium', timeRemaining: '>10m', midpoint: 0.55 },
  };
  const loss: MemoryOutcome = {
    result: 'LOSS', valence: 'bad', magnitude: -0.56, metrics: { pnl: -0.56 },
    marketOutcome: 'NO_WON', tradeOutcome: 'LOSS', observedAt: new Date().toISOString(),
  };
  {
    const repo = new JsonMemoryRepository(dataDir);
    for (let i = 0; i < 4; i++) {
      await evaluateAndStore(repo, {
        agentId: AGENT, situation,
        decision: { action: 'YES', confidenceBase: 0.8, confidenceFinal: 0.8, memoryInfluence: 0, memoryIds: [], reasoning: ['seed'] },
        outcome: loss, source: 'seed', decisionId: null,
      });
    }
    await linkPatterns(repo, AGENT);
    await updateScars(repo, AGENT);
  }

  // Session 2: NEW repository instance over the same data — the restart.
  // The agent must be vetoed by memory it can only reach through the store.
  const second = await runOnce({ execute: false, confirmApproval: false, confirmOrder: false, mockSeed: mockSeed() });
  assert.equal(second.intent.direction, 'NO_TRADE', 'session 2 must be vetoed by memory');
  assert.ok(second.decisionContext.memoryIds.length > 0, 'decision must reference the retrieved memories');
  assert.ok(second.decisionContext.finalConfidence < 0.5, 'confidence must drop below the threshold');

  // The events file must contain no key material — the key-leak regression.
  const eventsRaw = readFileSync(join(dataDir, 'events.json'), 'utf8');
  assert.equal(/0x[0-9a-fA-F]{64}/.test(eventsRaw), false, 'events.json must never contain key-shaped values');

  // The stored memories carry the independent outcome fields.
  const repo = new JsonMemoryRepository(dataDir);
  const stored = await repo.listMemories(AGENT);
  const seeded = stored.find((m) => m.source === 'seed');
  assert.ok(seeded, 'seeded memory persisted');
  assert.equal(seeded!.outcome!.marketOutcome, 'NO_WON');
  assert.equal(seeded!.outcome!.tradeOutcome, 'LOSS');
  assert.ok(seeded!.outcome!.metrics.pnl! < 0);
});
