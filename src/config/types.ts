/**
 * CEPID shared domain types.
 *
 * Everything else in the codebase composes these primitives.
 * Provider-agnostic — no Limitless, Base Sepolia, or any chain-specific
 * identifiers leak into this file.
 */

export type Asset = 'BTC' | 'ETH';
export type Timeframe = '15M' | '1H';

export type Direction = 'YES' | 'NO' | 'NO_TRADE';

export type Outcome = 'WIN' | 'LOSS' | 'PENDING';

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

export interface ResolutionResult {
  marketId: string;
  outcome: Outcome;
  /** Final YES price after resolution, 0 or 1. */
  finalYesPrice: number;
  settledAt: string;
}

/** Normalized market snapshot — what the agent reasons over. */
export interface MarketSnapshot {
  /** Stable provider-side identifier (slug, address, or composite). */
  id: string;
  /** Human-readable label, e.g. "BTC 15m YES/NO — will BTC be above $65,000 in 15 minutes?" */
  title: string;
  asset: Asset;
  timeframe: Timeframe;
  /** Unix seconds when the market resolves. */
  expiresAt: number;
  /** Whether the market is currently accepting orders. */
  active: boolean;
  /** Implied probability of YES, in [0, 1]. */
  yesPrice: number;
  /** Best YES bid size, in shares. */
  yesBidSize: number;
  /** Best YES ask size, in shares. */
  yesAskSize: number;
  /** Minimum order size in shares. */
  minShares: number;
  /** Provider-reported liquidity indicator, when available. */
  liquidity?: number;
}

/** Single level on the YES book. */
export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  marketId: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  /** Implied midpoint. */
  midpoint: number;
  /** Provider-reported minimum order size in shares, when available. */
  minSize?: number;
}

export interface TradeIntent {
  marketId: string;
  direction: Direction;
  /** Shares to buy. 0 when direction is NO_TRADE. */
  shares: number;
  /** Limit price in USDC for the YES share, in [0, 1]. */
  price: number;
  /** Base strategy confidence before memory influence, in [0, 1]. */
  baseConfidence: number;
  /** Human-readable reasoning from the base strategy. */
  reason: string;
  createdAt: string;
}

export interface RiskDecision {
  approved: boolean;
  reasons: string[];
  /** USDC the trade will commit. 0 when rejected. */
  collateral: number;
  intent: TradeIntent;
}

/** Normalized market conditions used for memory similarity matching. */
export interface MarketContext {
  asset: Asset;
  timeframe: Timeframe;
  /** Implied YES probability, in [0, 1]. */
  yesPrice: number;
  /** Distance from 0.5, in [0, 0.5]. Captures "midpoint-conviction". */
  midpointDistance: number;
  /** Volatility bucket: low / medium / high. */
  volatility: 'low' | 'medium' | 'high';
  /** Momentum direction. */
  momentum: 'up' | 'down' | 'flat';
  /** Liquidity bucket. */
  liquidity: 'low' | 'medium' | 'high';
  /** Seconds remaining until expiry, bucketed. */
  timeRemainingBucket: '<2m' | '2-5m' | '5-10m' | '>10m';
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

export interface ExecutionContext {
  /** Entry price actually filled, when known. */
  entryPrice?: number;
  shares?: number;
  slippageBps?: number;
  /** On-chain transaction hash, when broadcast. */
  txHash?: string;
  executedAt: string;
}

export interface OutcomeContext {
  outcome: Outcome;
  /** Realized PnL in USDC. 0 when pending. */
  pnl: number;
  settlementAt?: string;
  /** What the agent actually expected would happen. */
  expectation: string;
  /** Free-text lesson extracted from the experience. */
  lesson: string;
}

/**
 * A single experience — the atomic unit of CEPID memory.
 * Captures conditions, decision, execution, outcome, and the lesson learned.
 */
export interface Experience {
  id: string;
  sessionId: string;
  marketId: string;
  asset: Asset;
  timeframe: Timeframe;
  createdAt: string;
  conditions: MarketContext;
  decision: {
    direction: Direction;
    baseConfidence: number;
    memoryInfluence: number;
    finalConfidence: number;
    memoryIds: string[];
  };
  execution: ExecutionContext;
  outcome: OutcomeContext;
  /** Deterministic importance score in [0, 1]. */
  importance: number;
  /** Whether the agent was surprised by the outcome. */
  surprising: boolean;
  /** Current memory strength, in [0, 1]. Decays over time unless reinforced. */
  strength: number;
  /** Tags that link this experience to others. */
  tags: string[];
}

export interface PatternMemory {
  id: string;
  /** Human-readable description, e.g. "High volatility + weakening momentum + late expiry". */
  description: string;
  /** Tag key this pattern is anchored on (e.g. "BTC:15M:high-vol:weakening-momentum"). */
  tagKey: string;
  experienceIds: string[];
  wins: number;
  losses: number;
  /** winRate = wins / (wins + losses). */
  winRate: number;
  /** Average PnL across the contributing experiences. */
  avgPnl: number;
  /** Pattern strength in [0, 1]. Strengthens with more reinforcement. */
  strength: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScarMemory {
  id: string;
  patternId: string;
  description: string;
  experienceIds: string[];
  /** Scars decay more slowly than ordinary memories. */
  decayMultiplier: number;
  strength: number;
  createdAt: string;
  updatedAt: string;
}

export interface RetrievedMemory {
  experience: Experience;
  /** Similarity in [0, 1]. */
  similarity: number;
  /** Whether this memory is a scar. */
  isScar: boolean;
  /** Whether this memory is part of a known pattern. */
  isPattern: boolean;
  /** Effective retrieval score after scar/pattern boosts. */
  retrievalScore: number;
}

export interface AgentSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  marketsObserved: string[];
  decisions: number;
  trades: number;
  memoryIds: string[];
  network: string;
}

export interface AgentConfig {
  network: 'base' | 'base-sepolia' | 'mock';
  privateKey: `0x${string}` | null;
  rpcUrl: string;
  dataDir: string;
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
