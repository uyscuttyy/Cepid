/**
 * Memory-informed decision engine.
 *
 * This is where the product's core thesis lives: memory changes the decision.
 *
 * Flow:
 *  1. Base strategy produces an intent (TradeIntent with baseConfidence).
 *  2. Memory retriever returns relevant past experiences.
 *  3. Each retrieved experience votes on the intent's confidence:
 *     - LOSS on same direction → reduce confidence
 *     - WIN on same direction → small boost
 *     - LOSS on opposite direction → small boost (defensive)
 *     - WIN on opposite direction → reduce
 *  4. Scarred experiences get extra weight.
 *  5. If finalConfidence drops below 0.5 (or below a scar-driven threshold),
 *     the decision becomes NO_TRADE.
 */
import type {
  DecisionContext,
  Direction,
  MarketContext,
  MarketSnapshot,
  OrderBook,
  RetrievedMemory,
  TradeIntent,
} from '../config/types.js';
import type { BaseStrategy } from '../strategy/base-strategy.js';
import { retrieveMemories } from '../memory/retriever.js';
import type { MemoryRepository } from '../memory/repository.js';

const NO_TRADE_THRESHOLD = 0.5;
const SCAR_PENALTY_MULTIPLIER = 1.5;

export interface DecisionEngineDeps {
  strategy: BaseStrategy;
  memory: MemoryRepository;
  /** Minimum similarity to let a memory influence the decision. */
  influenceMinSimilarity?: number;
}

export class MemoryInformedDecisionEngine {
  constructor(private readonly deps: DecisionEngineDeps) {}

  async decide(
    market: MarketSnapshot,
    book: OrderBook | null,
    conditions: MarketContext,
  ): Promise<{ intent: TradeIntent; decision: DecisionContext; retrieved: RetrievedMemory[] }> {
    const baseIntent = this.deps.strategy.decide(market, book);
    const retrieved = await retrieveMemories(this.deps.memory, conditions, {
      limit: 10,
      minSimilarity: this.deps.influenceMinSimilarity ?? 0.5,
    });

    if (baseIntent.direction === 'NO_TRADE') {
      return {
        intent: baseIntent,
        decision: explainNoTrade(baseIntent, retrieved),
        retrieved,
      };
    }

    const { influence, reasons, ids } = computeMemoryInfluence(baseIntent.direction, retrieved);

    let finalConfidence = clamp01(baseIntent.baseConfidence + influence);

    // Strong-scar penalty
    const strongScarPenalty = retrieved
      .filter((r) => r.isScar && r.experience.outcome.outcome === 'LOSS')
      .reduce((s, r) => s + SCAR_PENALTY_MULTIPLIER * r.similarity * 0.15, 0);
    finalConfidence = clamp01(finalConfidence - strongScarPenalty);

    const finalDirection: Direction = finalConfidence < NO_TRADE_THRESHOLD ? 'NO_TRADE' : baseIntent.direction;

    const intent: TradeIntent = finalDirection === 'NO_TRADE'
      ? {
          ...baseIntent,
          direction: 'NO_TRADE',
          shares: 0,
          reason: `Memory veto (final confidence ${(finalConfidence * 100).toFixed(0)}% < ${(NO_TRADE_THRESHOLD * 100).toFixed(0)}%)`,
        }
      : baseIntent;

    const decision: DecisionContext = {
      decision: finalDirection,
      baseConfidence: baseIntent.baseConfidence,
      memoryInfluence: clampSigned(influence - strongScarPenalty),
      finalConfidence,
      memoryIds: ids,
      reasoning: [
        `Base strategy: ${baseIntent.reason}`,
        ...reasons,
        `Final confidence: ${(finalConfidence * 100).toFixed(1)}%`,
      ],
    };

    return { intent, decision, retrieved };
  }
}

function computeMemoryInfluence(
  direction: Direction,
  retrieved: RetrievedMemory[],
): { influence: number; reasons: string[]; ids: string[] } {
  let influence = 0;
  const reasons: string[] = [];
  const ids: string[] = [];

  for (const r of retrieved) {
    ids.push(r.experience.id);
    const aligned = r.experience.decision.direction === direction;
    const weight = r.similarity * (r.isScar ? 1.5 : 1) * (r.isPattern ? 1.2 : 1) * clamp01(r.experience.strength);
    if (r.experience.outcome.outcome === 'PENDING') continue;
    if (aligned && r.experience.outcome.outcome === 'LOSS') {
      influence -= weight * 0.25;
      reasons.push(`Memory ${r.experience.id} (sim ${(r.similarity * 100).toFixed(0)}%, ${r.isScar ? 'scar' : r.isPattern ? 'pattern' : 'exp'}) supports ${direction} but ended in LOSS — confidence reduced by ${(weight * 0.25 * 100).toFixed(0)}%`);
    } else if (aligned && r.experience.outcome.outcome === 'WIN') {
      influence += weight * 0.1;
      reasons.push(`Memory ${r.experience.id} (sim ${(r.similarity * 100).toFixed(0)}%) supports ${direction} and ended in WIN — confidence boosted by ${(weight * 0.1 * 100).toFixed(0)}%`);
    } else if (!aligned && r.experience.outcome.outcome === 'LOSS') {
      influence += weight * 0.05;
      reasons.push(`Memory ${r.experience.id} opposed ${direction} and lost — small defensive boost`);
    } else if (!aligned && r.experience.outcome.outcome === 'WIN') {
      influence -= weight * 0.05;
    }
  }

  return { influence, reasons, ids };
}

function explainNoTrade(base: TradeIntent, retrieved: RetrievedMemory[]): DecisionContext {
  return {
    decision: 'NO_TRADE',
    baseConfidence: base.baseConfidence,
    memoryInfluence: 0,
    finalConfidence: 0,
    memoryIds: retrieved.map((r) => r.experience.id),
    reasoning: [`Base strategy: ${base.reason}`],
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function clampSigned(n: number): number {
  return Math.max(-1, Math.min(1, n));
}
