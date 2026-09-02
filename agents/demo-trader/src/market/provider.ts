/**
 * MarketProvider — the abstraction the rest of CEPID reasons over.
 *
 * Three implementations:
 *  - LimitlessMarketProvider   (Base mainnet; production)
 *  - BaseSepoliaTestMarketProvider  (Base Sepolia; reproducible demo)
 *  - MockMarketProvider        (in-memory; tests only)
 *
 * The agent does not know which provider is active.
 */
import type { Asset, Direction, MarketSnapshot, OrderBook, Outcome, ResolutionResult, Timeframe, TradeIntent } from '../config/types.js';

export interface PlaceOrderResult {
  /** Whether the order was placed successfully. */
  ok: boolean;
  /** Provider-side order id. */
  orderId?: string;
  /** Filled price when known. */
  filledPrice?: number;
  /** Filled shares when known. */
  filledShares?: number;
  /** Transaction hash on-chain when broadcast. */
  txHash?: string;
  /** Human-readable error if !ok. */
  error?: string;
}

export interface PositionInfo {
  marketId: string;
  yesShares: number;
  noShares: number;
  /** USDC committed to the position. */
  collateralUsdc: number;
}

export interface TradeRecord {
  id: string;
  marketId: string;
  direction: Direction;
  price: number;
  shares: number;
  txHash?: string;
  executedAt: string;
}

export interface MarketProvider {
  /** Identifier used in logs and persistence. */
  readonly name: string;
  /** Network identifier this provider talks to. */
  readonly network: string;

  /** Return active markets matching the given filter (or all if empty). */
  listActiveMarkets(filter?: {
    assets?: Asset[];
    timeframes?: Timeframe[];
  }): Promise<MarketSnapshot[]>;

  /** Fetch a single market snapshot. Returns null if not found. */
  getMarket(marketId: string): Promise<MarketSnapshot | null>;

  /** Fetch the orderbook for a market. */
  getOrderBook(marketId: string): Promise<OrderBook | null>;

  /** Current position in a market. */
  getPosition(marketId: string): Promise<PositionInfo | null>;

  /** Historical trade fills for this agent's wallet on a market. */
  getTradeHistory(marketId: string): Promise<TradeRecord[]>;

  /** Resolution status, if the market has settled. */
  getResolution(marketId: string): Promise<ResolutionResult | null>;

  /**
   * Build, sign, and submit a trade. The provider owns the keys and the chain.
   * Returns the outcome without throwing.
   */
  placeOrder(intent: TradeIntent): Promise<PlaceOrderResult>;
}
