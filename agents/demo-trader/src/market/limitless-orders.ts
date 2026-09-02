/**
 * Limitless order signing + submission.
 *
 * Builds an EIP-712 Order, signs it with viem, and POSTs to /orders.
 * This file isolates the cryptographic + network details so the rest of
 * the provider stays readable.
 */
import { encodeFunctionData, type WalletClient, type Hex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import type { TradeIntent } from '../config/types.js';
import type { PlaceOrderResult } from './provider.js';

const LIMITLESS_CTF_EXCHANGE_NAME = 'Limitless CTF Exchange';
const LIMITLESS_CTF_EXCHANGE_VERSION = '1';
const CHAIN_ID = 8453;

const orderType = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
  ],
} as const;

interface SignArgs {
  apiBase: string;
  venue: { exchange: string; adapter: string | null };
  tokens: { yes: string; no: string };
  account: PrivateKeyAccount;
  walletClient: WalletClient;
  intent: TradeIntent;
  ownerId: number;
  authHeaders: (method: string, path: string, body: string) => Record<string, string>;
}

export async function signOrderAndSubmit(args: SignArgs): Promise<PlaceOrderResult> {
  const { apiBase, venue, tokens, account, intent, ownerId, authHeaders } = args;
  const tokenId = intent.direction === 'YES' ? BigInt(tokens.yes) : BigInt(tokens.no);
  const side = intent.direction === 'YES' ? 0 : 1;
  // USDC has 6 decimals. Price is in [0, 1]; shares are whole numbers.
  const priceUsdc = BigInt(Math.round(intent.price * 1_000_000));
  const shares = BigInt(Math.round(intent.shares));
  const makerAmount = side === 0 ? priceUsdc * shares : shares; // BUY pays USDC, SELL pays shares
  const takerAmount = side === 0 ? shares : priceUsdc * shares;

  const salt = BigInt(Math.floor(Math.random() * 2 ** 32));
  const expiration = BigInt(Math.floor(Date.now() / 1000) + 60 * 15); // 15 min

  const domain = {
    name: LIMITLESS_CTF_EXCHANGE_NAME,
    version: LIMITLESS_CTF_EXCHANGE_VERSION,
    chainId: CHAIN_ID,
    verifyingContract: venue.exchange as `0x${string}`,
  } as const;

  const message = {
    salt,
    maker: account.address,
    signer: account.address,
    taker: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    tokenId,
    makerAmount,
    takerAmount,
    expiration,
    nonce: 0n,
    feeRateBps: 0n,
    side,
    signatureType: 0,
  } as const;

  const signature = await account.signTypedData({
    domain,
    types: orderType,
    primaryType: 'Order',
    message,
  });

  const order = {
    salt: salt.toString(),
    maker: account.address,
    signer: account.address,
    taker: message.taker,
    tokenId: tokenId.toString(),
    makerAmount: makerAmount.toString(),
    takerAmount: takerAmount.toString(),
    expiration: expiration.toString(),
    nonce: '0',
    feeRateBps: '0',
    side,
    signatureType: 0,
    signature,
  };

  const body = JSON.stringify({
    order,
    orderType: 'GTC',
    marketSlug: intent.marketId,
    ownerId,
  });

  const path = '/orders';
  const headers = { 'content-type': 'application/json', ...authHeaders('POST', path, body) };
  const res = await fetch(`${apiBase}${path}`, { method: 'POST', headers, body });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Limitless /orders ${res.status}: ${text}` };
  }
  const json = (await res.json()) as { orderId?: string; txHash?: string; filledPrice?: number; filledShares?: number };
  const result: { ok: true; orderId?: string; filledPrice: number; filledShares: number; txHash?: string } = {
    ok: true,
    filledPrice: intent.price,
    filledShares: intent.shares,
  };
  if (json.orderId) result.orderId = json.orderId;
  if (json.txHash) result.txHash = json.txHash;
  return result;
}
