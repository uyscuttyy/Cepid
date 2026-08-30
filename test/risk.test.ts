/**
 * Risk engine: enforces per-order, per-session, and market validity.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRisk } from '../src/risk/engine.js';
import type { AgentConfig, AgentSession, MarketSnapshot, TradeIntent } from '../src/config/types.js';

const config: AgentConfig = {
  network: 'mock',
  privateKey: null,
  rpcUrl: '',
  dataDir: '',
  risk: { maxCollateralUsdc: 0.5, sessionMaxCollateralUsdc: 1, sessionMaxOrders: 3, maxSlippageBps: 200 },
};

const session: AgentSession = {
  id: 's', startedAt: '', marketsObserved: [], decisions: 0, trades: 0, memoryIds: [], network: 'mock',
};

const market: MarketSnapshot = {
  id: 'm', title: 'm', asset: 'BTC', timeframe: '15M', expiresAt: Math.floor(Date.now() / 1000) + 600,
  active: true, yesPrice: 0.5, yesBidSize: 1, yesAskSize: 1, minShares: 1, liquidity: 100,
};

const intent = (overrides: Partial<TradeIntent> = {}): TradeIntent => ({
  marketId: 'm', direction: 'YES', shares: 1, price: 0.5, baseConfidence: 0.6, reason: '', createdAt: '',
  ...overrides,
});

test('risk: approves a normal trade', () => {
  const r = evaluateRisk(intent(), market, session, config);
  assert.equal(r.approved, true);
  assert.equal(r.collateral, 0.5);
});

test('risk: rejects over-cap collateral', () => {
  const r = evaluateRisk(intent({ shares: 5 }), market, session, config);
  assert.equal(r.approved, false);
  assert.ok(r.reasons.some((x) => x.includes('per-order cap')));
});

test('risk: rejects expired market', () => {
  const r = evaluateRisk(intent(), { ...market, expiresAt: Math.floor(Date.now() / 1000) - 1 }, session, config);
  assert.equal(r.approved, false);
  assert.ok(r.reasons.some((x) => x.includes('expired')));
});

test('risk: rejects NO_TRADE intent', () => {
  const r = evaluateRisk(intent({ direction: 'NO_TRADE' }), market, session, config);
  assert.equal(r.approved, false);
});

test('risk: respects session order limit', () => {
  const r = evaluateRisk(intent(), market, { ...session, trades: 3 }, config);
  assert.equal(r.approved, false);
  assert.ok(r.reasons.some((x) => x.includes('Session order limit')));
});
