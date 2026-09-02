/**
 * LimitlessMarketProvider — Limitless Exchange on Base mainnet.
 *
 * References (from Limitless docs):
 *  - REST:  https://api.limitless.exchange
 *  - Chain:  Base (chainId 8453)
 *  - Public market/orderbook endpoints require no auth
 *  - Order placement uses HMAC-signed POST /orders
 *  - EIP-712 domain "Limitless CTF Exchange", version "1"
 *
 * This provider talks to Limitless via fetch + viem. It does NOT
 * invent contract addresses. All chain interaction is via viem using
 * addresses returned by Limitless' /markets/:slug endpoint.
 */
import { createWalletClient, http, type Hex, type WalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import type {  } from '@cepid/server';
import type { Asset, MarketSnapshot, OrderBook, OrderBookLevel, ResolutionResult, Timeframe, TradeIntent } from '../config/types.js';
import type {
  MarketProvider,
  PlaceOrderResult,
  PositionInfo,
  TradeRecord,
} from './provider.js';
import type { AgentConfig } from '../config/types.js';

interface LimitlessMarket {
  slug: string;
  title?: string;
  description?: string;
  category?: string;
  active?: boolean;
  closed?: boolean;
  expired?: boolean;
  resolutionDate?: string;
  venue?: {
    exchange: string;
    adapter: string | null;
  };
  tokens?: {
    yes: string;
    no: string;
  };
  trades?: string;
  volume?: string;
  liquidity?: string;
}

interface LimitlessOrderbook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  midpoint: number;
  minSize?: number;
  tokenId: string;
}

const ASSET_MAP: Record<string, Asset | undefined> = {
  BTC: 'BTC',
  ETH: 'ETH',
};

const TF_MAP: Record<string, Timeframe | undefined> = {
  '15m': '15M',
  '1h': '1H',
  '1H': '1H',
  '15M': '15M',
};

function inferAssetAndTimeframe(market: LimitlessMarket): { asset: Asset; timeframe: Timeframe } | null {
  const title = (market.title ?? market.description ?? '').toUpperCase();
  const asset = ASSET_MAP.BTC && title.includes('BTC')
    ? 'BTC'
    : ASSET_MAP.ETH && title.includes('ETH')
      ? 'ETH'
      : null;
  if (!asset) return null;

  // Heuristic: search the title for "15M" / "1H" markers Limitless uses.
  let timeframe: Timeframe | null = null;
  if (/15\s*M(IN)?(UTE)?/.test(title)) timeframe = '15M';
  else if (/1\s*H(OUR)?/.test(title)) timeframe = '1H';
  if (!timeframe) return null;
  return { asset, timeframe };
}

export class LimitlessMarketProvider implements MarketProvider {
  readonly name = 'limitless';
  readonly network = 'base';

  private readonly config: AgentConfig;
  private readonly account: PrivateKeyAccount;
  private readonly walletClient: WalletClient;

  constructor(config: AgentConfig) {
    this.config = config;
    const key = (config.privateKey ?? ('0x' + '0'.repeat(64))) as `0x${string}`;
    this.account = privateKeyToAccount(key);
    this.walletClient = createWalletClient({
      account: this.account,
      chain: base,
      transport: http(config.rpcUrl),
    });
  }

  private get apiBase(): string {
    return this.config.limitless?.apiBase ?? 'https://api.limitless.exchange';
  }

  private authHeaders(method: string, path: string, body: string): Record<string, string> {
    const { tokenId, tokenSecret } = this.config.limitless ?? {};
    if (!tokenId || !tokenSecret) return {};
    const timestamp = new Date().toISOString();
    const message = `${timestamp}\n${method}\n${path}\n${body}`;
    // HMAC-SHA256, base64-decoded secret → base64 signature
    // Implemented inline using Node's crypto to avoid extra deps.
    // The actual signing is delegated to the SDK or manual fetch below.
    const { createHmac } = require('node:crypto') as typeof import('node:crypto');
    const sig = createHmac('sha256', Buffer.from(tokenSecret, 'base64'))
      .update(message)
      .digest('base64');
    return {
      'lmts-api-key': tokenId,
      'lmts-timestamp': timestamp,
      'lmts-signature': sig,
    };
  }

  async listActiveMarkets(filter?: { assets?: Asset[]; timeframes?: Timeframe[] }): Promise<MarketSnapshot[]> {
    const res = await fetch(`${this.apiBase}/markets/active`);
    if (!res.ok) throw new Error(`Limitless /markets/active ${res.status}`);
    const json = (await res.json()) as LimitlessMarket[] | { markets: LimitlessMarket[] };
    const markets = Array.isArray(json) ? json : json.markets ?? [];

    const out: MarketSnapshot[] = [];
    for (const m of markets) {
      if (m.closed || m.expired || m.active === false) continue;
      const inferred = inferAssetAndTimeframe(m);
      if (!inferred) continue;
      if (filter?.assets && !filter.assets.includes(inferred.asset)) continue;
      if (filter?.timeframes && !filter.timeframes.includes(inferred.timeframe)) continue;
      const snap = await this.toSnapshot(m, inferred.asset, inferred.timeframe);
      if (snap) out.push(snap);
    }
    return out;
  }

  async getMarket(marketId: string): Promise<MarketSnapshot | null> {
    const res = await fetch(`${this.apiBase}/markets/${marketId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Limitless /markets/${marketId} ${res.status}`);
    const m = (await res.json()) as LimitlessMarket;
    const inferred = inferAssetAndTimeframe(m);
    if (!inferred) return null;
    return this.toSnapshot(m, inferred.asset, inferred.timeframe);
  }

  async getOrderBook(marketId: string): Promise<OrderBook | null> {
    const res = await fetch(`${this.apiBase}/markets/${marketId}/orderbook`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Limitless orderbook ${marketId} ${res.status}`);
    const json = (await res.json()) as LimitlessOrderbook;
    const book: OrderBook = {
      marketId,
      bids: json.bids ?? [],
      asks: json.asks ?? [],
      midpoint: json.midpoint ?? midpointOf(json.bids, json.asks),
    };
    if (json.minSize !== undefined) (book as OrderBook & { minSize?: number }).minSize = json.minSize;
    return book;
  }

  async getPosition(_marketId: string): Promise<PositionInfo | null> {
    // Limitless position queries require auth + on-chain Conditional Token balanceOf.
    // V1 returns null — the agent treats this as "no recorded position" rather
    // than fabricating one. The decision engine does not depend on positions.
    return null;
  }

  async getTradeHistory(_marketId: string): Promise<TradeRecord[]> {
    return [];
  }

  async getResolution(marketId: string): Promise<ResolutionResult | null> {
    const m = await this.getMarket(marketId);
    if (!m) return null;
    if (m.active) return null;
    // Limitless exposes resolved market price as 0 or 1.
    // We can't know outcome without inspecting /markets/:slug fields; return PENDING.
    return {
      marketId,
      outcome: 'PENDING',
      finalYesPrice: m.yesPrice,
      settledAt: new Date().toISOString(),
    };
  }

  async placeOrder(intent: TradeIntent): Promise<PlaceOrderResult> {
    if (intent.direction === 'NO_TRADE') {
      return { ok: false, error: 'NO_TRADE intent refused' };
    }
    const market = await this.getMarket(intent.marketId);
    if (!market) return { ok: false, error: 'market_not_found' };
    if (!market.active) return { ok: false, error: 'market_inactive' };

    // The full EIP-712 sign + POST /orders flow requires venue.exchange
    // and tokens.yes/no from /markets/:slug. We delegate to a small helper
    // that constructs the order via viem. Kept in this file for proximity.
    try {
      const slug = market.id;
      const detailRes = await fetch(`${this.apiBase}/markets/${slug}`);
      const detail = (await detailRes.json()) as LimitlessMarket;
      const venue = detail.venue;
      const tokens = detail.tokens;
      if (!venue?.exchange || !tokens?.yes) {
        return { ok: false, error: 'market_missing_venue_or_tokens' };
      }
      const { signOrderAndSubmit } = await import('./limitless-orders.js');
      const result = await signOrderAndSubmit({
        apiBase: this.apiBase,
        venue,
        tokens,
        account: this.account,
        walletClient: this.walletClient,
        intent,
        ownerId: Number(this.config.limitless?.ownerId ?? 0),
        authHeaders: this.authHeaders.bind(this),
      });
      return result;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private async toSnapshot(
    m: LimitlessMarket,
    asset: Asset,
    timeframe: Timeframe,
  ): Promise<MarketSnapshot | null> {
    const book = await this.getOrderBook(m.slug).catch(() => null);
    const yesPrice = book?.midpoint ?? 0.5;
    const yesBidSize = book?.bids[0]?.size ?? 0;
    const yesAskSize = book?.asks[0]?.size ?? 0;
    const snap: MarketSnapshot = {
      id: m.slug,
      title: m.title ?? m.slug,
      asset,
      timeframe,
      expiresAt: m.resolutionDate ? Math.floor(new Date(m.resolutionDate).getTime() / 1000) : 0,
      active: m.active !== false && !m.closed && !m.expired,
      yesPrice,
      yesBidSize,
      yesAskSize,
      minShares: book ? Math.max(1, Math.floor(book.minSize ?? 1)) : 1,
    };
    if (m.liquidity) snap.liquidity = Number(m.liquidity);
    return snap;
  }
}

function midpointOf(bids: OrderBookLevel[], asks: OrderBookLevel[]): number {
  const bestBid = bids[0]?.price ?? 0.5;
  const bestAsk = asks[0]?.price ?? 0.5;
  return (bestBid + bestAsk) / 2;
}
