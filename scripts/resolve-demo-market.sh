#!/usr/bin/env bash
# resolve-demo-market.sh — resolve a demo market after expiry and redeem.
#
# Usage: scripts/resolve-demo-market.sh [outcome]   # outcome: yes|no
#
# The resolver (demo agent wallet) sets the market outcome once expired;
# winners redeem USDC. The on-chain resolution is the fact CEPID's outcome
# records cite as marketOutcome — never the other way around.
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root
set -a; source .env; set +a

OUTCOME="${1:-yes}"
: "${CEPID_TEST_MARKET_ADDRESS:?CEPID_TEST_MARKET_ADDRESS required in .env}"
RPC="${CEPID_RPC_URL_BASE_SEPOLIA:-https://sepolia.base.org}"

EXPIRY=$(cast call "$CEPID_TEST_MARKET_ADDRESS" "expiresAt()(uint256)" --rpc-url "$RPC" | cast to-dec)
NOW=$(cast block timestamp --rpc-url "$RPC")
if [ "$NOW" -lt "$EXPIRY" ]; then
  echo "[resolve] market not expired yet ($((EXPIRY - NOW))s remaining)"; exit 1
fi

if [ "$OUTCOME" = "yes" ]; then BOOL=true; else BOOL=false; fi
echo "[resolve] resolving outcomeYes=$BOOL …"
cast send "$CEPID_TEST_MARKET_ADDRESS" "resolve(bool)" "$BOOL" \
  --rpc-url "$RPC" --private-key "$DEMO_AGENT_PRIVATE_KEY" >/dev/null

echo "[resolve] redeeming winning shares…"
cast send "$CEPID_TEST_MARKET_ADDRESS" "redeem()" \
  --rpc-url "$RPC" --private-key "$DEMO_AGENT_PRIVATE_KEY" >/dev/null

echo "✓ resolved ($OUTCOME won) and redeemed."
