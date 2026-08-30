#!/usr/bin/env node
/**
 * CEPID CLI — runs a single agent iteration.
 *
 * Default = preview (no transactions broadcast). Pass --execute along with
 * both --confirm-approval and --confirm-order to actually broadcast.
 */
import { runOnce } from '../app.js';
import type { MockMarketSeed } from '../market/index.js';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const confirmApproval = args.includes('--confirm-approval');
const confirmOrder = args.includes('--confirm-order');
const useMock = args.includes('--mock');

async function main() {
  const opts: Parameters<typeof runOnce>[0] = { execute, confirmApproval, confirmOrder };
  if (useMock) {
    opts.mockSeed = defaultMockSeed();
  }
  const result = await runOnce(opts);
  console.log(JSON.stringify({
    state: result.state,
    session: result.session,
    market: {
      id: result.market.id,
      title: result.market.title,
      asset: result.market.asset,
      timeframe: result.market.timeframe,
      yesPrice: result.market.yesPrice,
      expiresAt: result.market.expiresAt,
    },
    conditions: result.conditions,
    intent: result.intent,
    risk: result.risk,
    decision: result.decisionContext,
    execution: result.execution,
    experienceId: result.experience?.id ?? null,
  }, null, 2));
}

function defaultMockSeed(): MockMarketSeed {
  return {
    markets: [
      {
        snapshot: {
          id: 'mock-btc-15m-1',
          title: 'BTC 15m mock',
          asset: 'BTC',
          timeframe: '15M',
          expiresAt: Math.floor(Date.now() / 1000) + 600,
          active: true,
          yesPrice: 0.6,
          yesBidSize: 10,
          yesAskSize: 10,
          minShares: 1,
          liquidity: 500,
        },
        book: {
          bids: [{ price: 0.59, size: 10 }],
          asks: [{ price: 0.61, size: 10 }],
        },
      },
    ],
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
