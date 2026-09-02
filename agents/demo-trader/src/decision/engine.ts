/**
 * Memory-informed decision engine — the DEMO AGENT's reasoning.
 *
 * This is agent logic, not platform logic: how THIS agent lets memory change
 * its mind. Flow: base strategy → CEPID retrieval (generic situations) →
 * each retrieved memory votes on confidence → strong scars can veto →
 * final decision with a reasoning trace that cites the memories used.
 */
import type {
  DecisionContext,
  Direction,
  MarketSnapshot,
  OrderBook,
  TradeIntent,
  TradingConditions,
} from '../config/types.js';
import type { BaseStrategy } from '../strategy/base-strategy.js';
import {
  retrieveMemories,
  type RetrievedMemory,
  type MemoryRepository,
  type SimilarityWeights,
} from '@cepid/server';

const NO_TRADE_THRESHOLD = 0.5;
const SCAR_PENALTY_MULTIPLIER = 1.5;

/** Trading-domain similarity weights: the trading PROFILE of the generic engine. */
export const TRADING_SIMILARITY_WEIGHTS: SimilarityWeights = {
  facetWeight: 0.85,
  textWeight: 0.15,
  facetWeights: {
    asset: 2.0,
    timeframe: 1.5,
    volatility: 1.5,
    momentum: 1.2,
    liquidity: 1.0,
    timeRemaining: 1.0,
    midpoint: 0.5,
  },
};

export interface DecisionEngineDeps {
  strategy: BaseStrategy;
  memory: MemoryRepository;
  agentId: string;
  influenceMinSimilarity?: number;
}

export class MemoryInformedDecisionEngine {
  constructor(private readonly deps: DecisionEngineDeps) {}

  async decide(
    market: MarketSnapshot,
    book: OrderBook | null,
    conditions: TradingConditions,
    considering: Direction,
  ): Promise<{ intent: TradeIntent; decision: DecisionContext; retrieved: RetrievedMemory[] }> {
    const baseIntent = this.deps.strategy.decide(market, book);
    const { toSituation } = await import('../config/types.js');
    const situation = toSituation(conditions, considering);

    const retrieved = await retrieveMemories(
      this.deps.memory,
      this.deps.agentId,
      situation,
      {
        limit: 10,
        minSimilarity: this.deps.influenceMinSimilarity ?? 0.5,
        weights: TRADING_SIMILARITY_WEIGHTS,
      },
    );

    if (baseIntent.direction === 'NO_TRADE') {
      return {
        intent: baseIntent,
        decision: explainNoTrade(baseIntent, retrieved),
        retrieved,
      };
    }

    const { influence, reasons, ids } = computeMemoryInfluence(baseIntent.direction, retrieved);

    let finalConfidence = clamp01(baseIntent.baseConfidence + influence);

    const strongScarPenalty = retrieved
      .filter((r) => r.isScar && r.memory.outcome?.valence === 'bad')
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
    ids.push(r.memory.id);
    const memDirection = inferActionDirection(r.memory.action);
    if (!memDirection || !r.memory.outcome) continue;

    const aligned = memDirection === direction;
    const weight = r.similarity
      * (r.isScar ? 1.5 : 1)
      * (r.isPattern ? 1.2 : 1)
      * clamp01(r.memory.strength);
    const wasBad = r.memory.outcome.valence === 'bad';

    if (aligned && wasBad) {
      influence -= weight * 0.25;
      reasons.push(`Memory ${r.memory.id} (${(r.similarity * 100).toFixed(0)}% similar, ${r.isScar ? 'scar' : r.isPattern ? 'pattern' : 'experience'}) — same move (${r.memory.action}) lost ${r.memory.outcome.magnitude ?? 0} — confidence −${(weight * 0.25 * 100).toFixed(0)}%`);
    } else if (aligned && !wasBad) {
      influence += weight * 0.1;
      reasons.push(`Memory ${r.memory.id} (${(r.similarity * 100).toFixed(0)}% similar) — same move won — confidence +${(weight * 0.1 * 100).toFixed(0)}%`);
    } else if (!aligned && wasBad) {
      influence += weight * 0.05;
      reasons.push(`Memory ${r.memory.id} — opposite move lost — small defensive boost`);
    } else if (!aligned && !wasBad) {
      influence -= weight * 0.05;
    }
  }

  return { influence, reasons, ids };
}

/** Map an agent action string back to a direction for influence voting. */
function inferActionDirection(action: string): Direction | null {
  if (action === 'YES' || action === 'LONG' || action === 'BUY_YES') return 'YES';
  if (action === 'NO' || action === 'SHORT' || action === 'BUY_NO') return 'NO';
  if (action === 'NO_TRADE') return null;
  return null;
}

function explainNoTrade(base: TradeIntent, retrieved: RetrievedMemory[]): DecisionContext {
  return {
    decision: 'NO_TRADE',
    baseConfidence: base.baseConfidence,
    memoryInfluence: 0,
    finalConfidence: 0,
    memoryIds: retrieved.map((r) => r.memory.id),
    reasoning: [`Base strategy: ${base.reason}`],
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function clampSigned(n: number): number {
  return Math.max(-1, Math.min(1, n));
}
