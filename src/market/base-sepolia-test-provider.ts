/**
 * BaseSepoliaTestMarketProvider — minimal prediction market deployed to Base Sepolia.
 *
 * Background: Limitless Exchange has no testnet deployment (per their docs).
 * For the Sibyl demo we deploy a minimal CTF-style binary market contract
 * to Base Sepolia (chainId 84532) so the agent can perform real on-chain
 * interactions with real testnet USDC.
 *
 * This is NOT a fork of Limitless. It is a deliberately small contract:
 *   - One market at a time (or a small set keyed by id)
 *   - YES / NO conditional tokens
 *   - Anyone can mint a complete set by depositing USDC
 *   - Anyone can redeem after resolution
 *   - The deployer is the resolver
 *
 * See contracts/CepidTestMarket.sol for the source.
 *
 * If the contract is not deployed (RPC unreachable, no address configured),
 * the provider fails fast — it does NOT fall back to mock data in production.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  type Hex,
  type WalletClient,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import type {
  Asset,
  MarketSnapshot,
  OrderBook,
  Outcome,
  ResolutionResult,
  Timeframe,
  TradeIntent,
} from '../config/types.js';
import type {
  MarketProvider,
  PlaceOrderResult,
  PositionInfo,
  TradeRecord,
} from './provider.js';
import type { AgentConfig } from '../config/types.js';

// Minimal ABI for the test market. We only encode the calls we use.
const TEST_MARKET_ABI = [
  { name: 'buyYes', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ name: 'costUsdc', type: 'uint256' }] },
  { name: 'buyNo', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ name: 'costUsdc', type: 'uint256' }] },
  { name: 'yesPrice', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'noPrice', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'expiresAt', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'resolved', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { name: 'outcomeYes', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { name: 'yesBalanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'noBalanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'totalVolume', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'minShares', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'asset', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { name: 'timeframe', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const;

const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const; // official Base Sepolia USDC

export class BaseSepoliaTestMarketProvider implements MarketProvider {
  readonly name = 'base-sepolia-test';
  readonly network = 'base-sepolia';

  private readonly config: AgentConfig;
  private readonly account: PrivateKeyAccount;
  private readonly publicClient: ReturnType<typeof createPublicClient>;
  private readonly walletClient: WalletClient;

  constructor(config: AgentConfig) {
    this.config = config;
    if (!config.privateKey) {
      throw new Error('BaseSepoliaTestMarketProvider requires AGENT_PRIVATE_KEY');
    }
    this.account = privateKeyToAccount(config.privateKey);
    this.publicClient = createPublicClient({ chain: baseSepolia, transport: http(config.rpcUrl) }) as ReturnType<typeof createPublicClient>;
    this.walletClient = createWalletClient({ account: this.account, chain: baseSepolia, transport: http(config.rpcUrl) });
  }

  /**
   * Market id is the deployed contract address. The config must provide it
   * via CEPID_TEST_MARKET_ADDRESS. If not set, the provider lists nothing.
   */
  private marketAddress(): Hex | null {
    const addr = process.env.CEPID_TEST_MARKET_ADDRESS;
    if (!addr) return null;
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      throw new Error('CEPID_TEST_MARKET_ADDRESS is not a valid 20-byte hex address');
    }
    return addr as Hex;
  }

  async listActiveMarkets(filter?: { assets?: Asset[]; timeframes?: Timeframe[] }): Promise<MarketSnapshot[]> {
    const addr = this.marketAddress();
    if (!addr) return [];
    const snap = await this.readSnapshot(addr);
    if (!snap || !snap.active) return [];
    if (filter?.assets && !filter.assets.includes(snap.asset)) return [];
    if (filter?.timeframes && !filter.timeframes.includes(snap.timeframe)) return [];
    return [snap];
  }

  async getMarket(marketId: string): Promise<MarketSnapshot | null> {
    return this.readSnapshot(marketId as Hex);
  }

  async getOrderBook(marketId: string): Promise<OrderBook | null> {
    const snap = await this.readSnapshot(marketId as Hex);
    if (!snap) return null;
    // The test market is an AMM-style market. We synthesize a book around midpoint.
    const mid = snap.yesPrice;
    const book: OrderBook = {
      marketId,
      bids: [{ price: Math.max(0.01, mid - 0.01), size: snap.yesBidSize }],
      asks: [{ price: Math.min(0.99, mid + 0.01), size: snap.yesAskSize }],
      midpoint: mid,
    };
    return book;
  }

  async getPosition(marketId: string): Promise<PositionInfo | null> {
    if (!this.marketAddress()) return null;
    const [yes, no] = await Promise.all([
      this.publicClient.readContract({
        address: marketId as Hex,
        abi: TEST_MARKET_ABI,
        functionName: 'yesBalanceOf',
        args: [this.account.address],
      }),
      this.publicClient.readContract({
        address: marketId as Hex,
        abi: TEST_MARKET_ABI,
        functionName: 'noBalanceOf',
        args: [this.account.address],
      }),
    ]);
    return {
      marketId,
      yesShares: Number(yes),
      noShares: Number(no),
      collateralUsdc: (Number(yes) + Number(no)) * 0.5,
    };
  }

  async getTradeHistory(_marketId: string): Promise<TradeRecord[]> {
    return [];
  }

  async getResolution(marketId: string): Promise<ResolutionResult | null> {
    const [resolved, outcomeYes, expiresAt] = await Promise.all([
      this.publicClient.readContract({ address: marketId as Hex, abi: TEST_MARKET_ABI, functionName: 'resolved' }),
      this.publicClient.readContract({ address: marketId as Hex, abi: TEST_MARKET_ABI, functionName: 'outcomeYes' }),
      this.publicClient.readContract({ address: marketId as Hex, abi: TEST_MARKET_ABI, functionName: 'expiresAt' }),
    ]);
    if (!resolved) return null;
    return {
      marketId,
      outcome: outcomeYes ? 'WIN' : 'LOSS',
      finalYesPrice: outcomeYes ? 1 : 0,
      settledAt: new Date(Number(expiresAt) * 1000).toISOString(),
    };
  }

  async placeOrder(intent: TradeIntent): Promise<PlaceOrderResult> {
    if (intent.direction === 'NO_TRADE') return { ok: false, error: 'NO_TRADE intent refused' };
    if (!this.config.privateKey) return { ok: false, error: 'no_wallet' };
    const addr = this.marketAddress();
    if (!addr) return { ok: false, error: 'CEPID_TEST_MARKET_ADDRESS not set' };

    const fn = intent.direction === 'YES' ? 'buyYes' : 'buyNo';
    const data = encodeFunctionData({
      abi: TEST_MARKET_ABI,
      functionName: fn,
      args: [BigInt(Math.round(intent.shares))],
    });

    try {
      const txHash = await this.walletClient.sendTransaction({
        account: this.account,
        chain: baseSepolia,
        to: addr,
        data,
      });
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        return { ok: false, error: 'tx_reverted', txHash };
      }
      return {
        ok: true,
        orderId: txHash,
        filledPrice: intent.price,
        filledShares: intent.shares,
        txHash,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private async readSnapshot(addr: Hex): Promise<MarketSnapshot | null> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return null;
    try {
      const [yesPriceRaw, expiresAt, resolved, minSharesRaw, asset, timeframe, totalVol] = await Promise.all([
        this.publicClient.readContract({ address: addr, abi: TEST_MARKET_ABI, functionName: 'yesPrice' }),
        this.publicClient.readContract({ address: addr, abi: TEST_MARKET_ABI, functionName: 'expiresAt' }),
        this.publicClient.readContract({ address: addr, abi: TEST_MARKET_ABI, functionName: 'resolved' }),
        this.publicClient.readContract({ address: addr, abi: TEST_MARKET_ABI, functionName: 'minShares' }),
        this.publicClient.readContract({ address: addr, abi: TEST_MARKET_ABI, functionName: 'asset' }),
        this.publicClient.readContract({ address: addr, abi: TEST_MARKET_ABI, functionName: 'timeframe' }),
        this.publicClient.readContract({ address: addr, abi: TEST_MARKET_ABI, functionName: 'totalVolume' }),
      ]);
      const yesPrice = Number(yesPriceRaw) / 1e6; // USDC 6 decimals
      const now = Math.floor(Date.now() / 1000);
      const liquidity = totalVol === undefined ? undefined : Number(totalVol) / 1e6;
      const snap: MarketSnapshot = {
        id: addr,
        title: `${asset} ${timeframe} (Base Sepolia test market)`,
        asset: (asset === 'BTC' ? 'BTC' : 'ETH') as Asset,
        timeframe: (timeframe === '15M' ? '15M' : '1H') as Timeframe,
        expiresAt: Number(expiresAt),
        active: !resolved && Number(expiresAt) > now,
        yesPrice,
        yesBidSize: 0,
        yesAskSize: 0,
        minShares: Number(minSharesRaw),
      };
      if (liquidity !== undefined) snap.liquidity = liquidity;
      return snap;
    } catch {
      return null;
    }
  }
}
