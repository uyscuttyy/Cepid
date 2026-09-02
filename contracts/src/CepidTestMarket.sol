// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CepidTestMarket
 * @notice Minimal binary YES/NO market for the CEPID Sibyl demo on Base Sepolia.
 *
 * Design:
 *  - One market per contract. Asset + timeframe are fixed at deploy time.
 *  - Anyone can buy YES or NO conditional tokens by depositing USDC.
 *  - Prices follow a constant-product AMM with a virtual reserve.
 *  - The deployer (resolver) sets the outcome after expiry.
 *  - Winners redeem conditional tokens for USDC after resolution.
 *
 * NOT a Limitless clone. NOT a production market. Built specifically so the
 * CEPID agent can perform real on-chain interactions with real testnet USDC
 * on Base Sepolia, since Limitless has no testnet deployment.
 */
contract CepidTestMarket is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    string public asset;
    string public timeframe;
    uint256 public expiresAt;
    uint256 public minShares;

    // Virtual reserves for the constant-product AMM. Seeded at deploy.
    uint256 public virtualYesReserve;
    uint256 public virtualNoReserve;

    // Outstanding conditional token supplies
    uint256 public yesSupply;
    uint256 public noSupply;

    // Conditional token balances (per-holder)
    mapping(address => uint256) public yesBalanceOf;
    mapping(address => uint256) public noBalanceOf;

    // Resolution
    bool public resolved;
    bool public outcomeYes;

    // Accounting
    uint256 public totalVolume;

    event BoughtYES(address indexed buyer, uint256 shares, uint256 costUsdc);
    event BoughtNO(address indexed buyer, uint256 shares, uint256 costUsdc);
    event Resolved(bool outcomeYes);
    event Redeemed(address indexed redeemer, uint256 yesShares, uint256 noShares, uint256 usdcOut);

    error NotYetExpired();
    error AlreadyResolved();
    error NotResolved();
    error ZeroAmount();
    error InsufficientPayment();
    error BelowMinimum();

    constructor(
        address _usdc,
        string memory _asset,
        string memory _timeframe,
        uint256 _durationSeconds,
        uint256 _minShares,
        address _resolver
    ) Ownable(_resolver) {
        usdc = IERC20(_usdc);
        asset = _asset;
        timeframe = _timeframe;
        expiresAt = block.timestamp + _durationSeconds;
        minShares = _minShares;
        // Seed reserves so YES and NO both price near 0.5 at deployment.
        virtualYesReserve = 1000e6;
        virtualNoReserve = 1000e6;
    }

    function yesPrice() public view returns (uint256) {
        return _price(virtualYesReserve, virtualNoReserve);
    }

    function noPrice() public view returns (uint256) {
        return _price(virtualNoReserve, virtualYesReserve);
    }

    function _price(uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256) {
        // price = reserveOut / (reserveIn + reserveOut), 6 decimals
        return (reserveOut * 1e6) / (reserveIn + reserveOut);
    }

    function buyYes(uint256 shares) external returns (uint256 costUsdc) {
        if (resolved) revert AlreadyResolved();
        if (block.timestamp >= expiresAt) revert NotYetExpired();
        if (shares < minShares) revert BelowMinimum();
        costUsdc = _quoteYes(shares);
        usdc.safeTransferFrom(msg.sender, address(this), costUsdc);
        virtualYesReserve += costUsdc;
        virtualNoReserve -= shares;
        yesSupply += shares;
        yesBalanceOf[msg.sender] += shares;
        totalVolume += costUsdc;
        emit BoughtYES(msg.sender, shares, costUsdc);
    }

    function buyNo(uint256 shares) external returns (uint256 costUsdc) {
        if (resolved) revert AlreadyResolved();
        if (block.timestamp >= expiresAt) revert NotYetExpired();
        if (shares < minShares) revert BelowMinimum();
        costUsdc = _quoteNo(shares);
        usdc.safeTransferFrom(msg.sender, address(this), costUsdc);
        virtualNoReserve += costUsdc;
        virtualYesReserve -= shares;
        noSupply += shares;
        noBalanceOf[msg.sender] += shares;
        totalVolume += costUsdc;
        emit BoughtNO(msg.sender, shares, costUsdc);
    }

    function _quoteYes(uint256 shares) internal view returns (uint256) {
        // integral of constant-product curve, in USDC 6 decimals
        uint256 k = virtualYesReserve * virtualNoReserve;
        uint256 newNoReserve = virtualNoReserve - shares;
        return ((virtualYesReserve * 1e6) / newNoReserve) - ((k * 1e6) / (newNoReserve * newNoReserve));
        // simplified approximation: cost ≈ shares * (2 * yesPrice + spread)
    }

    function _quoteNo(uint256 shares) internal view returns (uint256) {
        uint256 k = virtualYesReserve * virtualNoReserve;
        uint256 newYesReserve = virtualYesReserve - shares;
        return ((virtualNoReserve * 1e6) / newYesReserve) - ((k * 1e6) / (newYesReserve * newYesReserve));
    }

    function resolve(bool _outcomeYes) external onlyOwner {
        if (resolved) revert AlreadyResolved();
        if (block.timestamp < expiresAt) revert NotYetExpired(); // require expiry first
        resolved = true;
        outcomeYes = _outcomeYes;
        emit Resolved(_outcomeYes);
    }

    function redeem() external {
        if (!resolved) revert NotResolved();
        uint256 y = yesBalanceOf[msg.sender];
        uint256 n = noBalanceOf[msg.sender];
        if (y == 0 && n == 0) revert ZeroAmount();
        yesBalanceOf[msg.sender] = 0;
        noBalanceOf[msg.sender] = 0;
        uint256 payout = outcomeYes ? y : n; // 1 USDC per winning share
        usdc.safeTransfer(msg.sender, payout);
        emit Redeemed(msg.sender, y, n, payout);
    }

    /// @notice Test helper: allow the deployer to fund the market with USDC so redemptions can pay out.
    function fund(uint256 amount) external onlyOwner {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }
}
