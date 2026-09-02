/**
 * @cepid/client — implemented in Phase 4 alongside the HTTP API v1.
 *
 * Planned surface (architecture.md §10):
 *   cepid.retrieve({ situation })          → ranked memories + retrievalId
 *   cepid.recordDecision({ retrievalId, reasoning, action, confidences })
 *   cepid.recordOutcome({ decisionId, result, metrics, evidence })
 *
 * The x402 buyer loop (402 → sign → retry) ships inside retrieve() so paid
 * memory works for any agent without extra code. Nothing is stubbed here
 * before it is real.
 */
export {};
