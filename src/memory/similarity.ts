/**
 * Market context similarity.
 *
 * Computes a normalized similarity in [0, 1] between two MarketContext objects.
 * Weights are tuned for the binary-options use case (15m/1h BTC/ETH).
 */
import type { MarketContext } from '../config/types.js';

const WEIGHTS = {
  asset: 0.15,
  timeframe: 0.1,
  yesPrice: 0.2,
  midpointDistance: 0.15,
  volatility: 0.1,
  momentum: 0.15,
  liquidity: 0.05,
  timeRemaining: 0.1,
};

export function similarity(a: MarketContext, b: MarketContext): number {
  let score = 0;
  if (a.asset === b.asset) score += WEIGHTS.asset;
  if (a.timeframe === b.timeframe) score += WEIGHTS.timeframe;

  // Continuous features: 1 - normalized distance
  score += WEIGHTS.yesPrice * (1 - Math.abs(a.yesPrice - b.yesPrice) / 0.5);
  score += WEIGHTS.midpointDistance * (1 - Math.abs(a.midpointDistance - b.midpointDistance) / 0.5);

  // Categorical features
  score += WEIGHTS.volatility * (a.volatility === b.volatility ? 1 : 0);
  score += WEIGHTS.momentum * (a.momentum === b.momentum ? 1 : 0);
  score += WEIGHTS.liquidity * (a.liquidity === b.liquidity ? 1 : 0);
  score += WEIGHTS.timeRemaining * (a.timeRemainingBucket === b.timeRemainingBucket ? 1 : 0);

  return Math.max(0, Math.min(1, score));
}

/** Euclidean-ish distance, used to bucket near-duplicate experiences. */
export function distance(a: MarketContext, b: MarketContext): number {
  return 1 - similarity(a, b);
}
