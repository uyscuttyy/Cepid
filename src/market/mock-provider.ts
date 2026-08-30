/**
 * MockMarketProvider — deterministic, in-memory, for unit tests only.
 *
 * Construct with a seeded scenario (markets + orderbooks + a clock).
 * Never reaches the network. Never exposed in production paths.
 */
import type {
  Direction,
  MarketSnapshot,
  OrderBook,
  OrderBookLevel,
  Outcome,
  Timeframe,
  TradeIntent,
  ResolutionResult,
} from '../config/types.js';
import type {
  MarketProvider,
  PlaceOrderResult,
  PositionInfo,
  TradeRecord,
} from './provider.js';

export interface MockMarketSeed {
  markets: Array<{
    snapshot: MarketSnapshot;
    book: { bids: OrderBookLevel[]; asks: OrderBookLevel[] };
  }>;
  /** Pre-resolved markets (for testing outcome paths). */
  resolutions?: Record<string, Outcome>;
}

export class MockMarketProvider implements MarketProvider {
  readonly name = 'mock';
  readonly network = 'mock';

  private readonly markets = new Map<string, MarketSnapshot>();
  private readonly books = new Map<string, OrderBook>();
  private readonly positions = new Map<string, PositionInfo>();
  private readonly trades: TradeRecord[] = [];
  private readonly resolutions = new Map<string, Outcome>();
  private orderCounter = 0;

  constructor(seed: MockMarketSeed) {
    for (const m of seed.markets) {
      this.markets.set(m.snapshot.id, m.snapshot);
      const mid = midpoint(m.book.bids, m.book.asks);
      this.books.set(m.snapshot.id, {
        marketId: m.snapshot.id,
        bids: m.book.bids,
        asks: m.book.asks,
        midpoint: mid,
      });
    }
    if (seed.resolutions) {
      for (const [id, outcome] of Object.entries(seed.resolutions)) {
        this.resolutions.set(id, outcome);
      }
    }
  }

  async listActiveMarkets(filter?: { assets?: string[]; timeframes?: Timeframe[] }): Promise<MarketSnapshot[]> {
    const all = Array.from(this.markets.values()).filter((m) => m.active);
    return all.filter((m) => {
      if (filter?.assets && !filter.assets.includes(m.asset)) return false;
      if (filter?.timeframes && !filter.timeframes.includes(m.timeframe)) return false;
      return true;
    });
  }

  async getMarket(marketId: string): Promise<MarketSnapshot | null> {
    return this.markets.get(marketId) ?? null;
  }

  async getOrderBook(marketId: string): Promise<OrderBook | null> {
    return this.books.get(marketId) ?? null;
  }

  async getPosition(marketId: string): Promise<PositionInfo | null> {
    return this.positions.get(marketId) ?? { marketId, yesShares: 0, noShares: 0, collateralUsdc: 0 };
  }

  async getTradeHistory(marketId: string): Promise<TradeRecord[]> {
    return this.trades.filter((t) => t.marketId === marketId);
  }

  async getResolution(marketId: string): Promise<ResolutionResult | null> {
    const outcome = this.resolutions.get(marketId);
    if (!outcome) return null;
    return {
      marketId,
      outcome,
      finalYesPrice: outcome === 'WIN' ? 1 : 0,
      settledAt: new Date().toISOString(),
    };
  }

  async placeOrder(intent: TradeIntent): Promise<PlaceOrderResult> {
    if (intent.direction === 'NO_TRADE') {
      return { ok: false, error: 'NO_TRADE intent refused' };
    }
    const snapshot = this.markets.get(intent.marketId);
    if (!snapshot) return { ok: false, error: 'market_not_found' };
    if (!snapshot.active) return { ok: false, error: 'market_inactive' };

    const orderId = `mock-${++this.orderCounter}`;
    const filledPrice = intent.price;
    const filledShares = intent.shares;
    const txHash = `0xmock${orderId.padStart(60, '0')}`;

    this.trades.push({
      id: orderId,
      marketId: intent.marketId,
      direction: intent.direction,
      price: filledPrice,
      shares: filledShares,
      txHash,
      executedAt: new Date().toISOString(),
    });

    const pos = this.positions.get(intent.marketId) ?? {
      marketId: intent.marketId,
      yesShares: 0,
      noShares: 0,
      collateralUsdc: 0,
    };
    if (intent.direction === 'YES') pos.yesShares += filledShares;
    else pos.noShares += filledShares;
    pos.collateralUsdc += filledShares * filledPrice;
    this.positions.set(intent.marketId, pos);

    return { ok: true, orderId, filledPrice, filledShares, txHash };
  }

  /** Test helper: resolve a market for outcome assertion. */
  resolveMarket(marketId: string, outcome: Outcome): void {
    this.resolutions.set(marketId, outcome);
    const m = this.markets.get(marketId);
    if (m) {
      this.markets.set(marketId, { ...m, active: false });
    }
  }
}

function midpoint(bids: OrderBookLevel[], asks: OrderBookLevel[]): number {
  const bestBid = bids[0]?.price ?? 0.5;
  const bestAsk = asks[0]?.price ?? 0.5;
  return (bestBid + bestAsk) / 2;
}
