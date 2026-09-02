/**
 * End-to-end on Sibyl: session 1 runs against the substrate, loses; session 2
 * — a COMPLETELY NEW sidecar process on the same DB — retrieves that memory
 * and gets vetoed. The restart is real: new uvicorn process, new repository
 * instance, nothing in memory but the DB.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runOnce } from '../src/app.js';
import { evaluateAndStore, linkPatterns, updateScars, SibylRepository } from '@cepid/server';
import type { MemoryOutcome, Situation } from '@cepid/server';
import { toSituation } from '../src/config/types.js';
import { withSidecar } from './helpers/sidecar.js';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENT = 'agent-demo-trader';
const here = fileURLToPath(new URL('.', import.meta.url));
const SIDECAR_DIR = join(here, '../../..', 'sidecar');

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

/** Boot a raw sidecar on a specific db path; returns handle. */
async function bootSidecar(dbPath: string, port: number): Promise<{ baseUrl: string; token: string; proc: ChildProcess }> {
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = `agent-e2e-${port}`;
  const proc = spawn(
    'uvicorn',
    ['sibyl_sidecar.main:app', '--port', String(port), '--host', '127.0.0.1', '--log-level', 'warning'],
    {
      cwd: SIDECAR_DIR,
      env: {
        ...process.env,
        CEPID_MEMORY_DB: dbPath,
        SIDECAR_TOKEN: token,
        PATH: `${join(SIDECAR_DIR, '.venv/bin')}:${process.env.PATH ?? ''}`,
      },
      stdio: 'ignore',
    },
  );
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, { headers: { 'x-sidecar-token': token } });
      if (res.ok) return { baseUrl, token, proc };
    } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill('SIGKILL');
  throw new Error('e2e sidecar boot failed');
}

test('e2e on Sibyl: session 2 (fresh process) is vetoed by session 1 memory', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'cepid-agent-e2e-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const dbPath = join(dir, 'memory.db');

  // ---- Session 1: sidecar A, empty substrate
  const portA = 9400 + Math.floor(Math.random() * 100);
  const fxA = await bootSidecar(dbPath, portA);
  t.after(() => fxA.proc.kill('SIGKILL'));
  process.env.CEPID_SIDECAR_URL = fxA.baseUrl;
  process.env.SIDECAR_TOKEN = fxA.token;
  process.env.DEMO_AGENT_ID = AGENT;
  process.env.CEPID_NETWORK = 'mock';
  process.env.CEPID_MAX_COLLATERAL = '1.0';
  process.env.CEPID_DATA_DIR = dir;
  delete process.env.AGENT_PRIVATE_KEY;

  const first = await runOnce({ execute: false, confirmApproval: false, confirmOrder: false, mockSeed: mockSeed() });
  assert.equal(first.intent.direction, 'YES', 'fresh memory → base strategy fires');
  assert.equal(first.retrieved.length, 0);

  // Seed earned bad memory through the same platform path.
  const conditions = {
    asset: 'BTC' as const, timeframe: '15M' as const, yesPrice: 0.55, midpointDistance: 0.05,
    volatility: 'high' as const, momentum: 'up' as const, liquidity: 'medium' as const, timeRemainingBucket: '>10m' as const,
  };
  const situation: Situation = toSituation(conditions, 'YES');
  const loss: MemoryOutcome = {
    result: 'LOSS', valence: 'bad', magnitude: -0.56, metrics: { pnl: -0.56 },
    marketOutcome: 'NO_WON', tradeOutcome: 'LOSS', observedAt: new Date().toISOString(),
  };
  {
    const repo = new SibylRepository(fxA.baseUrl, fxA.token);
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

  // ---- Kill sidecar A. Session 2 uses a BRAND-NEW process on the same DB.
  fxA.proc.kill('SIGKILL');
  await new Promise((r) => setTimeout(r, 300));

  const portB = 9600 + Math.floor(Math.random() * 100);
  const fxB = await bootSidecar(dbPath, portB);
  t.after(() => fxB.proc.kill('SIGKILL'));
  process.env.CEPID_SIDECAR_URL = fxB.baseUrl;
  process.env.SIDECAR_TOKEN = fxB.token;

  const second = await runOnce({ execute: false, confirmApproval: false, confirmOrder: false, mockSeed: mockSeed() });
  assert.equal(second.intent.direction, 'NO_TRADE', 'session 2 must be vetoed by persisted memory');
  assert.ok(second.decisionContext.memoryIds.length > 0, 'decision references retrieved memories');
  assert.ok(second.decisionContext.finalConfidence < 0.5, 'confidence must drop below threshold');

  // The events file carries no key material (key-leak regression still holds
  // with the new persistence path).
  const { readFile } = await import('node:fs/promises');
  const eventsRaw = await readFile(join(dir, 'events.json'), 'utf8');
  assert.equal(/0x[0-9a-fA-F]{64}/.test(eventsRaw), false, 'events must stay key-free');

  // And the veto is derivable from stored edges: the retrieval that fed the
  // decision is visible in the substrate.
  const repo2 = new SibylRepository(fxB.baseUrl, fxB.token);
  const memories = await repo2.listMemories(AGENT);
  const seeded = memories.filter((m) => m.source === 'seed');
  assert.equal(seeded.length, 4, 'seeded memories persisted across process death');
  const events = await repo2.listEvents(AGENT, { limit: 20 });
  assert.ok(events.some((e) => e.type === 'memory.created'), 'journal recorded the writes');
});
