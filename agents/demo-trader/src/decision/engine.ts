/**
 * Memory-informed decision engine — the DEMO AGENT's reasoning.
 *
 * Phase 4 shape: a PURE reasoner. It receives the memories CEPID's API
 * returned and decides how they vote on the base strategy's confidence.
 * It performs no I/O — no repository, no retrieval calls. CEPID is behind
 * HTTP now; this module is the agent's own thinking.
 *
 * Flow: base strategy intent → each retrieved memory votes (aligned loss →
 * big down; aligned win → small up; opposite loss → defensive up) → scar
 * penalty can veto → final decision with a reasoning trace citing ids.
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
import type { RetrievedMemoryView } from '@cepid/client';

const NO_TRADE_THRESHOLD = 0.5;
const SCAR_PENALTY_MULTIPLIER = 1.5;

export interface DecisionEngineDeps {
  strategy: BaseStrategy;
  /** What CEPID's /v1/memories/query returned for this situation. */
  retrieved: RetrievedMemoryView[];
}

export class MemoryInformedDecisionEngine {
  constructor(private readonly deps: DecisionEngineDeps) {}

  decide(
    market: MarketSnapshot,
    book: OrderBook | null,
    conditions: TradingConditions,
    considering: Direction,
  ): { intent: TradeIntent; decision: DecisionContext } {
    const baseIntent = this.deps.strategy.decide(market, book);
    const retrieved = this.deps.retrieved;

    if (baseIntent.direction === 'NO_TRADE') {
      return {
        intent: baseIntent,
        decision: explainNoTrade(baseIntent, retrieved),
      };
    }

    const { influence, reasons, ids } = computeMemoryInfluence(baseIntent.direction, retrieved);

    let finalConfidence = clamp01(baseIntent.baseConfidence + influence);

    const strongScarPenalty = retrieved
      .filter((r) => r.isScar && r.outcome?.valence === 'bad')
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

    return { intent, decision };
  }
}

function computeMemoryInfluence(
  direction: Direction,
  retrieved: RetrievedMemoryView[],
): { influence: number; reasons: string[]; ids: string[] } {
  let influence = 0;
  const reasons: string[] = [];
  const ids: string[] = [];

  for (const r of retrieved) {
    ids.push(r.id);
    const memDirection = inferActionDirection(r.action);
    if (!memDirection || !r.outcome) continue;

    const aligned = memDirection === direction;
    const weight = r.similarity
      * (r.isScar ? 1.5 : 1)
      * (r.isPattern ? 1.2 : 1)
      * clamp01(r.strength);
    const wasBad = r.outcome.valence === 'bad';

    if (aligned && wasBad) {
      influence -= weight * 0.25;
      reasons.push(`Memory ${r.id} (${(r.similarity * 100).toFixed(0)}% similar, ${r.isScar ? 'scar' : r.isPattern ? 'pattern' : 'experience'}) — same move (${r.action}) ended badly — confidence −${(weight * 0.25 * 100).toFixed(0)}%`);
    } else if (aligned && !wasBad) {
      influence += weight * 0.1;
      reasons.push(`Memory ${r.id} (${(r.similarity * 100).toFixed(0)}% similar) — same move went well — confidence +${(weight * 0.1 * 100).toFixed(0)}%`);
    } else if (!aligned && wasBad) {
      influence += weight * 0.05;
      reasons.push(`Memory ${r.id} — opposite move ended badly — small defensive boost`);
    } else if (!aligned && !wasBad) {
      influence -= weight * 0.05;
    }
  }

  return { influence, reasons, ids };
}

/** Map agent action strings back to directions for influence voting. */
function inferActionDirection(action: string): Direction | null {
  if (action === 'YES' || action === 'LONG' || action === 'BUY_YES') return 'YES';
  if (action === 'NO' || action === 'SHORT' || action === 'BUY_NO') return 'NO';
  if (action === 'NO_TRADE') return null;
  return null;
}

function explainNoTrade(base: TradeIntent, retrieved: RetrievedMemoryView[]): DecisionContext {
  return {
    decision: 'NO_TRADE',
    baseConfidence: base.baseConfidence,
    memoryInfluence: 0,
    finalConfidence: 0,
    memoryIds: retrieved.map((r) => r.id),
    reasoning: [`Base strategy: ${base.reason}`],
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function clampSigned(n: number): number {
  return Math.max(-1, Math.min(1, n));
}
