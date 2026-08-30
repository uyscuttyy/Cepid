/**
 * Market context derivation.
 *
 * Converts a MarketSnapshot + OrderBook into a normalized MarketContext
 * suitable for memory similarity matching.
 */
import type { MarketContext, MarketSnapshot, OrderBook } from '../config/types.js';

export function deriveContext(market: MarketSnapshot, book: OrderBook | null): MarketContext {
  const mid = book?.midpoint ?? market.yesPrice;
  const distance = Math.abs(mid - 0.5);
  return {
    asset: market.asset,
    timeframe: market.timeframe,
    yesPrice: mid,
    midpointDistance: distance,
    volatility: inferVolatility(mid, book),
    momentum: inferMomentum(mid, market),
    liquidity: inferLiquidity(market),
    timeRemainingBucket: inferTimeRemaining(market.expiresAt),
  };
}

function inferVolatility(mid: number, book: OrderBook | null): MarketContext['volatility'] {
  if (!book || book.bids.length === 0 || book.asks.length === 0) return 'high';
  const spread = (book.asks[0]?.price ?? mid) - (book.bids[0]?.price ?? mid);
  if (spread > 0.05) return 'high';
  if (spread > 0.02) return 'medium';
  return 'low';
}

function inferMomentum(mid: number, market: MarketSnapshot): MarketContext['momentum'] {
  // Heuristic: distance from 0.5 is interpreted as a directional lean
  if (mid >= 0.55) return 'up';
  if (mid <= 0.45) return 'down';
  return 'flat';
}

function inferLiquidity(market: MarketSnapshot): MarketContext['liquidity'] {
  if (market.liquidity === undefined) return 'medium';
  if (market.liquidity < 100) return 'low';
  if (market.liquidity < 1000) return 'medium';
  return 'high';
}

function inferTimeRemaining(expiresAt: number): MarketContext['timeRemainingBucket'] {
  const seconds = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
  if (seconds < 120) return '<2m';
  if (seconds < 300) return '2-5m';
  if (seconds < 600) return '5-10m';
  return '>10m';
}
