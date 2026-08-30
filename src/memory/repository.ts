/**
 * Memory repository — JSON-backed persistent storage of experiences.
 *
 * Files live under `${dataDir}/memory/`. Layout:
 *   experiences.json  — every Experience, indexed by id
 *   patterns.json     — PatternMemory[]
 *   scars.json        — ScarMemory[]
 *   meta.json         — aggregate counts, last decay timestamp
 *
 * The repository interface allows the underlying store to be swapped (e.g.
 * for SQLite) without changing the rest of the codebase.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Experience, PatternMemory, ScarMemory } from '../config/types.js';

export interface MemoryRepository {
  // Experience operations
  putExperience(exp: Experience): Promise<void>;
  getExperience(id: string): Promise<Experience | null>;
  listExperiences(opts?: { limit?: number; since?: string }): Promise<Experience[]>;

  // Pattern operations
  putPattern(p: PatternMemory): Promise<void>;
  getPattern(id: string): Promise<PatternMemory | null>;
  listPatterns(): Promise<PatternMemory[]>;

  // Scar operations
  putScar(s: ScarMemory): Promise<void>;
  listScars(): Promise<ScarMemory[]>;

  // Meta
  getMeta(): Promise<MemoryMeta>;
  setMeta(meta: MemoryMeta): Promise<void>;
}

export interface MemoryMeta {
  experienceCount: number;
  patternCount: number;
  scarCount: number;
  lastDecayAt: string;
  /** Median |pnl| across the dataset, used to scale importance magnitude. */
  pnlScale: number;
}

const DEFAULT_META: MemoryMeta = {
  experienceCount: 0,
  patternCount: 0,
  scarCount: 0,
  lastDecayAt: '',
  pnlScale: 0.1,
};

export class JsonMemoryRepository implements MemoryRepository {
  private readonly dir: string;
  private cache: {
    experiences: Map<string, Experience>;
    patterns: Map<string, PatternMemory>;
    scars: Map<string, ScarMemory>;
    meta: MemoryMeta;
  } | null = null;

  constructor(dataDir: string) {
    this.dir = join(dataDir, 'memory');
  }

  private async load() {
    if (this.cache) return this.cache;
    await mkdir(this.dir, { recursive: true });
    const [exp, pat, scar, meta] = await Promise.all([
      readJsonArray<Experience>(join(this.dir, 'experiences.json')),
      readJsonArray<PatternMemory>(join(this.dir, 'patterns.json')),
      readJsonArray<ScarMemory>(join(this.dir, 'scars.json')),
      readJsonSingle<MemoryMeta>(join(this.dir, 'meta.json'), DEFAULT_META),
    ]);
    this.cache = {
      experiences: new Map(exp.map((e) => [e.id, e])),
      patterns: new Map(pat.map((p) => [p.id, p])),
      scars: new Map(scar.map((s) => [s.id, s])),
      meta,
    };
    return this.cache;
  }

  private async flush() {
    if (!this.cache) return;
    const { experiences, patterns, scars, meta } = this.cache;
    await Promise.all([
      writeFile(
        join(this.dir, 'experiences.json'),
        JSON.stringify(Array.from(experiences.values()), null, 2),
      ),
      writeFile(
        join(this.dir, 'patterns.json'),
        JSON.stringify(Array.from(patterns.values()), null, 2),
      ),
      writeFile(
        join(this.dir, 'scars.json'),
        JSON.stringify(Array.from(scars.values()), null, 2),
      ),
      writeFile(join(this.dir, 'meta.json'), JSON.stringify(meta, null, 2)),
    ]);
  }

  async putExperience(exp: Experience): Promise<void> {
    const c = await this.load();
    c.experiences.set(exp.id, exp);
    c.meta.experienceCount = c.experiences.size;
    c.meta.pnlScale = computePnlScale(Array.from(c.experiences.values()));
    await this.flush();
  }

  async getExperience(id: string): Promise<Experience | null> {
    const c = await this.load();
    return c.experiences.get(id) ?? null;
  }

  async listExperiences(opts?: { limit?: number; since?: string }): Promise<Experience[]> {
    const c = await this.load();
    let all = Array.from(c.experiences.values());
    if (opts?.since) {
      const since = opts.since;
      all = all.filter((e) => e.createdAt >= since);
    }
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (opts?.limit) all = all.slice(0, opts.limit);
    return all;
  }

  async putPattern(p: PatternMemory): Promise<void> {
    const c = await this.load();
    c.patterns.set(p.id, p);
    c.meta.patternCount = c.patterns.size;
    await this.flush();
  }

  async getPattern(id: string): Promise<PatternMemory | null> {
    const c = await this.load();
    return c.patterns.get(id) ?? null;
  }

  async listPatterns(): Promise<PatternMemory[]> {
    const c = await this.load();
    return Array.from(c.patterns.values()).sort((a, b) => b.strength - a.strength);
  }

  async putScar(s: ScarMemory): Promise<void> {
    const c = await this.load();
    c.scars.set(s.id, s);
    c.meta.scarCount = c.scars.size;
    await this.flush();
  }

  async listScars(): Promise<ScarMemory[]> {
    const c = await this.load();
    return Array.from(c.scars.values()).sort((a, b) => b.strength - a.strength);
  }

  async getMeta(): Promise<MemoryMeta> {
    const c = await this.load();
    return { ...c.meta };
  }

  async setMeta(meta: MemoryMeta): Promise<void> {
    const c = await this.load();
    c.meta = meta;
    await this.flush();
  }
}

async function readJsonArray<T>(path: string): Promise<T[]> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (e) {
    if (isEnoent(e)) return [];
    throw e;
  }
}

async function readJsonSingle<T>(path: string, fallback: T): Promise<T> {
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

function computePnlScale(experiences: Experience[]): number {
  const magnitudes = experiences
    .filter((e) => e.outcome.outcome !== 'PENDING')
    .map((e) => Math.abs(e.outcome.pnl))
    .sort((a, b) => a - b);
  if (magnitudes.length === 0) return 0.1;
  // Use the 75th percentile as the "ordinary" scale; capped at 1.0
  const idx = Math.floor(magnitudes.length * 0.75);
  return Math.max(0.01, Math.min(1, magnitudes[idx] ?? magnitudes[magnitudes.length - 1] ?? 0.1));
}
