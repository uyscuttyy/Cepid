/**
 * Memory importance scoring.
 *
 * Decides whether a `(decision, outcome)` pair is worth remembering,
 * and how strongly.
 *
 * Combines:
 *  - magnitude of outcome (|pnl|)
 *  - prediction error (how far actual vs base confidence was from the outcome)
 *  - surprise (unexpected direction)
 *  - whether the experience is novel (no similar memory yet)
 *  - whether it confirms/contradicts an existing pattern
 *
 * The function is pure and deterministic.
 */
import type { Experience, MarketContext } from '../config/types.js';

export interface ImportanceSignals {
  magnitude: number;          // |pnl|, normalized
  predictionError: number;    // |expected - actual|, in [0, 1]
  surprise: boolean;
  novel: boolean;
  patternReinforcement: number; // -1 (contradicts pattern) to +1 (confirms)
}

export interface ImportanceContext {
  /** Total memory count before this one. */
  memoryCount: number;
  /** Whether a similar experience (above similarity threshold) already exists. */
  hasSimilar: boolean;
  /** Win rate of the closest pattern, in [0, 1]. Null if no pattern. */
  patternWinRate: number | null;
  /** PnL magnitude considered "ordinary" in this dataset. Used to scale magnitude. */
  pnlScale: number;
}

const BASE_IMPORTANCE = 0.1;

export function scoreImportance(
  candidate: Pick<Experience, 'outcome' | 'conditions' | 'decision'>,
  signals: ImportanceSignals,
  ctx: ImportanceContext,
): number {
  let score = BASE_IMPORTANCE;

  // Magnitude contribution (clamped)
  score += Math.min(0.3, signals.magnitude * 0.3);

  // Prediction error contribution (large for surprise, even if magnitude small)
  score += Math.min(0.3, signals.predictionError * 0.3);

  // Surprise bonus
  if (signals.surprise) score += 0.15;

  // Novelty bonus
  if (signals.novel) score += 0.1;

  // Pattern reinforcement
  if (signals.patternReinforcement > 0) {
    score += 0.1 * signals.patternReinforcement;
  } else if (signals.patternReinforcement < 0) {
    score += 0.2 * Math.abs(signals.patternReinforcement); // contradictions are MORE important
  }

  // Loss penalty / win discount
  if (candidate.outcome.outcome === 'LOSS') score += 0.1;
  if (candidate.outcome.outcome === 'WIN') score -= 0.05;

  return Math.max(0, Math.min(1, score));
}

export function deriveSignals(
  candidate: Pick<Experience, 'outcome' | 'decision' | 'conditions'>,
  hasSimilar: boolean,
  patternWinRate: number | null,
  pnlScale: number,
): ImportanceSignals {
  const pnl = Math.abs(candidate.outcome.pnl);
  const magnitude = pnlScale > 0 ? Math.min(1, pnl / pnlScale) : 0;

  // Expected outcome proxy: 1 if YES, 0 if NO; confidence scales the expectation.
  const dirExpectation = candidate.decision.direction === 'YES'
    ? candidate.decision.baseConfidence
    : candidate.decision.direction === 'NO'
      ? 1 - candidate.decision.baseConfidence
      : 0.5;
  const actual = candidate.outcome.outcome === 'WIN' ? 1 : candidate.outcome.outcome === 'LOSS' ? 0 : 0.5;
  const predictionError = Math.abs(dirExpectation - actual);

  // Surprise: high confidence + wrong outcome
  const surprise = candidate.decision.baseConfidence > 0.6 && candidate.outcome.outcome === 'LOSS';

  const novel = !hasSimilar;

  let patternReinforcement = 0;
  if (patternWinRate !== null) {
    if (candidate.outcome.outcome === 'WIN') {
      patternReinforcement = patternWinRate >= 0.5 ? 1 : -1;
    } else if (candidate.outcome.outcome === 'LOSS') {
      patternReinforcement = patternWinRate < 0.5 ? 1 : -1;
    }
  }

  return { magnitude, predictionError, surprise, novel, patternReinforcement };
}

/** Coarse, deterministic fingerprint of a market condition for pattern detection. */
export function contextTag(ctx: MarketContext): string {
  return [
    ctx.asset,
    ctx.timeframe,
    `vol:${ctx.volatility}`,
    `mom:${ctx.momentum}`,
    `liq:${ctx.liquidity}`,
    `time:${ctx.timeRemainingBucket}`,
  ].join('|');
}
