# CEPID — Implementation Plan (from CURRENT repo)

Objective: real protocol, separate built-in agent, load-bearing Sibyl memory, real Base testnet execution, hard DENY boundary, UI control plane, no demo.

Phase 1 (authorized): Start CEPID server (fix/add start mechanism); start/restart Sibyl (8765 via `.venv`); verify agent→Sibyl→ALLOW/DENY (NO Base tx yet). Reuse: `cepid/src/`, `sidecar/`, `.env`, `agents/demo-trader/` (separate client). No new APIs needed.
Phase 2 (authorized after Phase 1): Real Base execution — ALLOW → real tx → real txHash → outcome → Sibyl; DENY → zero tx. Use `.env` `CEPID_RPC_URL_BASE_SEPOLIA`, `CEPID_PAYMENT_WALLET_KEY` (redacted, never logged), `DEMO_AGENT_PRIVATE_KEY`. Verify via Base explorer link. No fake hashes.
Phase 3 (authorized after Phase 2): Memory load-bearing proof — restart services, confirm previous experience retrieved, confirm it affects decision, confirm external-agent path works via same public API/SDK (`sdk/`).
Phase 4: Clean runtime — one coherent application (UI controls server + sidecar startup, not manual terminal); remove any remaining demo-runner dependency; finalize docs.
No phase starts without authorization.
