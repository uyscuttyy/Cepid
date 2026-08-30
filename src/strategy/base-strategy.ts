/**
 * Deterministic base strategy.
 *
 * Produces a TradeIntent from a market snapshot without any memory or LLM
 * involvement. The decision engine layers memory influence on top of this.
 *
 * Rule (V1):
 *  - If midpoint is clearly above 0.5, the market undervalues YES → BUY YES.
 *  - If midpoint is clearly below 0.5, the market overvalues YES → BUY NO.
 *  - If the book is one-sided or illiquid, NO_TRADE.
 *  - Confidence scales with distance from 0.5.
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
    // Map distance to confidence so 0.05 distance → ~0.55 (above the 0.5 no-trade threshold)
    // and 0.5 distance → 0.95. This makes the base strategy produce actionable
    // confidence whenever it has any meaningful edge.
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
