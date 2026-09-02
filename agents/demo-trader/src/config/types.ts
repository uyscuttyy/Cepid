/**
 * Demo trading agent — domain types.
 *
 * This is AGENT vocabulary, not platform vocabulary. CEPID's core knows
 * nothing about assets, PnL, or trade directions; everything here exists to
 * (a) run the trading loop and (b) translate trading reality into CEPID's
 * generic Situation / Decision / Outcome shapes.
 *
 * Correctness rules carried from the restructure:
 *  - marketOutcome (what the market resolved to) and tradeOutcome (whether
 *    the agent's position won) are computed separately, never copied one
 *    from the other.
 *  - PnL is computed independently from entry price and resolution and is
 *    the authoritative financial result.
 */
import type {
  Situation,
  MemoryOutcome,
} from '@cepid/server';

export type Asset = 'BTC' | 'ETH';
export type Timeframe = '15M' | '1H';
export type Direction = 'YES' | 'NO' | 'NO_TRADE';

/** What the MARKET resolved to — a fact about the environment. */
export type MarketResolution = 'YES_WON' | 'NO_WON' | 'UNRESOLVED';

/** Whether the agent's POSITION won — a fact about the agent's action. */
export type TradeResult = 'WIN' | 'LOSS' | 'PENDING';

export type ExecutionState =
  | 'IDLE'
  | 'ANALYZING'
  | 'DECISION_MADE'
  | 'RISK_CHECK'
  | 'SIGNING'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'POSITION_OPEN'
  | 'REJECTED'
  | 'FAILED';

export interface MarketSnapshot {
  id: string;
  title: string;
  asset: Asset;
  timeframe: Timeframe;
  expiresAt: number;
  active: boolean;
  yesPrice: number;
  yesBidSize: number;
  yesAskSize: number;
  minShares: number;
  liquidity?: number;
}

export interface OrderBookLevel { price: number; size: number }
export interface OrderBook {
  marketId: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  midpoint: number;
  minSize?: number;
}

export interface DecisionContext {
  decision: Direction;
  baseConfidence: number;
  /** Sum of influences from retrieved memories, in [-1, 1]. */
  memoryInfluence: number;
  /** Final confidence after memory influence, in [0, 1]. */
  finalConfidence: number;
  /** IDs of memories that participated in this decision. */
  memoryIds: string[];
  reasoning: string[];
}

export interface TradeIntent {
  marketId: string;
  direction: Direction;
  shares: number;
  price: number;
  baseConfidence: number;
  reason: string;
  createdAt: string;
}

export interface RiskDecision {
  approved: boolean;
  reasons: string[];
  collateral: number;
  intent: TradeIntent;
}

export interface ExecutionContext {
  entryPrice?: number;
  shares?: number;
  slippageBps?: number;
  txHash?: string;
  executedAt: string;
}

export interface AgentSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  marketsObserved: string[];
  decisions: number;
  trades: number;
  memoryIds: string[];
  /** Collateral spent this session (risk engine input — no longer a dead field). */
  collateralSpent: number;
  network: string;
}

export interface AgentConfig {
  network: 'base' | 'base-sepolia' | 'mock';
  privateKey: `0x${string}` | null;
  rpcUrl: string;
  dataDir: string;
  /** This agent's identity with CEPID. Phase 3+: API key replaces env config. */
  agentId: string;
  risk: {
    maxCollateralUsdc: number;
    sessionMaxCollateralUsdc: number;
    sessionMaxOrders: number;
    maxSlippageBps: number;
  };
  limitless?: {
    tokenId: string;
    tokenSecret: string;
    ownerId: string;
    apiBase: string;
    wsUrl: string;
  };
}

/* --------------------------------------------------------------- bridge --- */
/* Translation between this agent's reality and CEPID's generic schema.      */

export interface TradingConditions {
  asset: Asset;
  timeframe: Timeframe;
  yesPrice: number;
  midpointDistance: number;
  volatility: 'low' | 'medium' | 'high';
  momentum: 'up' | 'down' | 'flat';
  liquidity: 'low' | 'medium' | 'high';
  timeRemainingBucket: '<2m' | '2-5m' | '5-10m' | '>10m';
}

/** Build the CEPID Situation for a trading context. */
export function toSituation(c: TradingConditions, considering: Direction): Situation {
  return {
    domain: 'prediction-market',
    text: [
      `${c.asset} ${c.timeframe} binary market`,
      `${c.volatility} volatility`,
      `liquidity ${c.liquidity}`,
      `momentum ${c.momentum}`,
      `midpoint ${c.yesPrice.toFixed(2)}`,
      `${c.timeRemainingBucket} remaining`,
      `considering ${considering}`,
    ].join(', '),
    facets: {
      asset: c.asset,
      timeframe: c.timeframe,
      volatility: c.volatility,
      momentum: c.momentum,
      liquidity: c.liquidity,
      timeRemaining: c.timeRemainingBucket,
      midpoint: Number(c.yesPrice.toFixed(2)),
    },
  };
}

/**
 * Build the CEPID MemoryOutcome for a settled trade.
 *
 * marketOutcome and tradeOutcome are derived INDEPENDENTLY:
 *  - marketOutcome: from the market's resolution (YES_WON / NO_WON).
 *  - tradeOutcome: from direction × market resolution — the position's result.
 *  - pnl: from shares × entry price × resolution, computed separately.
 */
export function toOutcome(input: {
  direction: Direction;
  resolution: { outcome: 'WIN' | 'LOSS' | 'PENDING'; finalYesPrice: number };
  entryPrice: number;
  shares: number;
  txHash?: string;
  expectation: string;
  lesson: string;
}): MemoryOutcome | null {
  if (input.resolution.outcome === 'PENDING') return null;

  // The market's fact: did YES win? Mirrors the provider's convention where
  // WIN means "the YES side was right" — a fact about the market only.
  const marketOutcome: MarketResolution =
    input.resolution.outcome === 'WIN' ? 'YES_WON' : 'NO_WON';

  // The agent's fact: did OUR POSITION win? YES position wins iff market
  // resolved YES_WON; NO position wins iff NO_WON. Computed from direction,
  // never copied from the market's outcome.
  const positionWon =
    (input.direction === 'YES' && marketOutcome === 'YES_WON') ||
    (input.direction === 'NO' && marketOutcome === 'NO_WON');
  const tradeOutcome: TradeResult = positionWon ? 'WIN' : 'LOSS';

  // PnL independent of both labels: the arithmetic of the position.
  const pnl = positionWon
    ? input.shares * (1 - input.entryPrice)   // win: shares redeem at 1, paid entry
    : -input.shares * input.entryPrice;       // loss: entry price is gone

  return {
    result: tradeOutcome,
    valence: positionWon ? 'good' : 'bad',
    magnitude: Number(pnl.toFixed(6)),
    metrics: { pnl: Number(pnl.toFixed(6)), shares: input.shares, entryPrice: input.entryPrice },
    marketOutcome,
    tradeOutcome,
    evidence: input.txHash
      ? { chain: 'base-sepolia', txHash: input.txHash }
      : undefined,
    observedAt: new Date().toISOString(),
  };
}

/** Legacy alias for the provider layer. */
export type Outcome = 'WIN' | 'LOSS' | 'PENDING';

export interface ResolutionResult {
  marketId: string;
  outcome: Outcome;
  finalYesPrice: number;
  settledAt: string;
}
