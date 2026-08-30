/**
 * Read-side access to the agent's persistent state.
 *
 * The agent writes to `${CEPID_DATA_DIR}` (default ./data). Files:
 *   - memory/experiences.json   Experience[]
 *   - memory/patterns.json      PatternMemory[]
 *   - memory/scars.json         ScarMemory[]
 *   - memory/meta.json          {experienceCount, ...}
 *   - sessions.json             AgentSession[]
 *   - events.json               AgentEvent[]   (preview, approval_submitted, order_submitted, ...)
 *
 * This module is server-only. API routes import it; React components do not.
 */
import 'server-only';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from '../../../src/config/load';
import type {
  AgentEvent, AgentSession, AgentSnapshot, Experience,
  PatternMemory, PerformanceSummary, ScarMemory,
} from './types.js';

const DATA_DIR = process.env.CEPID_DATA_DIR
  ? resolve(process.env.CEPID_DATA_DIR)
  : resolve(process.cwd(), '..', 'data');

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw e;
  }
}

export async function getExperiences(): Promise<Experience[]> {
  const data = await readJson<Experience[]>(
    resolve(DATA_DIR, 'memory', 'experiences.json'),
    [],
  );
  return data;
}

export async function getExperience(id: string): Promise<Experience | null> {
  const all = await getExperiences();
  return all.find((e) => e.id === id) ?? null;
}

export async function getPatterns(): Promise<PatternMemory[]> {
  return readJson<PatternMemory[]>(
    resolve(DATA_DIR, 'memory', 'patterns.json'),
    [],
  );
}

export async function getScars(): Promise<ScarMemory[]> {
  return readJson<ScarMemory[]>(
    resolve(DATA_DIR, 'memory', 'scars.json'),
    [],
  );
}

export async function getSessions(): Promise<AgentSession[]> {
  return readJson<AgentSession[]>(resolve(DATA_DIR, 'sessions.json'), []);
}

export async function getEvents(): Promise<AgentEvent[]> {
  return readJson<AgentEvent[]>(resolve(DATA_DIR, 'events.json'), []);
}

export async function getAgentSnapshot(): Promise<AgentSnapshot> {
  const cfg = loadConfig();
  const meta = await readJson<{
    experienceCount: number; patternCount: number; scarCount: number; pnlScale: number;
  }>(resolve(DATA_DIR, 'memory', 'meta.json'), {
    experienceCount: 0, patternCount: 0, scarCount: 0, pnlScale: 0,
  });
  // Wallet address is derived from AGENT_PRIVATE_KEY on the server, never sent to the client.
  // We expose only the address; the client never sees the key.
  let walletAddress: string | null = null;
  if (cfg.privateKey) {
    try {
      const { privateKeyToAccount } = await import('viem/accounts');
      walletAddress = privateKeyToAccount(cfg.privateKey).address;
    } catch {
      walletAddress = null;
    }
  }
  return {
    network: cfg.network,
    rpcUrl: cfg.rpcUrl,
    walletAddress,
    dataDir: DATA_DIR,
    risk: cfg.risk,
    meta,
  };
}

export async function getPerformance(): Promise<PerformanceSummary> {
  const experiences = await getExperiences();
  const events = await getEvents();

  // Trades are recorded via order_submitted events. A trade has a "filled"
  // outcome when its matching experience has outcome.outcome !== 'PENDING'.
  const submitted = events.filter((e) => e.type === 'order_submitted');
  const tradeIds = new Set(submitted.map((e) => String(e.marketId ?? '')));
  const settled = experiences.filter((e) => tradeIds.has(e.marketId) && e.outcome.outcome !== 'PENDING');
  const wins = settled.filter((e) => e.outcome.outcome === 'WIN');
  const losses = settled.filter((e) => e.outcome.outcome === 'LOSS');
  const totalPnl = settled.reduce((s, e) => s + e.outcome.pnl, 0);
  const realizedPnl = wins.reduce((s, e) => s + e.outcome.pnl, 0) + losses.reduce((s, e) => s + e.outcome.pnl, 0);
  const averagePnl = settled.length > 0 ? totalPnl / settled.length : 0;
  const sorted = [...settled].sort((a, b) => b.outcome.pnl - a.outcome.pnl);
  const best = sorted[0] ?? null;
  const worst = sorted[sorted.length - 1] ?? null;

  return {
    trades: submitted.length,
    wins: wins.length,
    losses: losses.length,
    pending: submitted.length - settled.length,
    winRate: wins.length + losses.length > 0 ? wins.length / (wins.length + losses.length) : 0,
    totalPnl,
    realizedPnl,
    averagePnl,
    bestTrade: best ? { id: best.id, pnl: best.outcome.pnl } : null,
    worstTrade: worst && worst !== best ? { id: worst.id, pnl: worst.outcome.pnl } : null,
  };
}
