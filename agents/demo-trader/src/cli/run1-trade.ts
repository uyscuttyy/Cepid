#!/usr/bin/env node
/**
 * RUN 1 — learn from failure (demo gate proof, trade leg).
 *
 * New process. Same agent identity (CEPID_API_KEY from env). Base Sepolia
 * market (CEPID_TEST_MARKET_ADDRESS from env). Executes up to TRADES trades
 * against the live CepidTestMarket and prints a JSON manifest per trade:
 * decision id, memory id, retrieval id, gate verdict, txHash.
 *
 * Expected on a fresh agent: gate ALLOW (no relevant memory) → trade
 * executes on-chain with a real txHash. The market must later be resolved
 * against the trade (scripts/resolve-demo-market.sh) and outcomes recorded
 * (run1-settle) so the loss becomes memory Run 2 can retrieve.
 *
 * Env: CEPID_API_URL, CEPID_API_KEY, CEPID_NETWORK=base-sepolia,
 *      CEPID_TEST_MARKET_ADDRESS, DEMO_AGENT_PRIVATE_KEY.
 */
import { runOnce } from '../app.js';

const TRADES = Math.max(1, Number(process.env.DEMO_RUN1_TRADES ?? 3));

async function main() {
  const legs: Array<Record<string, unknown>> = [];
  for (let i = 0; i < TRADES; i++) {
    const r = await runOnce({ execute: true, confirmApproval: true, confirmOrder: true });
    legs.push({
      leg: i + 1,
      state: r.state,
      gateVerdict: r.gateVerdict,
      gateReason: r.gateReason,
      intent: r.intent.direction,
      txHash: r.execution.txHash ?? null,
      decisionReasoning: r.decisionContext.reasoning.slice(0, 3),
      retrievalId: r.retrievalId,
      memoryId: r.memoryId,
    });
    // If the gate ever fires mid-run-1, stop: something is already
    // blocking, and further trades would not be fresh-memory trades.
    if (r.gateVerdict === 'DENY') break;
    if (!r.execution.txHash) break;
  }
  console.log(JSON.stringify({ run: 1, legs }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
