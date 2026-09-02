/**
 * Memory importance scoring — generic over Situation/MemoryRecord.
 *
 * Decides how strongly a (decision, outcome) pair should be remembered.
 * Combines: magnitude of the outcome, prediction error, surprise, novelty,
 * and pattern reinforcement. Deterministic; range [0, 1].
 */
import type { MemoryOutcome, MemoryRecord, Situation } from '../core/domain.js';

export interface ImportanceSignals {
  magnitude: number;            // normalized |signed magnitude|
  predictionError: number;      // |expected − actual| in [0, 1]
  surprise: boolean;
  novel: boolean;
  patternReinforcement: number; // −1 (contradicts) … +1 (confirms)
}

export interface ImportanceContext {
  memoryCount: number;
  hasSimilar: boolean;
  /** Bad-rate of the closest pattern, in [0, 1]. Null if no pattern. */
  patternBadRate: number | null;
  /** |magnitude| considered ordinary in this dataset; scales the magnitude term. */
  magnitudeScale: number;
}

const BASE_IMPORTANCE = 0.1;

export interface ImportanceCandidate {
  situation: Situation;
  action: string;
  confidenceBase: number;
  outcome: MemoryOutcome | null;
}

export function scoreImportance(
  candidate: ImportanceCandidate,
  signals: ImportanceSignals,
  ctx: ImportanceContext,
): number {
  let score = BASE_IMPORTANCE;

  score += Math.min(0.3, signals.magnitude * 0.3);
  score += Math.min(0.3, signals.predictionError * 0.3);
  if (signals.surprise) score += 0.15;
  if (signals.novel) score += 0.1;

  if (signals.patternReinforcement > 0) {
    score += 0.1 * signals.patternReinforcement;
  } else if (signals.patternReinforcement < 0) {
    // Contradictions are MORE important than confirmations.
    score += 0.2 * Math.abs(signals.patternReinforcement);
  }

  // Bad outcomes are remembered more strongly than good ones.
  if (candidate.outcome?.valence === 'bad') score += 0.1;
  if (candidate.outcome?.valence === 'good') score -= 0.05;

  return Math.max(0, Math.min(1, score));
}

export function deriveSignals(
  candidate: ImportanceCandidate,
  hasSimilar: boolean,
  patternBadRate: number | null,
  magnitudeScale: number,
): ImportanceSignals {
  const raw = candidate.outcome?.magnitude ?? 0;
  const magnitude = magnitudeScale > 0 ? Math.min(1, Math.abs(raw) / magnitudeScale) : 0;

  // Expected-outcome proxy: how confident the agent was before memory.
  const expectedGood = candidate.confidenceBase; // confident in its action
  const actualGood = candidate.outcome
    ? candidate.outcome.valence === 'good' ? 1 : candidate.outcome.valence === 'bad' ? 0 : 0.5
    : 0.5;
  const predictionError = Math.abs(expectedGood - actualGood);

  const surprise = candidate.confidenceBase > 0.6 && candidate.outcome?.valence === 'bad';
  const novel = !hasSimilar;

  let patternReinforcement = 0;
  if (patternBadRate !== null && candidate.outcome) {
    const bad = candidate.outcome.valence === 'bad';
    // Reinforced when this outcome matches what the pattern predicted.
    if (bad && patternBadRate >= 0.5) patternReinforcement = 1;
    else if (!bad && patternBadRate < 0.5) patternReinforcement = 1;
    else patternReinforcement = -1;
  }

  return { magnitude, predictionError, surprise, novel, patternReinforcement };
}

/**
 * Coarse, deterministic fingerprint of a situation for pattern grouping.
 * Facets are sorted by key so signatures are stable regardless of insertion
 * order. `domain` anchors the signature; `text` deliberately excluded (it is
 * the uniqueness dimension, not the grouping dimension).
 */
export function situationSignature(situation: Situation): string {
  const facets = Object.keys(situation.facets)
    .filter((k) => !['direction', 'action'].includes(k)) // action-ish facets don't group
    .sort()
    .map((k) => `${k}:${situation.facets[k]}`)
    .join('|');
  return `${situation.domain}|${facets}`;
}

/** Back-compat alias for older call sites. */
export const contextTag = situationSignature;
