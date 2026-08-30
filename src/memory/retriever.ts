/**
 * Memory retrieval.
 *
 * Takes a current MarketContext and returns the most relevant past experiences,
 * ranked by a retrieval score that combines similarity with scar/pattern boosts.
 */
import type { MarketContext, PatternMemory, RetrievedMemory, ScarMemory } from '../config/types.js';
import { similarity } from './similarity.js';
import type { MemoryRepository } from './repository.js';

export interface RetrieveOptions {
  /** Hard cap on returned experiences. */
  limit?: number;
  /** Minimum similarity to include. */
  minSimilarity?: number;
}

const SCAR_BOOST = 0.15;
const PATTERN_BOOST = 0.1;

export async function retrieveMemories(
  repo: MemoryRepository,
  current: MarketContext,
  opts: RetrieveOptions = {},
): Promise<RetrievedMemory[]> {
  const limit = opts.limit ?? 10;
  const minSim = opts.minSimilarity ?? 0.3;
  const [experiences, patterns, scars] = await Promise.all([
    repo.listExperiences(),
    repo.listPatterns(),
    repo.listScars(),
  ]);
  if (experiences.length === 0) return [];

  const patternByExp = indexPatterns(patterns);
  const scarByExp = indexScars(scars);

  const scored: RetrievedMemory[] = experiences
    .map((experience) => {
      const sim = similarity(current, experience.conditions);
      const isPattern = patternByExp.has(experience.id);
      const isScar = scarByExp.has(experience.id);
      const boost = (isScar ? SCAR_BOOST : 0) + (isPattern ? PATTERN_BOOST : 0);
      const retrievalScore = Math.min(1, sim + boost);
      return { experience, similarity: sim, isScar, isPattern, retrievalScore };
    })
    .filter((r) => r.similarity >= minSim)
    .sort((a, b) => b.retrievalScore - a.retrievalScore)
    .slice(0, limit);

  return scored;
}

function indexPatterns(patterns: PatternMemory[]): Map<string, true> {
  const m = new Map<string, true>();
  for (const p of patterns) for (const id of p.experienceIds) m.set(id, true);
  return m;
}

function indexScars(scars: ScarMemory[]): Map<string, true> {
  const m = new Map<string, true>();
  for (const s of scars) for (const id of s.experienceIds) m.set(id, true);
  return m;
}
