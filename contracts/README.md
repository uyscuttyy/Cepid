# CepidTestMarket

Minimal binary YES/NO prediction market for the CEPID Sibyl demo on Base Sepolia.

## Why this exists

Limitless Exchange has no testnet deployment. To let CEPID perform real on-chain interactions with real testnet USDC on Base Sepolia, we deploy this minimal market contract.

## What it is

- One market per contract (asset + timeframe fixed at deploy)
- Constant-product AMM with virtual reserves
- YES / NO conditional token balances
- Deployer is the resolver
- Winners redeem conditional tokens for USDC after resolution

## What it is NOT

- Not a Limitless clone
- Not a production market
- Not audited (demo only)

## Deploy

```bash
# 1. Install Foundry
curl -L https://foundry.paradigm.xyz | bash

# 2. From the contracts/ directory
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge create \
  --rpc-url https://sepolia.base.org \
  --private-key $AGENT_PRIVATE_KEY \
  --constructor-args \
    0x036CbD53842c5426634e7929541eC2318f3dCF7e \
    BTC 15M 900 1 \
  contracts/CepidTestMarket.sol:CepidTestMarket
```

Then set `CEPID_TEST_MARKET_ADDRESS=<deployed address>` in `.env`.
