/**
 * Memory repository — the persistence seam.
 *
 * Phase 1 keeps the interface and a transitional JSON-file implementation so
 * the engine, tests, and the demo agent stay green during the restructure.
 * Phase 2 adds the Sibyl-backed implementation and REMOVES this JSON class —
 * the interface is the contract, the file store is scaffolding that dies.
 *
 * Every method takes agentId: isolation is part of the repository contract,
 * not a caller courtesy.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  MemoryRecord,
  PatternRecord,
  ScarRecord,
  MemoryMeta,
  RetrievalRecord,
  DecisionRecord,
  OutcomeRecord,
} from '../core/domain.js';
import { DEFAULT_MEMORY_META } from '../core/domain.js';
import { CepidError, MEMORY_SUBSTRATE_UNAVAILABLE } from '../core/errors.js';

export interface MemoryRepository {
  // Memory records (experiences)
  putMemory(agentId: string, memory: MemoryRecord): Promise<void>;
  getMemory(agentId: string, id: string): Promise<MemoryRecord | null>;
  listMemories(agentId: string, opts?: { limit?: number; since?: string; kind?: string }): Promise<MemoryRecord[]>;

  // Patterns
  putPattern(agentId: string, p: PatternRecord): Promise<void>;
  getPattern(agentId: string, id: string): Promise<PatternRecord | null>;
  listPatterns(agentId: string): Promise<PatternRecord[]>;

  // Scars
  putScar(agentId: string, s: ScarRecord): Promise<void>;
  listScars(agentId: string): Promise<ScarRecord[]>;

  // Influence chain
  putRetrieval(agentId: string, r: RetrievalRecord): Promise<void>;
  getRetrieval(agentId: string, id: string): Promise<RetrievalRecord | null>;
  putDecision(agentId: string, d: DecisionRecord): Promise<void>;
  getDecision(agentId: string, id: string): Promise<DecisionRecord | null>;
  putOutcome(agentId: string, o: OutcomeRecord): Promise<void>;
  listOutcomes(agentId: string, opts?: { limit?: number }): Promise<OutcomeRecord[]>;

  // Journal (activity) — per agent
  appendEvent(agentId: string, event: Record<string, unknown>): Promise<void>;
  listEvents(agentId: string, opts?: { limit?: number; since?: string }): Promise<Array<Record<string, unknown>>>;

  // Meta
  getMeta(agentId: string): Promise<MemoryMeta>;
  setMeta(agentId: string, meta: MemoryMeta): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Transitional JSON implementation (REMOVED in Phase 2)                     */
/* -------------------------------------------------------------------------- */

interface JsonStore {
  memories: Map<string, MemoryRecord>;        // key: `${agentId}:${id}`
  patterns: Map<string, PatternRecord>;
  scars: Map<string, ScarRecord>;
  retrievals: Map<string, RetrievalRecord>;
  decisions: Map<string, DecisionRecord>;
  outcomes: OutcomeRecord[];
  events: Map<string, Array<Record<string, unknown>>>; // per-agent journal
  meta: Map<string, MemoryMeta>;              // per-agent
}

/**
 * @deprecated Transitional only. Phase 2 replaces the file backing with the
 * Sibyl sidecar repository; this class is then deleted. Exists so the engine
 * and the demo agent keep working while the substrate lands.
 */
export class JsonMemoryRepository implements MemoryRepository {
  private readonly dir: string;
  private cache: JsonStore | null = null;

  constructor(dataDir: string) {
    this.dir = join(dataDir, 'memory');
  }

  private async load(): Promise<JsonStore> {
    if (this.cache) return this.cache;
    await mkdir(this.dir, { recursive: true });
    const raw = await readJson<Record<string, unknown>>(join(this.dir, 'store.json'), {});
    this.cache = {
      memories: new Map(Object.entries(raw.memories ?? {}) as Array<[string, MemoryRecord]>),
      patterns: new Map(Object.entries(raw.patterns ?? {}) as Array<[string, PatternRecord]>),
      scars: new Map(Object.entries(raw.scars ?? {}) as Array<[string, ScarRecord]>),
      retrievals: new Map(Object.entries(raw.retrievals ?? {}) as Array<[string, RetrievalRecord]>),
      decisions: new Map(Object.entries(raw.decisions ?? {}) as Array<[string, DecisionRecord]>),
      outcomes: Array.isArray(raw.outcomes) ? (raw.outcomes as OutcomeRecord[]) : [],
      events: new Map(Object.entries(raw.events ?? {}) as Array<[string, Array<Record<string, unknown>>]>),
      meta: new Map(Object.entries(raw.meta ?? {}) as Array<[string, MemoryMeta]>),
    };
    return this.cache;
  }

  private async flush(): Promise<void> {
    if (!this.cache) return;
    const c = this.cache;
    const dump = {
      memories: Object.fromEntries(c.memories),
      patterns: Object.fromEntries(c.patterns),
      scars: Object.fromEntries(c.scars),
      retrievals: Object.fromEntries(c.retrievals),
      decisions: Object.fromEntries(c.decisions),
      outcomes: c.outcomes,
      events: Object.fromEntries(c.events),
      meta: Object.fromEntries(c.meta),
    };
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, 'store.json'), JSON.stringify(dump, null, 2));
  }

  async putMemory(agentId: string, memory: MemoryRecord): Promise<void> {
    const c = await this.load();
    c.memories.set(`${agentId}:${memory.id}`, memory);
    await this.syncMeta(agentId, c);
    await this.flush();
  }

  async getMemory(agentId: string, id: string): Promise<MemoryRecord | null> {
    const c = await this.load();
    return c.memories.get(`${agentId}:${id}`) ?? null;
  }

  async listMemories(agentId: string, opts?: { limit?: number; since?: string; kind?: string }): Promise<MemoryRecord[]> {
    const c = await this.load();
    let all = [...c.memories.entries()]
      .filter(([k]) => k.startsWith(`${agentId}:`))
      .map(([, v]) => v);
    if (opts?.kind) all = all.filter((m) => m.kind === opts.kind);
    if (opts?.since) all = all.filter((m) => m.createdAt >= opts.since!);
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (opts?.limit) all = all.slice(0, opts.limit);
    return all;
  }

  async putPattern(agentId: string, p: PatternRecord): Promise<void> {
    const c = await this.load();
    c.patterns.set(`${agentId}:${p.id}`, p);
    await this.syncMeta(agentId, c);
    await this.flush();
  }

  async getPattern(agentId: string, id: string): Promise<PatternRecord | null> {
    const c = await this.load();
    return c.patterns.get(`${agentId}:${id}`) ?? null;
  }

  async listPatterns(agentId: string): Promise<PatternRecord[]> {
    const c = await this.load();
    return [...c.patterns.entries()]
      .filter(([k]) => k.startsWith(`${agentId}:`))
      .map(([, v]) => v)
      .sort((a, b) => b.strength - a.strength);
  }

  async putScar(agentId: string, s: ScarRecord): Promise<void> {
    const c = await this.load();
    c.scars.set(`${agentId}:${s.id}`, s);
    await this.syncMeta(agentId, c);
    await this.flush();
  }

  async listScars(agentId: string): Promise<ScarRecord[]> {
    const c = await this.load();
    return [...c.scars.entries()]
      .filter(([k]) => k.startsWith(`${agentId}:`))
      .map(([, v]) => v)
      .sort((a, b) => b.strength - a.strength);
  }

  async putRetrieval(agentId: string, r: RetrievalRecord): Promise<void> {
    const c = await this.load();
    c.retrievals.set(`${agentId}:${r.id}`, r);
    await this.flush();
  }

  async getRetrieval(agentId: string, id: string): Promise<RetrievalRecord | null> {
    const c = await this.load();
    return c.retrievals.get(`${agentId}:${id}`) ?? null;
  }

  async putDecision(agentId: string, d: DecisionRecord): Promise<void> {
    const c = await this.load();
    c.decisions.set(`${agentId}:${d.id}`, d);
    await this.flush();
  }

  async getDecision(agentId: string, id: string): Promise<DecisionRecord | null> {
    const c = await this.load();
    return c.decisions.get(`${agentId}:${id}`) ?? null;
  }

  async putOutcome(agentId: string, o: OutcomeRecord): Promise<void> {
    const c = await this.load();
    c.outcomes.push(o);
    await this.flush();
  }

  async listOutcomes(agentId: string, opts?: { limit?: number }): Promise<OutcomeRecord[]> {
    const c = await this.load();
    const all = c.outcomes.filter((o) => o.agentId === agentId);
    all.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }

  async appendEvent(agentId: string, event: Record<string, unknown>): Promise<void> {
    const c = await this.load();
    const list = c.events.get(agentId) ?? [];
    list.push(event);
    c.events.set(agentId, list);
    await this.flush();
  }

  async listEvents(agentId: string, opts?: { limit?: number; since?: string }): Promise<Array<Record<string, unknown>>> {
    const c = await this.load();
    let all = c.events.get(agentId) ?? [];
    if (opts?.since) all = all.filter((e) => String(e.at ?? '') >= opts.since!);
    if (opts?.limit) all = all.slice(-opts.limit);
    return all;
  }

  async getMeta(agentId: string): Promise<MemoryMeta> {
    const c = await this.load();
    return { ...(c.meta.get(agentId) ?? DEFAULT_MEMORY_META) };
  }

  async setMeta(agentId: string, meta: MemoryMeta): Promise<void> {
    const c = await this.load();
    c.meta.set(agentId, meta);
    await this.flush();
  }

  private async syncMeta(agentId: string, c: JsonStore): Promise<void> {
    const mine = [...c.memories.entries()].filter(([k]) => k.startsWith(`${agentId}:`));
    const settled = mine
      .map(([, m]) => m.outcome?.magnitude)
      .filter((v): v is number => typeof v === 'number');
    settled.sort((a, b) => Math.abs(a) - Math.abs(b));
    const scale = settled.length > 0
      ? Math.max(0.01, Math.min(1, Math.abs(settled[Math.floor(settled.length * 0.75)] ?? 0.1)))
      : 0.1;
    c.meta.set(agentId, {
      experienceCount: mine.length,
      patternCount: c.patterns.size,
      scarCount: c.scars.size,
      lastDecayAt: c.meta.get(agentId)?.lastDecayAt ?? '',
      magnitudeScale: scale,
    });
  }
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch (e) {
    if (isEnoent(e)) return fallback;
    throw e;
  }
}

function isEnoent(e: unknown): boolean {
  return e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT';
}

/** New memory id. */
export function newMemoryId(): string {
  return `mem-${randomUUID().slice(0, 12)}`;
}

export { CepidError, MEMORY_SUBSTRATE_UNAVAILABLE };
