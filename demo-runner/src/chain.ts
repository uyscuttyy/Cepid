/**
 * Chain adapter — the runner's only on-chain seam.
 *
 * ViemChainAdapter does real Base Sepolia transactions with the
 * maintainer's demo wallet. FakeChainAdapter is an in-memory market for
 * tests: same sequencing (deploy → fund → prime → buy → expire →
 * resolve), no network, controllable clock. The orchestration in
 * runner.ts is written against this interface so tests prove the
 * state machine without spending anything.
 */
import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  encodeFunctionData,
  http,
  type Address,
  type Hash,
  type Hex,
  type HttpTransport,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export const USDC_BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;

const MARKET_ABI = [
  { name: 'buyYes', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'buyNo', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { name: 'fund', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'resolve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'outcomeYes', type: 'bool' }], outputs: [] },
  { name: 'yesPrice', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'expiresAt', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'resolved', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

export interface MarketHandle {
  address: string;
  expiresAt: number;
}

export interface ChainAdapter {
  readonly address: string;
  usdcBalance(): Promise<bigint>;
  deployMarket(opts: { durationSeconds: number }): Promise<MarketHandle>;
  /** Approve + fund + prime (buyNo) so yesPrice ≈ 0.52. Returns prime txHash. */
  fundAndPrime(market: string, fundUsdc: bigint, primeNoShares: bigint): Promise<{ fundTx: Hash; primeTx: Hash }>;
  /** Extra buyNo top-up when the prime did not move the price far enough
   *  off 0.5 for the strategy's edge rule. Returns the txHash. */
  primeMore(market: string, noShares: bigint): Promise<Hash>;
  yesPrice(market: string): Promise<number>;
  buyYes(market: string, shares: bigint): Promise<Hash>;
  resolveNo(market: string): Promise<Hash>;
  /** Milliseconds until the market expires (≤0 when expired). */
  msUntilExpiry(market: string): Promise<number>;
}

export class ViemChainAdapter implements ChainAdapter {
  readonly address: string;
  private readonly rpcUrl: string;
  private readonly privateKey: `0x${string}`;
  private readonly publicClient: PublicClient<HttpTransport, typeof baseSepolia>;
  private readonly walletClient: WalletClient<HttpTransport, typeof baseSepolia, PrivateKeyAccount>;
  private readonly account: PrivateKeyAccount;
  private readonly marketBytecode: Hex;
  private readonly marketAbi: readonly unknown[];

  constructor(opts: { rpcUrl: string; privateKey: `0x${string}`; marketArtifact: { abi: unknown[]; bytecode: string | { object: string } } }) {
    this.rpcUrl = opts.rpcUrl;
    this.privateKey = opts.privateKey;
    this.account = privateKeyToAccount(opts.privateKey);
    this.address = this.account.address;
    const transport = http(opts.rpcUrl);
    this.publicClient = createPublicClient({ chain: baseSepolia, transport });
    this.walletClient = createWalletClient({ account: this.account, chain: baseSepolia, transport });
    const bc = opts.marketArtifact.bytecode;
    const obj = typeof bc === 'string' ? bc : bc.object;
    this.marketBytecode = (obj.startsWith('0x') ? obj : `0x${obj}`) as Hex;
    this.marketAbi = opts.marketArtifact.abi as readonly unknown[];
  }

  async usdcBalance(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: USDC_BASE_SEPOLIA,
      abi: MARKET_ABI,
      functionName: 'balanceOf',
      args: [this.address as Address],
    })) as bigint;
  }

  async deployMarket(opts: { durationSeconds: number }): Promise<MarketHandle> {
    // viem 2.56's sendTransaction + waitForTransactionReceipt intermittently
    // returns hash 0x0 or times out on Base Sepolia public RPC. Foundry's
    // cast is rock-solid here, so we shell out for the deploy. Reads
    // continue through viem (it can read fine).
    const deployData = encodeDeployData({
      abi: this.marketAbi,
      bytecode: this.marketBytecode,
      args: [USDC_BASE_SEPOLIA, 'ETH', '15M', BigInt(opts.durationSeconds), 1n, this.address, 20_000_000n],
    });
    const castBin = findCast();
    if (!castBin) throw new Error('cast not found on PATH — install Foundry');
    const out = execFileSync(
      castBin,
      [
        'send',
        '--rpc-url', this.rpcUrl,
        '--private-key', this.privateKey,
        '--create', deployData,
        '--json',
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    );
    const parsed = JSON.parse(out) as { contractAddress?: string; transactionHash?: string };
    const address = parsed.contractAddress as string | undefined;
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new Error(`cast deploy returned no address: ${out.slice(0, 300)}`);
    }
    return { address, expiresAt: await this.readExpiresAtWithRetry(address as Address) };
  }

  private async readExpiresAtWithRetry(address: Address): Promise<number> {
    let lastErr: unknown;
    for (let i = 0; i < 6; i++) {
      try {
        const raw = await this.publicClient.readContract({
          address,
          abi: this.marketAbi as readonly unknown[],
          functionName: 'expiresAt',
        });
        return Number(raw);
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  async fundAndPrime(market: string, fundUsdc: bigint, primeNoShares: bigint): Promise<{ fundTx: Hash; primeTx: Hash }> {
    const m = market as Address;
    const approveData = encodeFunctionData({ abi: MARKET_ABI, functionName: 'approve', args: [m, fundUsdc * 10n] });
    await this.send(USDC_BASE_SEPOLIA, approveData);
    await this.wait(12_000);
    const fundData = encodeFunctionData({ abi: MARKET_ABI, functionName: 'fund', args: [fundUsdc] });
    const fundTx = await this.send(m, fundData);
    await this.wait(12_000);
    const primeData = encodeFunctionData({ abi: MARKET_ABI, functionName: 'buyNo', args: [primeNoShares] });
    const primeTx = await this.send(m, primeData);
    return { fundTx, primeTx };
  }

  async primeMore(market: string, noShares: bigint): Promise<Hash> {
    const data = encodeFunctionData({ abi: MARKET_ABI, functionName: 'buyNo', args: [noShares] });
    const tx = await this.send(market as Address, data);
    await this.wait(12_000);
    return tx;
  }

  async yesPrice(market: string): Promise<number> {
    const raw = await this.publicClient.readContract({ address: market as Address, abi: MARKET_ABI, functionName: 'yesPrice' });
    return Number(raw) / 1e6;
  }

  async buyYes(market: string, shares: bigint): Promise<Hash> {
    const data = encodeFunctionData({ abi: MARKET_ABI, functionName: 'buyYes', args: [shares] });
    return this.send(market as Address, data);
  }

  async resolveNo(market: string): Promise<Hash> {
    const data = encodeFunctionData({ abi: MARKET_ABI, functionName: 'resolve', args: [false] });
    return this.send(market as Address, data);
  }

  async msUntilExpiry(market: string): Promise<number> {
    const exp = Number(
      await this.publicClient.readContract({ address: market as Address, abi: MARKET_ABI, functionName: 'expiresAt' }),
    );
    const now = await this.chainNow();
    return exp * 1000 - now;
  }

  private async chainNow(): Promise<number> {
    const block = await this.publicClient.getBlock({ blockTag: 'latest' });
    return Number(block.timestamp) * 1000;
  }

  private async send(to: Address, data: Hex): Promise<Hash> {
    const hash = await this.walletClient.sendTransaction({
      account: this.account,
      chain: baseSepolia,
      to,
      data,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

function findCast(): string | null {
  const candidates = [
    process.env.CAST_BIN,
    '/home/uyscutty/.foundry/bin/cast',
    `${process.env.HOME ?? ''}/.foundry/bin/cast`,
  ].filter((p): p is string => Boolean(p));
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Fall back to PATH resolution.
  for (const dir of (process.env.PATH ?? '').split(':')) {
    const p = `${dir}/cast`;
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * In-memory market for tests. Same sequencing as the real contract,
 * controllable clock, deterministic hashes. No network.
 */
export class FakeChainAdapter implements ChainAdapter {
  readonly address = '0x000000000000000000000000000000000000dEm0';
  private nowMs: number = Date.now();
  private seq = 0;
  private markets = new Map<string, { expiresAtMs: number; funded: boolean; resolved: boolean }>();
  readonly buys: Array<{ market: string; shares: bigint }> = [];
  readonly balance: bigint;

  constructor(balance = 10_000_000n) {
    this.balance = balance;
  }

  advance(ms: number): void {
    this.nowMs += ms;
  }

  private tx(prefix: string): Hash {
    this.seq += 1;
    return `0x${prefix}${String(this.seq).padStart(60, '0')}` as Hash;
  }

  async usdcBalance(): Promise<bigint> {
    return this.balance;
  }

  async deployMarket(opts: { durationSeconds: number }): Promise<MarketHandle> {
    this.seq += 1;
    const address = `0x${'fa'.repeat(18)}${String(this.seq).padStart(4, '0')}`;
    const expiresAt = Math.floor(this.nowMs / 1000) + opts.durationSeconds;
    this.markets.set(address, { expiresAtMs: expiresAt * 1000, funded: false, resolved: false });
    return { address, expiresAt };
  }

  async fundAndPrime(market: string, _fund: bigint, _prime: bigint): Promise<{ fundTx: Hash; primeTx: Hash }> {
    const m = this.markets.get(market);
    if (!m) throw new Error('unknown market');
    m.funded = true;
    return { fundTx: this.tx('fund'), primeTx: this.tx('prime') };
  }

  async primeMore(market: string, _noShares: bigint): Promise<Hash> {
    if (!this.markets.get(market)) throw new Error('unknown market');
    return this.tx('prime-more');
  }

  async yesPrice(_market: string): Promise<number> {
    return 0.5204;
  }

  async buyYes(market: string, shares: bigint): Promise<Hash> {
    const m = this.markets.get(market);
    if (!m?.funded) throw new Error('market not funded');
    if (this.nowMs >= m.expiresAtMs) throw new Error('market expired');
    this.buys.push({ market, shares });
    return this.tx('buy');
  }

  async resolveNo(market: string): Promise<Hash> {
    const m = this.markets.get(market);
    if (!m) throw new Error('unknown market');
    if (this.nowMs < m.expiresAtMs) throw new Error('not yet expired');
    m.resolved = true;
    return this.tx('resolve');
  }

  async msUntilExpiry(market: string): Promise<number> {
    const m = this.markets.get(market);
    if (!m) throw new Error('unknown market');
    return m.expiresAtMs - this.nowMs;
  }
}
