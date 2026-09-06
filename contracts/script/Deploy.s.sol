// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {CepidTestMarket} from "../src/CepidTestMarket.sol";

/**
 * @dev Deploy CepidTestMarket to Base Sepolia (chainId 84532).
 *
 * Env (all required):
 *   DEPLOY_USDC        — collateral token; Base Sepolia USDC is
 *                        0x036CbD53842c5426634e7929541eC2318f3dCF7e
 *   DEPLOY_ASSET       — market label, e.g. "ETH"
 *   DEPLOY_TIMEFRAME   — market label, e.g. "10M"
 *   DEPLOY_DURATION    — seconds until expiry (demo: 600)
 *   DEPLOY_MIN_SHARES  — minimum order size in shares (demo: 1)
 *   DEPLOY_RESOLVER    — address allowed to call resolve() after expiry
 *                        (the demo runner wallet)
 *   DEPLOYER_KEY       — funded throwaway deployer key (env only)
 *   DEPLOY_RESERVE     — virtual AMM reserve per side, 6dp (default
 *                        1000000000 = 1000 USDC deep; demo: 20000000)
 *
 * Usage:
 *   forge script script/Deploy.s.sol --rpc-url base-sepolia \
 *     --broadcast --private-key $DEPLOYER_KEY
 *
 * After deployment: fund() with testnet USDC from the deployer so redemptions
 * can pay out.
 */
contract DeployMarket is Script {
    function run() external returns (CepidTestMarket market) {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        address usdc = vm.envAddress("DEPLOY_USDC");
        string memory asset = vm.envString("DEPLOY_ASSET");
        string memory timeframe = vm.envString("DEPLOY_TIMEFRAME");
        uint256 duration = vm.envUint("DEPLOY_DURATION");
        uint256 minShares = vm.envUint("DEPLOY_MIN_SHARES");
        address resolver = vm.envAddress("DEPLOY_RESOLVER");
        uint256 virtualReserve = vm.envOr("DEPLOY_RESERVE", uint256(1000e6));

        vm.startBroadcast(deployerKey);
        market = new CepidTestMarket(
            usdc,
            asset,
            timeframe,
            duration,
            minShares,
            resolver,
            virtualReserve
        );
        vm.stopBroadcast();

        console.log("CepidTestMarket deployed:", address(market));
        console.log("expiresAt:", market.expiresAt());
    }
}
