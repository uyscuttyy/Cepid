/**
 * Risk engine — the agent's hard guardrails.
 *
 * Memory influence can lower confidence but NEVER bypasses these checks.
 * The per-session collateral cap is now actually enforced: collateral spent
 * accumulates on the session record (the old `spentThisSession ? 0 : 0`
 * placeholder is dead).
 */
import type {
  AgentConfig,
  AgentSession,
  MarketSnapshot,
  RiskDecision,
  TradeIntent,
} from '../config/types.js';

export function evaluateRisk(
  intent: TradeIntent,
  market: MarketSnapshot,
  session: AgentSession,
  config: AgentConfig,
): RiskDecision {
  const reasons: string[] = [];
  const collateral = intent.shares * intent.price;

  if (intent.direction === 'NO_TRADE') {
    reasons.push('Strategy returned NO_TRADE');
  }
  if (!market.active) reasons.push('Market is inactive');
  const now = Math.floor(Date.now() / 1000);
  if (market.expiresAt > 0 && market.expiresAt <= now) reasons.push('Market has expired');
  if (intent.price <= 0 || intent.price >= 1) reasons.push('Price outside (0, 1)');
  if (intent.shares < market.minShares) reasons.push(`Shares below minimum (${market.minShares})`);

  if (collateral > config.risk.maxCollateralUsdc) {
    reasons.push(`Collateral ${collateral.toFixed(4)} exceeds per-order cap ${config.risk.maxCollateralUsdc}`);
  }

  if (session.collateralSpent + collateral > config.risk.sessionMaxCollateralUsdc) {
    reasons.push(
      `Session collateral would exceed cap ${config.risk.sessionMaxCollateralUsdc} ` +
      `(already spent ${session.collateralSpent.toFixed(4)}, this order ${collateral.toFixed(4)})`,
    );
  }
  if (session.trades >= config.risk.sessionMaxOrders) {
    reasons.push(`Session order limit reached (${config.risk.sessionMaxOrders})`);
  }

  return {
    approved: reasons.length === 0,
    reasons,
    collateral,
    intent,
  };
}
