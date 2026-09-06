/**
 * Constraint Gate — the deterministic ALLOW/DENY layer between retrieval
 * and the agent's decision.
 *
 * The gate is the *control* surface of CEPID. A DENY means the agent must
 * not submit a trade, sign a transaction, or touch the market. A
 * BLOCKED DECISION is still recorded so the influence chain stays
 * inspectable end-to-end.
 *
 * Blocking criteria (priority order, in priority order):
 *   1. SCAR: a ScarRecord with strength ≥ 0.6 whose underlying pattern's
 *      signature matches the current situation's signature. DENY, blocking
 *      = scar.memoryIds.
 *   2. PATTERN: a PatternRecord with badRate ≥ 0.66, bad ≥ 3, and
 *      meanMagnitude ≤ -0.01, whose signature matches. DENY, blocking =
 *      pattern.memoryIds.
 *   3. BAD-EXPERIENCE: a retrieved MemoryRecord with outcome.valence
 *      === 'bad' and facet similarity ≥ 0.7 to the current situation.
 *      DENY, blocking = those memory ids.
 *   4. Otherwise: ALLOW. The reason field records what the gate saw.
 *
 * Conflict resolution: a scar + pattern match for the same signature
 * yields DENY with the union of blocking ids. A scar/pattern match
 * wins over a single bad-experience match when both apply (the scar is
 * the higher-confidence evidence).
 *
 * Determinism: the gate has no I/O, no randomness, no time-of-day, no
 * LLM. Same input → same verdict, every time.
 */
import type {
  MemoryRecord,
  PatternRecord,
  RetrievedMemory,
  ScarRecord,
  Situation,
} from '../core/domain.js';
import { situationSignature } from './importance.js';

export type Verdict = 'ALLOW' | 'DENY';
export type BlockingCriterion = 'scar' | 'pattern' | 'bad-experience' | 'none';

export interface GateResult {
  verdict: Verdict;
  reason: string;
  /** All memories the gate considered (retrieved bad ones + scar/pattern members). */
  usedMemoryIds: string[];
  /** Subset of usedMemoryIds that caused the DENY. Empty when verdict=ALLOW. */
  blockingMemoryIds: string[];
  blockedBy: BlockingCriterion;
  /** The signature that matched, when the gate fires on a scar/pattern. */
  matchedSignature: string | null;
}

export interface GateInput {
  situation: Situation;
  retrieved: RetrievedMemory[];
  patterns: PatternRecord[];
  scars: ScarRecord[];
}

/** Minimum strength for a scar to trigger DENY. */
export const SCAR_STRENGTH_MIN = 0.6;
/** Pattern-level trip-wire (matches the scar-qualification bar but evaluated on the pattern). */
export const PATTERN_BAD_RATE_MIN = 0.66;
export const PATTERN_BAD_COUNT_MIN = 3;
export const PATTERN_MEAN_MAGNITUDE_MAX = -0.01;
/** Facet-similarity threshold for a single bad memory to count as "materially similar". */
export const BAD_EXPERIENCE_SIMILARITY_MIN = 0.7;

export function evaluateGate(input: GateInput): GateResult {
  const { situation, retrieved, patterns, scars } = input;
  const currentSig = situationSignature(situation);

  // 1) SCAR — find scars whose pattern's signature matches. A scar is the
  // strongest evidence; its blocking set is the union of the scar's
  // memories and the linked pattern's memories (the scar is built FROM
  // the pattern; both tell the user why the gate fired).
  const patternById = new Map(patterns.map((p) => [p.id, p]));
  const matchingScars: ScarRecord[] = [];
  for (const scar of scars) {
    if (scar.strength < SCAR_STRENGTH_MIN) continue;
    const pat = patternById.get(scar.patternId);
    if (!pat) continue;
    if (pat.signature === currentSig) matchingScars.push(scar);
  }
  if (matchingScars.length > 0) {
    const blocking = unique([
      ...matchingScars.flatMap((s) => s.memoryIds),
      ...matchingScars.flatMap((s) => patternById.get(s.patternId)?.memoryIds ?? []),
    ]);
    return {
      verdict: 'DENY',
      reason: `strong relevant scar blocks this action (${matchingScars.length} matching scar${matchingScars.length === 1 ? '' : 's'})`,
      usedMemoryIds: blocking,
      blockingMemoryIds: blocking,
      blockedBy: 'scar',
      matchedSignature: currentSig,
    };
  }

  // 2) PATTERN — pattern itself is bad enough to block.
  const matchingPatterns = patterns.filter((p) => {
    if (p.signature !== currentSig) return false;
    if (p.badRate < PATTERN_BAD_RATE_MIN) return false;
    if (p.bad < PATTERN_BAD_COUNT_MIN) return false;
    if (p.meanMagnitude > PATTERN_MEAN_MAGNITUDE_MAX) return false;
    return true;
  });
  if (matchingPatterns.length > 0) {
    const blocking = unique(matchingPatterns.flatMap((p) => p.memoryIds));
    return {
      verdict: 'DENY',
      reason: `repeated negative pattern blocks this action (${matchingPatterns.length} matching pattern${matchingPatterns.length === 1 ? '' : 's'})`,
      usedMemoryIds: blocking,
      blockingMemoryIds: blocking,
      blockedBy: 'pattern',
      matchedSignature: currentSig,
    };
  }

  // 3) BAD-EXPERIENCE — a retrieved memory with bad outcome that is materially similar.
  const badBlocking = retrieved
    .filter((r) => r.memory.outcome?.valence === 'bad')
    .filter((r) => r.similarity >= BAD_EXPERIENCE_SIMILARITY_MIN)
    .map((r) => r.memory.id);
  if (badBlocking.length > 0) {
    return {
      verdict: 'DENY',
      reason: `bad-outcome memory at ${(BAD_EXPERIENCE_SIMILARITY_MIN * 100).toFixed(0)}%+ similarity blocks this action (${badBlocking.length} ${badBlocking.length === 1 ? 'memory' : 'memories'})`,
      usedMemoryIds: badBlocking,
      blockingMemoryIds: badBlocking,
      blockedBy: 'bad-experience',
      matchedSignature: null,
    };
  }

  // 4) ALLOW — describe what we saw.
  const retrievedCount = retrieved.length;
  const hasBad = retrieved.some((r) => r.memory.outcome?.valence === 'bad');
  if (retrievedCount === 0) {
    return {
      verdict: 'ALLOW',
      reason: 'no memories retrieved',
      usedMemoryIds: [],
      blockingMemoryIds: [],
      blockedBy: 'none',
      matchedSignature: null,
    };
  }
  if (!hasBad) {
    return {
      verdict: 'ALLOW',
      reason: `${retrievedCount} retrieved ${retrievedCount === 1 ? 'memory' : 'memories'}, none with a blocking outcome`,
      usedMemoryIds: [],
      blockingMemoryIds: [],
      blockedBy: 'none',
      matchedSignature: null,
    };
  }
  return {
    verdict: 'ALLOW',
    reason: `bad-outcome memory present but below the ${(BAD_EXPERIENCE_SIMILARITY_MIN * 100).toFixed(0)}% similarity threshold`,
    usedMemoryIds: [],
    blockingMemoryIds: [],
    blockedBy: 'none',
    matchedSignature: null,
  };
}

function unique<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}
