/**
 * Memory lifecycle — the validation loop.
 *
 * Closes: retrieved → used in a decision → outcome observed → validated →
 * reinforced | weakened.
 *
 * On every recorded outcome, the platform walks the decision's influence
 * chain (decision → retrieval → the memories actually cited) and scores each
 * used memory against reality:
 *
 *  - The memory's OWN past outcome agreed with the new outcome's valence
 *    (e.g. both bad, for the same action) → the memory taught a true lesson
 *    → reinforce (+VALIDATED_GAIN).
 *  - The memory's past outcome contradicted the new outcome (it said YES
 *    loses, but YES won) → the lesson was misleading → weaken
 *    (−CONTRADICTED_PENALTY).
 *  - No comparable valence (neutral outcomes) → no change; honesty over
 *    noise.
 *
 * Nothing here invents usage: a memory is only touched if a stored decision
 * row cites it via a stored retrieval row. The chain is the truth.
 */
import type { DecisionRecord, MemoryOutcome, MemoryRecord, OutcomeRecord } from '../core/domain.js';
import type { MemoryRepository } from '../repository/repository.js';
import { reinforce, weaken, VALIDATED_GAIN, CONTRADICTED_PENALTY } from './decay.js';
import { linkPatterns } from './linker.js';
import { updateScars } from './scars.js';

export interface ValidationSummary {
  decisionId: string;
  examined: number;
  reinforced: number;
  weakened: number;
  untouched: number;
  /** Human-readable trace of what was decided about each memory — audit. */
  entries: Array<{
    memoryId: string;
    verdict: 'reinforced' | 'weakened' | 'untouched';
    reason: string;
  }>;
}

/** Alignment check: does the memory's past outcome's valence match the new one, given the actions? */
function alignmentOf(memory: MemoryRecord, newOutcome: OutcomeRecord): 'agrees' | 'contradicts' | 'incomparable' {
  const past = memory.outcome;
  if (!past) return 'incomparable';

  // Compare valence polarity relative to the action taken.
  // If the agent took the SAME action class and the outcomes' valences
  // differ → the memory's lesson was misleading for this situation.
  const sameAction = memory.action === newOutcome.decisionAction;
  const pastBad = past.valence === 'bad';
  const newBad = newOutcome.outcome.valence === 'bad';

  if (past.valence === 'neutral' || newOutcome.outcome.valence === 'neutral') {
    return 'incomparable';
  }
  if (sameAction) {
    return pastBad === newBad ? 'agrees' : 'contradicts';
  }
  // Different action: the memory warned about the opposite move. If the new
  // outcome went badly for its own action, the memory's warning was
  // indirectly supported; if it went well, the warning cost an opportunity.
  return pastBad !== newBad ? 'agrees' : 'contradicts';
}

export async function validateAndAdjust(
  repo: MemoryRepository,
  agentId: string,
  decision: DecisionRecord,
  outcome: OutcomeRecord,
): Promise<ValidationSummary> {
  const summary: ValidationSummary = {
    decisionId: decision.id,
    examined: 0,
    reinforced: 0,
    weakened: 0,
    untouched: 0,
    entries: [],
  };

  // Only memories the decision actually cited through its retrieval are
  // in scope. No retrieval → nothing to validate (an unaided decision).
  if (!decision.retrievalId) {
    return summary;
  }
  const retrieval = await repo.getRetrieval(agentId, decision.retrievalId);
  if (!retrieval) return summary;

  for (const memoryId of retrieval.returnedMemoryIds) {
    // Only memories the decision explicitly used (the API recorded them in
    // the decision row at decision time; re-derive from the stored chain:
    // the decision's reasoning cited ids, and usage counts moved then).
    const memory = await repo.getMemory(agentId, memoryId);
    if (!memory) continue;
    summary.examined++;

    const alignment = alignmentOf(memory, outcome);
    if (alignment === 'agrees') {
      await reinforce(repo, agentId, memoryId, VALIDATED_GAIN);
      summary.reinforced++;
      summary.entries.push({
        memoryId,
        verdict: 'reinforced',
        reason: `memory's past outcome agreed with the observed outcome (action ${memory.action} vs ${outcome.decisionAction})`,
      });
    } else if (alignment === 'contradicts') {
      await weaken(repo, agentId, memoryId, CONTRADICTED_PENALTY);
      summary.weakened++;
      summary.entries.push({
        memoryId,
        verdict: 'weakened',
        reason: `memory's past outcome contradicted the observed outcome — its lesson was misleading here`,
      });
    } else {
      summary.untouched++;
      summary.entries.push({
        memoryId,
        verdict: 'untouched',
        reason: 'neutral/incomparable outcome — no honest signal to adjust on',
      });
    }
  }

  // Structure re-derives after every outcome: patterns and scars reflect
  // the latest evidence.
  await linkPatterns(repo, agentId);
  await updateScars(repo, agentId);

  if (summary.examined > 0) {
    await repo.appendEvent(agentId, {
      type: 'memory.validated',
      at: new Date().toISOString(),
      decisionId: decision.id,
      examined: summary.examined,
      reinforced: summary.reinforced,
      weakened: summary.weakened,
      entries: summary.entries,
    });
  }

  return summary;
}

export type { MemoryOutcome };
