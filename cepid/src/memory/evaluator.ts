/**
 * Memory evaluator — turns (situation, decision, outcome) into a MemoryRecord.
 *
 * This is the bridge from an agent's lived experience into CEPID's memory.
 * It computes importance + surprise via the deterministic model, attaches the
 * signature used for pattern grouping, and writes the record to the agent's
 * own store. It NEVER writes anything the caller didn't provide — no secrets,
 * no keys, no invented values.
 */
import { randomUUID } from 'node:crypto';
import type {
  DecisionRecord,
  MemoryOutcome,
  MemoryRecord,
  OutcomeRecord,
  Situation,
} from '../core/domain.js';
import {
  deriveSignals,
  scoreImportance,
  situationSignature,
  type ImportanceContext,
} from './importance.js';
import { similarity } from './similarity.js';
import { DEFAULT_MEMORY_META } from '../core/domain.js';
import { assertNoKeyMaterial } from '../core/secrets.js';
import type { MemoryRepository } from '../repository/repository.js';

export interface EvaluateInput {
  agentId: string;
  situation: Situation;
  decision: {
    action: string;
    confidenceBase: number;
    confidenceFinal: number;
    memoryInfluence: number;
    memoryIds: string[];
    reasoning: string[];
  };
  outcome: MemoryOutcome;
  /** Which run/source produced this experience. */
  source: string;
  decisionId: string | null;
}

export async function evaluateAndStore(
  repo: MemoryRepository,
  input: EvaluateInput,
): Promise<MemoryRecord> {
  // Boundary guard: key-shaped material must never become memory.
  assertNoKeyMaterial(input.situation, 'situation');
  assertNoKeyMaterial(input.decision, 'decision');
  assertNoKeyMaterial(input.outcome, 'outcome');

  const meta = await repo.getMeta(input.agentId);
  const magnitudeScale = meta.magnitudeScale || DEFAULT_MEMORY_META.magnitudeScale;

  // Find similar past memories for novelty/pattern context.
  const all = await repo.listMemories(input.agentId);
  const similar = all
    .filter((m) => m.kind === 'experience')
    .map((m) => ({ m, s: similarity(input.situation, m.situation) }))
    .filter((x) => x.s >= 0.75)
    .sort((a, b) => b.s - a.s);

  const ctx: ImportanceContext = {
    memoryCount: meta.experienceCount,
    hasSimilar: similar.length > 0,
    patternBadRate: null,
    magnitudeScale,
  };
  if (ctx.hasSimilar && similar[0]?.m.outcome) {
    ctx.patternBadRate = similar[0].m.outcome.valence === 'bad' ? 1 : 0;
  }

  const candidate = {
    situation: input.situation,
    action: input.decision.action,
    confidenceBase: input.decision.confidenceBase,
    outcome: input.outcome,
  };
  const signals = deriveSignals(candidate, ctx.hasSimilar, ctx.patternBadRate, magnitudeScale);
  const importance = scoreImportance(candidate, signals, ctx);

  const now = new Date().toISOString();
  const memory: MemoryRecord = {
    id: `mem-${randomUUID().slice(0, 12)}`,
    agentId: input.agentId,
    kind: 'experience',
    situation: input.situation,
    action: input.decision.action,
    decision: {
      action: input.decision.action,
      confidenceBase: input.decision.confidenceBase,
      confidenceFinal: input.decision.confidenceFinal,
      memoryInfluence: input.decision.memoryInfluence,
      memoryIds: input.decision.memoryIds,
      reasoning: input.decision.reasoning,
    },
    outcome: input.outcome,
    importance,
    surprising: signals.surprise,
    strength: 1.0,
    retrievedCount: 0,
    lastRetrievedAt: null,
    source: input.source,
    relationships: [],
    createdAt: now,
    updatedAt: now,
  };

  await repo.putMemory(input.agentId, memory);
  await repo.appendEvent(input.agentId, {
    type: 'memory.created',
    at: now,
    memoryId: memory.id,
    kind: memory.kind,
    domain: memory.situation.domain,
    action: memory.action,
    valence: memory.outcome?.valence ?? null,
    decisionId: input.decisionId,
  });

  return memory;
}

/** Attach an OutcomeRecord and close the loop on a decision. */
export async function recordOutcome(
  repo: MemoryRepository,
  input: {
    agentId: string;
    decisionId: string;
    decisionAction: string;
    outcome: MemoryOutcome;
  },
): Promise<OutcomeRecord> {
  const record: OutcomeRecord = {
    id: `out-${randomUUID().slice(0, 12)}`,
    decisionId: input.decisionId,
    agentId: input.agentId,
    decisionAction: input.decisionAction,
    outcome: input.outcome,
    observedAt: new Date().toISOString(),
  };
  await repo.putOutcome(input.agentId, record);
  await repo.appendEvent(input.agentId, {
    type: 'outcome.recorded',
    at: record.observedAt,
    decisionId: record.decisionId,
    result: record.outcome.result,
    valence: record.outcome.valence,
    marketOutcome: record.outcome.marketOutcome ?? null,
    tradeOutcome: record.outcome.tradeOutcome ?? null,
    evidence: record.outcome.evidence ?? null,
  });
  return record;
}
