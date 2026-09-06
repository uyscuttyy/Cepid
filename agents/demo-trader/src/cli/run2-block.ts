#!/usr/bin/env node
/**
 * RUN 2 — memory changes behavior (demo gate proof, block leg).
 *
 * MUST run as a new process, after run1-trade + market resolution +
 * run1-settle. Same agent identity (CEPID_API_KEY from env), same market
 * conditions. Expected: CEPID retrieves Run 1's loss, the constraint gate
 * returns DENY, the agent records NO_TRADE and submits NO transaction.
 *
 * Prints a JSON manifest. Exit code 0 only when the gate denied AND no
 * txHash exists — any other outcome is a demo failure.
 *
 * Env: CEPID_API_URL, CEPID_API_KEY, CEPID_NETWORK=base-sepolia,
 *      CEPID_TEST_MARKET_ADDRESS, DEMO_AGENT_PRIVATE_KEY (loaded but
 *      must remain unused on the DENY path).
 */
import { runOnce } from '../app.js';

async function main() {
  const r = await runOnce({ execute: true, confirmApproval: true, confirmOrder: true });
  const manifest = {
    run: 2,
    state: r.state,
    gateVerdict: r.gateVerdict,
    gateReason: r.gateReason,
    gateBlockingMemoryIds: r.gateBlockingMemoryIds,
    intent: r.intent.direction,
    txHash: r.execution.txHash ?? null,
    retrievedCount: r.retrieved.length,
    retrievedIds: r.retrieved.map((m) => m.id),
    retrievalId: r.retrievalId,
    memoryId: r.memoryId,
  };
  console.log(JSON.stringify(manifest, null, 2));

  if (r.gateVerdict !== 'DENY') {
    console.error('DEMO FAILURE: expected gate DENY, got ' + r.gateVerdict);
    process.exit(2);
  }
  if (r.execution.txHash) {
    console.error('DEMO FAILURE: a transaction was submitted on a DENY path');
    process.exit(3);
  }
  if (r.intent.direction !== 'NO_TRADE') {
    console.error('DEMO FAILURE: expected NO_TRADE intent');
    process.exit(4);
  }
  console.error('DEMO OK: DENY obeyed, no transaction submitted');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
