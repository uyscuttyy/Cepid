# CEPID — Architecture (v3)

Core: CEPID protocol (API + Sibyl + Gate) — no agent embedded.
Built-in agent: separate module (`agents/demo-trader`), consumes same public API/SDK as external agents.
Sibyl Memory: real substrate (`sidecar/`, `.venv`, `sibyl-memory-client==0.8.0`).
Execution: real Base testnet tx on ALLOW; zero tx on DENY.
UI: control plane (port 3000, running); server needs startup mechanism (port 8797, not running; no `start` script). Memory must influence decisions (load-bearing). No demo-runner dependency. No scripted ALLOW/DENY.
Gaps: server start script; Sibyl dependency activation; live agent→memory→decision verification.
