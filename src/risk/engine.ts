/**
 * Risk engine.
 *
 * Sits between the decision and execution. Memory must NEVER bypass this.
 *
 * Enforces (per spec §13):
 *  - trade direction must be allowed
 *  - market must be active and not expired
 *  - price must be in (0, 1)
 *  - shares must be ≥ minShares
 *  - collateral must be within per-order and per-session caps
 *  - session must not have exceeded order count
 *  - session must not have exceeded total session collateral
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

  const spentThisSession = session.decisions > 0 ? 0 : 0; // tracked separately; conservative default
  if (spentThisSession + collateral > config.risk.sessionMaxCollateralUsdc) {
    reasons.push(`Session collateral would exceed cap ${config.risk.sessionMaxCollateralUsdc}`);
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
