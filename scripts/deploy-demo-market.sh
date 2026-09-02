#!/usr/bin/env bash
# deploy-demo-market.sh — one command to a fresh on-chain demo market.
#
# Prereqs (see contracts/README.md):
#   - .env with DEMO_AGENT_PRIVATE_KEY (funded with Base Sepolia ETH + USDC)
#   - CEPID_RPC_URL_BASE_SEPOLIA
#
# Deploys a ~10-minute ETH market (D5), approves + funds it with USDC so
# redemptions can pay out, and prints CEPID_TEST_MARKET_ADDRESS.
# The DEMO_AGENT wallet is the resolver (it calls resolve() after expiry).
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root
set -a; source .env; set +a

: "${DEMO_AGENT_PRIVATE_KEY:?DEMO_AGENT_PRIVATE_KEY required in .env}"
RPC="${CEPID_RPC_URL_BASE_SEPOLIA:-https://sepolia.base.org}"
USDC="${DEMO_USDC:-0x036CbD53842c5426634e7929541eC2318f3dCF7e}"
DURATION="${DEMO_MARKET_DURATION:-600}"        # 10 minutes (D5)
MIN_SHARES="${DEMO_MIN_SHARES:-1}"
FUND_AMOUNT="${DEMO_MARKET_FUND_USDC:-500000000}"  # 500 USDC (6dp)

RESOLVER=$(cast wallet-address "$DEMO_AGENT_PRIVATE_KEY")
echo "[deploy] resolver (demo agent): $RESOLVER"
echo "[deploy] duration: ${DURATION}s, min shares: $MIN_SHARES"

BALANCE=$(cast balance "$RESOLVER" --rpc-url "$RPC" 2>/dev/null || echo 0)
echo "[deploy] resolver ETH balance: $BALANCE"
if [ "$(echo "$BALANCE == 0" | bc 2>/dev/null || echo 1)" = "1" ]; then
  echo "[deploy] WARNING: zero balance — fund the wallet from a Base Sepolia faucet first."
fi

export DEPLOY_USDC="$USDC"
export DEPLOY_ASSET=ETH
export DEPLOY_TIMEFRAME=10M
export DEPLOY_DURATION="$DURATION"
export DEPLOY_MIN_SHARES="$MIN_SHARES"
export DEPLOY_RESOLVER="$RESOLVER"

cd contracts
forge script script/Deploy.s.sol --rpc-url "$RPC" \
  --broadcast --private-key "$DEMO_AGENT_PRIVATE_KEY" \
  | tee /tmp/deploy-output.txt

# Extract the deployed address from the run output.
MARKET=$(grep -oP 'CepidTestMarket deployed: \K0x[0-9a-fA-F]{40}' /tmp/deploy-output.txt | head -1)
if [ -z "$MARKET" ]; then
  echo "[deploy] could not parse market address from output"; exit 1
fi
echo "[deploy] market: $MARKET"

cd ..
# Approve the market to spend the resolver's USDC, then fund it.
echo "[fund] approving USDC to market…"
cast send "$USDC" "approve(address,uint256)" "$MARKET" "$FUND_AMOUNT" \
  --rpc-url "$RPC" --private-key "$DEMO_AGENT_PRIVATE_KEY" >/dev/null

echo "[fund] funding market with $FUND_AMOUNT (6dp USDC)…"
cast send "$MARKET" "fund(uint256)" "$FUND_AMOUNT" \
  --rpc-url "$RPC" --private-key "$DEMO_AGENT_PRIVATE_KEY" >/dev/null

# Persist the address into .env (in place, key-by-key).
python3 - "$MARKET" <<'PYEOF'
import re, sys
market = sys.argv[1]
src = open('.env').read()
if 'CEPID_TEST_MARKET_ADDRESS=' in src:
    src = re.sub(r'CEPID_TEST_MARKET_ADDRESS=.*', f'CEPID_TEST_MARKET_ADDRESS={market}', src)
else:
    src += f'\nCEPID_TEST_MARKET_ADDRESS={market}\n'
open('.env', 'w').write(src)
PYEOF

EXPIRY=$(cast call "$MARKET" "expiresAt()(uint256)" --rpc-url "$RPC" | cast to-dec)
NOW=$(cast block timestamp --rpc-url "$RPC")
echo
echo "✓ Market live: $MARKET"
echo "  expires at:  $EXPIRY (in ~$((EXPIRY - NOW))s)"
echo "  .env updated: CEPID_TEST_MARKET_ADDRESS=$MARKET"
