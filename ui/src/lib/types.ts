/**
 * UI-facing types. These mirror the agent's internal types but are intentionally
 * independent — the UI should not depend on the agent's exact shape, only the
 * fields it cares about. If the agent changes, this file is the contract.
 */

export type Asset = 'BTC' | 'ETH';
export type Timeframe = '15M' | '1H';
export type Direction = 'YES' | 'NO' | 'NO_TRADE';
export type Outcome = 'WIN' | 'LOSS' | 'PENDING';

export interface MarketContext {
  asset: Asset;
  timeframe: Timeframe;
  yesPrice: number;
  midpointDistance: number;
  volatility: 'low' | 'medium' | 'high';
  momentum: 'up' | 'down' | 'flat';
  liquidity: 'low' | 'medium' | 'high';
  timeRemainingBucket: '<2m' | '2-5m' | '5-10m' | '>10m';
}

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
  execution: {
    entryPrice?: number;
    shares?: number;
    slippageBps?: number;
    txHash?: string;
    executedAt: string;
  };
  outcome: {
    outcome: Outcome;
    pnl: number;
    settlementAt?: string;
    expectation: string;
    lesson: string;
  };
  importance: number;
  surprising: boolean;
  strength: number;
  tags: string[];
}

export interface PatternMemory {
  id: string;
  description: string;
  tagKey: string;
  experienceIds: string[];
  wins: number;
  losses: number;
  winRate: number;
  avgPnl: number;
  strength: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScarMemory {
  id: string;
  patternId: string;
  description: string;
  experienceIds: string[];
  decayMultiplier: number;
  strength: number;
  createdAt: string;
  updatedAt: string;
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

export interface AgentEvent {
  type: string;
  at: string;
  wallet: string;
  [key: string]: unknown;
}

export interface AgentSnapshot {
  network: string;
  rpcUrl: string;
  walletAddress: string | null;
  dataDir: string;
  risk: {
    maxCollateralUsdc: number;
    sessionMaxCollateralUsdc: number;
    sessionMaxOrders: number;
    maxSlippageBps: number;
  };
  meta: {
    experienceCount: number;
    patternCount: number;
    scarCount: number;
    pnlScale: number;
  };
}

export interface PerformanceSummary {
  trades: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  totalPnl: number;
  realizedPnl: number;
  averagePnl: number;
  bestTrade: { id: string; pnl: number } | null;
  worstTrade: { id: string; pnl: number } | null;
}
