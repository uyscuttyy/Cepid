/**
 * Memory evaluator — converts a (decision, outcome) pair into an Experience.
 *
 * This is the bridge from the runtime → memory. Decides:
 *  - importance score
 *  - whether the experience is "surprising"
 *  - which tags to attach
 *  - the lesson text
 */
import { randomUUID } from 'node:crypto';
import type {
  DecisionContext,
  Experience,
  ExecutionContext,
  MarketContext,
  MarketSnapshot,
  Outcome,
  OutcomeContext,
  TradeIntent,
} from '../config/types.js';
import { deriveSignals, scoreImportance, contextTag, ImportanceContext } from './importance.js';
import type { MemoryRepository } from './repository.js';

export interface EvaluateInput {
  sessionId: string;
  market: MarketSnapshot;
  conditions: MarketContext;
  decision: DecisionContext;
  intent: TradeIntent;
  execution: ExecutionContext;
  outcome: Outcome;
  pnl: number;
  expectation: string;
  lesson: string;
}

export async function evaluateAndStore(
  repo: MemoryRepository,
  input: EvaluateInput,
): Promise<Experience> {
  const meta = await repo.getMeta();
  const ctx: ImportanceContext = {
    memoryCount: meta.experienceCount,
    hasSimilar: false, // updated below
    patternWinRate: null, // updated below
    pnlScale: meta.pnlScale,
  };

  // Find similar past experiences
  const all = await repo.listExperiences();
  const { similarity } = await import('./similarity.js');
  const similar = all
    .map((e) => ({ e, s: similarity(input.conditions, e.conditions) }))
    .filter((x) => x.s >= 0.75)
    .sort((a, b) => b.s - a.s);
  ctx.hasSimilar = similar.length > 0;
  if (ctx.hasSimilar && similar[0]) {
    const outcomeAligned = similar[0].e.outcome.outcome;
    if (outcomeAligned === 'WIN') ctx.patternWinRate = 1;
    else if (outcomeAligned === 'LOSS') ctx.patternWinRate = 0;
  }

  const outcome: OutcomeContext = {
    outcome: input.outcome,
    pnl: input.pnl,
    settlementAt: input.outcome === 'PENDING' ? undefined : new Date().toISOString(),
    expectation: input.expectation,
    lesson: input.lesson,
  };

  const candidate = {
    outcome,
    conditions: input.conditions,
    decision: {
      direction: input.intent.direction,
      baseConfidence: input.decision.baseConfidence,
      memoryInfluence: input.decision.memoryInfluence,
      finalConfidence: input.decision.finalConfidence,
      memoryIds: input.decision.memoryIds,
    },
  };

  const signals = deriveSignals(candidate, ctx.hasSimilar, ctx.patternWinRate, ctx.pnlScale);
  const importance = scoreImportance(candidate, signals, ctx);

  const experience: Experience = {
    id: `exp-${randomUUID().slice(0, 12)}`,
    sessionId: input.sessionId,
    marketId: input.market.id,
    asset: input.market.asset,
    timeframe: input.market.timeframe,
    createdAt: new Date().toISOString(),
    conditions: input.conditions,
    decision: {
      direction: input.decision.decision,
      baseConfidence: input.decision.baseConfidence,
      memoryInfluence: input.decision.memoryInfluence,
      finalConfidence: input.decision.finalConfidence,
      memoryIds: input.decision.memoryIds,
    },
    execution: input.execution,
    outcome,
    importance,
    surprising: signals.surprise,
    strength: 1.0,
    tags: [contextTag(input.conditions)],
  };

  await repo.putExperience(experience);
  return experience;
}
