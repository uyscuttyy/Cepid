/**
 * Deterministic base strategy — no memory, no LLM, pure midpoint rule.
 */
import type { Direction, MarketSnapshot, OrderBook, TradeIntent } from '../config/types.js';

export interface BaseStrategy {
  decide(market: MarketSnapshot, book: OrderBook | null): TradeIntent;
}

export class DeterministicStrategy implements BaseStrategy {
  constructor(private readonly minShares: number = 1) {}

  decide(market: MarketSnapshot, book: OrderBook | null): TradeIntent {
    const now = new Date().toISOString();
    if (!book || book.bids.length === 0 || book.asks.length === 0) {
      return noTrade(market, 'Order book is empty or unavailable', now);
    }
    if (!market.active) {
      return noTrade(market, 'Market is not active', now);
    }
    const mid = book.midpoint;
    const distance = Math.abs(mid - 0.5);
    if (distance < 0.02) {
      return noTrade(market, `Midpoint ${mid.toFixed(3)} is too close to 0.5 — no edge`, now);
    }
    const direction: Direction = mid >= 0.5 ? 'YES' : 'NO';
    const confidence = Math.min(0.95, 0.5 + distance);
    const price = direction === 'YES' ? (book.asks[0]?.price ?? mid) : (1 - (book.asks[0]?.price ?? (1 - mid)));
    return {
      marketId: market.id,
      direction,
      shares: Math.max(market.minShares, this.minShares),
      price,
      baseConfidence: confidence,
      reason: `Midpoint ${mid.toFixed(3)} → ${direction} with edge ${(distance * 100).toFixed(1)}%`,
      createdAt: now,
    };
  }
}

function noTrade(market: MarketSnapshot, reason: string, now: string): TradeIntent {
  return {
    marketId: market.id,
    direction: 'NO_TRADE',
    shares: 0,
    price: 0,
    baseConfidence: 0,
    reason,
    createdAt: now,
  };
}
