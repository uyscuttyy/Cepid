# CEPID — Product Requirements (v3 — real protocol, NOT a demo)

Purpose: AI-agent financial execution gate on Base testnet.
Agent proposes action → CEPID retrieves Sibyl memories → ALLOW (real Base tx, real txHash, outcome → Sibyl) / DENY (zero tx, zero false success) → future decisions affected by memory.
Built-in agent is a SEPARATE CLIENT using the public CEPID API/SDK — not embedded in core. External agents must use the same interface. No hardcoded sequences. No fake memories/txHashes. Memory must be load-bearing.
