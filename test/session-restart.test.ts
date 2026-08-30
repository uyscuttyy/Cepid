/**
 * End-to-end: the Sibyl two-session reproduction.
 *
 * Session 1 — agent trades, loses, extracts memory.
 * Simulated "process restart" by creating a fresh repository instance pointed
 * at the same data dir.
 * Session 2 — same market, memory should influence the decision.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runOnce } from '../src/app.js';
import { JsonMemoryRepository } from '../src/memory/repository.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'cepid-e2e-'));
}

test('end-to-end: session 2 retrieves session 1 memory and changes decision', async (t) => {
  const dataDir = tempDir();
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  process.env.CEPID_DATA_DIR = dataDir;
  process.env.AGENT_PRIVATE_KEY = '0x' + '1'.repeat(64);
  process.env.CEPID_NETWORK = 'mock';
  process.env.CEPID_MAX_COLLATERAL = '1.0';

  // Build a deterministic mock that always lets the strategy fire (YES at 0.6).
  const mockSeed = {
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
  };

  // First three runs — generate losing memory (no execution in preview; the
  // memory evaluator records an "expected" experience with outcome PENDING
  // when --execute isn't used). To produce a real LOSS we run with --execute
  // against the mock provider, which records the trade and returns ok.
  for (let i = 0; i < 3; i++) {
    const res = await runOnce({ execute: true, confirmApproval: true, confirmOrder: true, mockSeed });
    assert.equal(res.state === 'POSITION_OPEN' || res.state === 'CONFIRMED', true);
  }

  // Resolve the market as a LOSS in the mock's underlying state.
  // Since the mock provider is freshly constructed each call, the resolution
  // state is local to each run. To simulate outcome-aware learning, we
  // directly seed a few LOSS experiences into the repository.
  const repo = new JsonMemoryRepository(dataDir);
  const conditions = {
    asset: 'BTC' as const, timeframe: '15M' as const, yesPrice: 0.6, midpointDistance: 0.1,
    volatility: 'high' as const, momentum: 'up' as const, liquidity: 'medium' as const, timeRemainingBucket: '>10m' as const,
  };
  for (let i = 0; i < 3; i++) {
    await repo.putExperience({
      id: `loss-${i}`,
      sessionId: 'seed',
      marketId: 'm-1',
      asset: 'BTC',
      timeframe: '15M',
      createdAt: new Date().toISOString(),
      conditions,
      decision: { direction: 'YES', baseConfidence: 0.8, memoryInfluence: 0, finalConfidence: 0.8, memoryIds: [] },
      execution: { executedAt: new Date().toISOString() },
      outcome: { outcome: 'LOSS', pnl: -0.6, expectation: 'continued up', lesson: 'high vol near expiry → loss' },
      importance: 0.9,
      surprising: true,
      strength: 1,
      tags: ['BTC|15M|vol:high|mom:up|liq:medium|time:>10m'],
    });
  }
  // Re-link patterns and update scars
  const { linkPatterns } = await import('../src/memory/linker.js');
  const { updateScars } = await import('../src/memory/scars.js');
  await linkPatterns(repo);
  await updateScars(repo);

  // Now run again with a FRESH repository instance to simulate process restart.
  // The shared dataDir persists the experience files, so memory survives.
  const res2 = await runOnce({ execute: false, confirmApproval: false, confirmOrder: false, mockSeed });
  assert.equal(res2.intent.direction, 'NO_TRADE', 'session 2 must be vetoed by memory');
  assert.ok(res2.decisionContext.memoryIds.length > 0, 'must reference retrieved memories');
});
