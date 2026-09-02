# contracts — CepidTestMarket on Base Sepolia

A deliberately minimal binary YES/NO market built so the CEPID demo agent has
a **real on-chain environment**: real testnet USDC, real transactions, real
resolution — because Limitless Exchange (the production venue) has no testnet.

Not a Limitless clone. Not audited. Demo-only by design.

## Layout

- `src/CepidTestMarket.sol` — the market (constant-product AMM pricing, YES/NO
  conditional tokens, USDC-collateralized, owner-resolved).
- `script/Deploy.s.sol` — parameterized deployment script.

## Deploy (Base Sepolia, chainId 84532)

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install foundry-rs/forge-std --no-commit

export DEPLOY_USDC=0x036CbD53842c5426634e7929541eC2318f3dCF7e   # Base Sepolia USDC
export DEPLOY_ASSET=ETH
export DEPLOY_TIMEFRAME=10M
export DEPLOY_DURATION=600        # ~10 minutes (demo resolves inside one session)
export DEPLOY_MIN_SHARES=1
export DEPLOY_RESOLVER=0x…        # the demo runner wallet (calls resolve() after expiry)
export DEPLOYER_KEY=0x…           # funded throwaway deployer key
export CEPID_RPC_URL_BASE_SEPOLIA=https://sepolia.base.org

forge script script/Deploy.s.sol --rpc-url base-sepolia \
  --broadcast --private-key $DEPLOYER_KEY
```

The deploy output prints the market address → set it as
`CEPID_TEST_MARKET_ADDRESS` in the demo agent's environment.

After deploying, fund the market so redemptions can pay out:

```bash
cast send $CEPID_TEST_MARKET_ADDRESS "fund(uint256)" 1000000000 \
  --rpc-url base-sepolia --private-key $DEPLOYER_KEY   # 1,000 USDC (6dp)
```
(`fund()` requires the deployer to have approved the market for USDC first:
`cast send $USDC "approve(address,uint256)" $MARKET 1000000000 …`)

## Resolution

The market resolves via the **resolver** (set at deploy, typically the demo
runner) calling `resolve(bool outcomeYes)` once `expiresAt` has passed. The
demo driver resolves the market after expiry, reads the outcome on-chain, and
reports it to CEPID — that on-chain fact is what the memory stores.
