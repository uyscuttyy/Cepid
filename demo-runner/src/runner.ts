/**
 * Demo job — the full two-run constraint-gate proof as one async state
 * machine, driven entirely through product surfaces (CEPID HTTP API +
 * Base Sepolia chain). No CLI, no cast, no private keys leave this
 * maintainer-side process.
 *
 * Sequence: agent (fresh) → market 1 → run 1 (3× ALLOW trades) →
 * expiry → resolve NO → settle (3× LOSS, scar forms) → market 2 →
 * run 2 (DENY, NO_TRADE, no tx).
 *
 * The trade legs reuse runOnce from @cepid/agent-demo-trader — the exact
 * code path the CLI scripts used — with env configured in-process. Jobs
 * are single-flight (the server enforces it); env mutation is contained
 * to the job.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CepidClient } from '@cepid/client';
import { runOnce } from '@cepid/agent-demo-trader/src/app.js';
import type { ChainAdapter } from './chain.js';

export const DEMO_AGENT_NAME = 'Demo Gate Runner';
export const RUN1_TRADES = 3;
export const MARKET_DURATION_S = 240;
export const FUND_USDC = 1_000_000n;
export const PRIME_NO_SHARES = 800_000n;
export const MIN_BALANCE_USDC = 4_000_000n;

export type DemoPhase =
  | 'agent'
  | 'market1'
  | 'run1'
  | 'waiting'
  | 'resolve'
  | 'settle'
  | 'market2'
  | 'run2'
  | 'done'
  | 'failed';

export interface DemoLogEntry {
  at: string;
  phase: DemoPhase;
  message: string;
}

export interface DemoLeg {
  leg: number;
  gateVerdict: string;
  intent: string;
  txHash: string | null;
  memoryId: string | null;
  retrievalId: string | null;
}

export interface DemoResult {
  jobId: string;
  status: 'running' | 'done' | 'failed';
  phase: DemoPhase;
  log: DemoLogEntry[];
  agentId: string | null;
  market1: string | null;
  market2: string | null;
  legs: DemoLeg[];
  settleTx: string | null;
  run2: {
    gateVerdict: string | null;
    gateReason: string | null;
    blockingMemoryIds: string[];
    intent: string | null;
    txHash: string | null;
    retrievalId: string | null;
  } | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface RunnerDeps {
  cepidBaseUrl: string;
  chain: ChainAdapter;
  rpcUrl: string;
  /** Persisted demo-agent identity (maintainer-side file, gitignored). */
  keyStorePath: string;
  dataDir: string;
  sleepMs: (ms: number) => Promise<void>;
  /** 'mock' runs trades against the demo-trader mock provider (tests only). */
  network: 'base-sepolia' | 'mock';
  mockSeed?: Record<string, unknown>;
  onLog?: (entry: DemoLogEntry) => void;
}

interface DemoIdentity {
  agentId: string;
  apiKey: string;
}

function loadIdentity(path: string): DemoIdentity | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8')) as DemoIdentity;
  } catch {
    return null;
  }
}

function saveIdentity(path: string, id: DemoIdentity): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(id, null, 2));
}

/** Configure the in-process env runOnce reads. Returns a restore fn. */
function withJobEnv(env: Record<string, string>): () => void {
  const prev = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(env)) {
    prev.set(k, process.env[k]);
    process.env[k] = v;
  }
  return () => {
    for (const [k, v] of prev) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

export async function runDemoJob(jobId: string, deps: RunnerDeps): Promise<DemoResult> {
  const result: DemoResult = {
    jobId,
    status: 'running',
    phase: 'agent',
    log: [],
    agentId: null,
    market1: null,
    market2: null,
    legs: [],
    settleTx: null,
    run2: null,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  const log = (phase: DemoPhase, message: string) => {
    const entry = { at: new Date().toISOString(), phase, message };
    result.log.push(entry);
    result.phase = phase;
    deps.onLog?.(entry);
  };

  try {
    // ——— agent: exactly one demo agent. Previous demo identity (if any)
    // self-deletes first, so the registry never accumulates demo rows.
    log('agent', 'Preparing the demo agent');
    const stored = loadIdentity(deps.keyStorePath);
    if (stored) {
      try {
        const probe = await fetch(`${deps.cepidBaseUrl}/v1/agents/history`, {
          headers: { authorization: `Bearer ${stored.apiKey}` },
        });
        if (probe.ok) {
          await fetch(`${deps.cepidBaseUrl}/v1/agents/self`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${stored.apiKey}` },
          });
          log('agent', `Retired previous demo agent ${stored.agentId}`);
        }
      } catch {
        /* key dead already — register fresh below */
      }
    }
    const reg = await CepidClient.register(deps.cepidBaseUrl, {
      name: DEMO_AGENT_NAME,
      description: 'two-run constraint-gate demo',
    });
    const identity: DemoIdentity = { agentId: reg.agent.id, apiKey: reg.apiKey };
    saveIdentity(deps.keyStorePath, identity);
    result.agentId = identity.agentId;
    log('agent', `Registered demo agent ${identity.agentId}`);

    const env = {
      CEPID_API_URL: deps.cepidBaseUrl,
      CEPID_API_KEY: identity.apiKey,
      CEPID_NETWORK: deps.network,
      CEPID_RPC_URL_BASE_SEPOLIA: deps.rpcUrl,
      CEPID_DATA_DIR: deps.dataDir,
      // Risk caps for the demo job. The engine defaults (0.5/order,
      // 1.0/session) reject the demo's own 0.59-collateral legs, so the
      // job configures what the live .env and the obedience tests use.
      CEPID_MAX_COLLATERAL: '1.0',
      CEPID_SESSION_MAX_COLLATERAL: '3.0',
      CEPID_SESSION_MAX_ORDERS: '3',
    };
    const tradeOpts = {
      execute: true as const,
      confirmApproval: true as const,
      confirmOrder: true as const,
      ...(deps.mockSeed ? { mockSeed: deps.mockSeed as never } : {}),
    };

    // ——— funds check (fail fast, before spending anything).
    const balance = await deps.chain.usdcBalance();
    if (balance < MIN_BALANCE_USDC) {
      throw new Error(
        `demo wallet holds ${(Number(balance) / 1e6).toFixed(2)} USDC — needs at least 4.00 to run the demo`,
      );
    }
    log('agent', `Demo wallet funded: ${(Number(balance) / 1e6).toFixed(2)} USDC`);

    // ——— market 1 + run 1.
    log('market1', 'Deploying test market 1');
    const m1 = await deps.chain.deployMarket({ durationSeconds: MARKET_DURATION_S });
    result.market1 = m1.address;
    log('market1', `Market 1 at ${m1.address}, expires ${new Date(m1.expiresAt * 1000).toISOString()}`);
    await deps.chain.fundAndPrime(m1.address, FUND_USDC, PRIME_NO_SHARES);
    // The strategy needs |mid - 0.5| >= 0.02 to see an edge. Liquidity
    // depth varies per deployment, so top the prime up until the price is
    // far enough off 0.5 (max 3 top-ups) instead of running NO_TRADE legs.
    let price = await deps.chain.yesPrice(m1.address);
    for (let top = 0; top < 3 && Math.abs(price - 0.5) < 0.025; top++) {
      log('market1', `yesPrice ≈ ${price.toFixed(4)} — no edge, priming more NO`);
      await deps.chain.primeMore(m1.address, PRIME_NO_SHARES);
      price = await deps.chain.yesPrice(m1.address);
    }
    log('market1', `Funded + primed, yesPrice ≈ ${price.toFixed(4)}`);
    if (Math.abs(price - 0.5) < 0.02) {
      throw new Error(`prime could not move yesPrice off 0.5 (≈ ${price.toFixed(4)}) — aborting demo`);
    }

    log('run1', 'Run 1: three trades on a fresh agent');
    const restore = withJobEnv({ ...env, CEPID_TEST_MARKET_ADDRESS: m1.address });
    try {
      for (let i = 0; i < RUN1_TRADES; i++) {
        const r = await runOnce(tradeOpts);
        result.legs.push({
          leg: i + 1,
          gateVerdict: r.gateVerdict,
          intent: r.intent.direction,
          txHash: r.execution.txHash ?? null,
          memoryId: r.memoryId,
          retrievalId: r.retrievalId,
        });
        log('run1', `Leg ${i + 1}: gate ${r.gateVerdict}, intent ${r.intent.direction}, tx ${r.execution.txHash ?? 'none'}`);
        if (r.gateVerdict === 'DENY' || !r.execution.txHash) break;
      }
    } finally {
      restore();
    }
    const traded = result.legs.filter((l) => l.txHash);
    if (traded.length === 0) throw new Error('run 1 produced no on-chain trades — aborting demo');

    // ——— wait out expiry, resolve NO, settle losses.
    log('waiting', 'Waiting for market 1 to expire');
    for (;;) {
      const left = await deps.chain.msUntilExpiry(m1.address);
      if (left <= 0) break;
      await deps.sleepMs(Math.min(15_000, left + 2_000));
    }
    log('resolve', 'Resolving market 1 NO (against the agent)');
    const settleTx = await deps.chain.resolveNo(m1.address);
    result.settleTx = settleTx;
    log('resolve', `Resolved, tx ${settleTx}`);

    log('settle', 'Recording the three losses with txHash evidence');
    const cepid = new CepidClient({ baseUrl: deps.cepidBaseUrl, apiKey: identity.apiKey });
    const activity = (await cepid.activity()) as {
      events: Array<{ type: string; memoryId?: string; decisionId?: string }>;
    };
    const journalLink = new Map<string, string>();
    for (const e of activity.events) {
      if (e.type === 'memory.created' && e.memoryId && e.decisionId) journalLink.set(e.memoryId, e.decisionId);
    }
    for (const leg of traded) {
      const { memory } = (await cepid.getMemory(leg.memoryId!)) as {
        memory: { id: string; decisionId: string | null };
      };
      const decisionId = memory.decisionId ?? journalLink.get(leg.memoryId!) ?? null;
      if (!decisionId) throw new Error(`leg ${leg.leg}: no decision link for memory ${leg.memoryId}`);
      await cepid.recordOutcome({
        decisionId,
        outcome: {
          result: 'LOSS',
          valence: 'bad',
          magnitude: -0.5,
          metrics: { pnl: -0.5 },
          marketOutcome: 'NO_WON',
          tradeOutcome: 'LOSS',
          evidence: { chain: 'base-sepolia', txHash: leg.txHash! },
        },
      });
      log('settle', `Leg ${leg.leg}: LOSS recorded against ${decisionId}`);
    }

    // ——— market 2 + run 2 (must be a fresh market to observe).
    log('market2', 'Deploying test market 2 for run 2 to observe');
    const m2 = await deps.chain.deployMarket({ durationSeconds: MARKET_DURATION_S });
    result.market2 = m2.address;
    await deps.chain.fundAndPrime(m2.address, FUND_USDC, PRIME_NO_SHARES);
    log('market2', `Market 2 at ${m2.address}, funded + primed`);

    log('run2', 'Run 2: same agent, same situation — expecting DENY');
    const restore2 = withJobEnv({ ...env, CEPID_TEST_MARKET_ADDRESS: m2.address });
    try {
      const r = await runOnce(tradeOpts);
      result.run2 = {
        gateVerdict: r.gateVerdict,
        gateReason: r.gateReason,
        blockingMemoryIds: r.gateBlockingMemoryIds,
        intent: r.intent.direction,
        txHash: r.execution.txHash ?? null,
        retrievalId: r.retrievalId,
      };
      log('run2', `Gate ${r.gateVerdict}: ${r.gateReason} — intent ${r.intent.direction}, tx ${r.execution.txHash ?? 'none'}`);
      if (r.gateVerdict !== 'DENY') throw new Error(`run 2 expected DENY, got ${r.gateVerdict}`);
      if (r.execution.txHash) throw new Error('run 2 submitted a transaction on a DENY path');
      if (r.intent.direction !== 'NO_TRADE') throw new Error('run 2 expected NO_TRADE intent');
    } finally {
      restore2();
    }

    result.status = 'done';
    result.phase = 'done';
    result.finishedAt = new Date().toISOString();
    log('done', 'Demo complete: run 1 lost on-chain, run 2 was stopped by memory');
  } catch (e) {
    result.status = 'failed';
    result.phase = 'failed';
    result.error = e instanceof Error ? e.message : String(e);
    result.finishedAt = new Date().toISOString();
    log('failed', `Demo failed: ${result.error}`);
  }
  return result;
}
