# Independent CLASH Test Agent

This is a separate agent project, not part of the CLASH repository. It owns its strategy, wallet, signer, risk policy, performance path, and DreamDEX execution. The first implementation discovers active BTC/ETH 15m/1h markets, runs a replaceable deterministic strategy, applies a non-AI risk layer, and defaults to preview-only.

```bash
npm install
cp .env.example .env
npm run preview
```

`AGENT_PRIVATE_KEY` stays local to this repository and is never sent to CLASH. The agent registers its public address, discovers live supported markets, produces a structured trade intent, evaluates it through risk policy, and builds an unsigned order preview. No transaction is broadcast by default. The `--execute` path is intentionally blocked until finite approval and explicit wallet confirmation are implemented.

`npm run preview` is read-only. It also simulates approval/order calls where possible. Writes require `--execute --confirm-approval`, and the order additionally requires `--confirm-order`; approval and order are separate transactions. Submission receipts and audit events are stored in `data/events.json`. No settlement or PnL is fabricated when the official indexer cannot verify it.

The core pipeline is:

```text
Market data -> Strategy -> Trade intent -> Risk policy -> Unsigned DreamDEX order
```

CLASH is optional. The agent can discover markets and produce its own order preview without CLASH; CLASH registration is only an integration side effect.
