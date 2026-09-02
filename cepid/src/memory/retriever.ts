/**
 * Memory retrieval — generic situations, ranked.
 *
 * Ranking = similarity × strength × importance × scar/pattern boosts, plus a
 * small recency term. Every retrieval the caller commits (via the caller
 * recording a RetrievalRecord) bumps the memory's usage counts — but only
 * when the caller actually used it in a decision; this module never invents
 * usage.
 */
import type {
  PatternRecord,
  RetrievedMemory,
  ScarRecord,
  Situation,
  MemoryRecord,
} from '../core/domain.js';
import { similarity, type SimilarityWeights } from './similarity.js';
import type { MemoryRepository } from '../repository/repository.js';

export interface RetrieveOptions {
  /** Hard cap on returned memories. Default 10. */
  limit?: number;
  /** Minimum similarity to include. Default 0.3. */
  minSimilarity?: number;
  /** Domain-profile similarity weights. */
  weights?: SimilarityWeights;
}

const SCAR_BOOST = 0.15;
const PATTERN_BOOST = 0.10;
/** Recency half-life in days for the recency term. */
const RECENCY_HALF_LIFE_DAYS = 7;

export async function retrieveMemories(
  repo: MemoryRepository,
  agentId: string,
  situation: Situation,
  opts: RetrieveOptions = {},
): Promise<RetrievedMemory[]> {
  const limit = opts.limit ?? 10;
  const minSim = opts.minSimilarity ?? 0.3;

  const [memories, patterns, scars] = await Promise.all([
    repo.listMemories(agentId),
    repo.listPatterns(agentId),
    repo.listScars(agentId),
  ]);
  if (memories.length === 0) return [];

  const patternByMem = indexPatterns(patterns);
  const scarByMem = indexScars(scars);
  const now = Date.now();

  const scored: RetrievedMemory[] = memories
    .filter((m) => m.kind === 'experience')
    .map((memory) => {
      const sim = similarity(situation, memory.situation, opts.weights);
      const isPattern = patternByMem.has(memory.id);
      const isScar = scarByMem.has(memory.id);
      const boost = (isScar ? SCAR_BOOST : 0) + (isPattern ? PATTERN_BOOST : 0);

      // Recency: 1 at creation, halving every RECENCY_HALF_LIFE_DAYS.
      const ageDays = (now - new Date(memory.createdAt).getTime()) / 86_400_000;
      const recency = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);

      // Validated-use term: memories that proved useful rank higher.
      const useTerm = Math.log2(1 + memory.retrievedCount) / 8;

      const retrievalScore = Math.min(1,
        sim * (0.6 + 0.2 * memory.strength + 0.2 * memory.importance)
          * (0.85 + 0.15 * recency)
        + boost + useTerm,
      );
      return { memory, similarity: sim, isScar, isPattern, retrievalScore };
    })
    .filter((r) => r.similarity >= minSim)
    .sort((a, b) => b.retrievalScore - a.retrievalScore)
    .slice(0, limit);

  return scored;
}

/** Called by the API layer when a retrieved memory actually feeds a decision. */
export async function markMemoryUsed(
  repo: MemoryRepository,
  agentId: string,
  memoryIds: string[],
  at: string = new Date().toISOString(),
): Promise<void> {
  for (const id of memoryIds) {
    const memory = await repo.getMemory(agentId, id);
    if (!memory) continue;
    await repo.putMemory(agentId, {
      ...memory,
      retrievedCount: memory.retrievedCount + 1,
      lastRetrievedAt: at,
    });
  }
}

function indexPatterns(patterns: PatternRecord[]): Map<string, true> {
  const m = new Map<string, true>();
  for (const p of patterns) for (const id of p.memoryIds) m.set(id, true);
  return m;
}

function indexScars(scars: ScarRecord[]): Map<string, true> {
  const m = new Map<string, true>();
  for (const s of scars) for (const id of s.memoryIds) m.set(id, true);
  return m;
}

/** Type re-export for callers building ranking snapshots. */
export type { MemoryRecord };
