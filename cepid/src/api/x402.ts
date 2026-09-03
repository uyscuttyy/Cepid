/**
 * x402 payment gate — POST /v1/memories/query costs $0.01 (D2/D3).
 *
 * Architecture (verified against @x402/core@2.24 + @x402/evm@2.24):
 *   - Facilitator runs IN-PROCESS (no CDP API key): x402Facilitator +
 *     ExactEvmScheme with a viem-backed FacilitatorEvmSigner (our payment
 *     receiver wallet). Network eip155:84532 (Base Sepolia), default asset
 *     = testnet USDC — the same token the demo market uses.
 *   - The resource server maps routes → payment requirements; we bridge
 *     node:http requests via a minimal HTTPAdapter.
 *   - Flow: unpaid → 402 + PAYMENT-REQUIRED header. With PAYMENT-SIGNATURE
 *     → facilitator.verify → handler runs → facilitator.settle →
 *     PAYMENT-RESPONSE header + a Usage row on settlement success.
 *   - Only /v1/memories/query is paid (D3). Everything else stays free.
 *
 * The buyer loop ships in @cepid/client (wrapFetchWithPayment), so an
 * external agent pays without writing payment code.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { x402Facilitator } from '@x402/core/facilitator';
import { x402HTTPResourceServer, type HTTPAdapter, type HTTPRequestContext } from '@x402/core/http';
import { x402ResourceServer, type FacilitatorClient } from '@x402/core/server';
import type { RoutesConfig } from '@x402/core/http';
import { registerExactEvmScheme } from '@x402/evm/exact/facilitator';
import type { FacilitatorEvmSigner } from '@x402/evm';
import { toFacilitatorEvmSigner } from '@x402/evm';

export interface X402Config {
  /** Payment receiver wallet (D4 throwaway; funded by the user). */
  paymentWalletKey: `0x${string}`;
  /** Price per query, e.g. "$0.01". */
  queryPrice: string;
  /** Route to protect. */
  route?: string;
  rpcUrl?: string;
}

export interface X402Paywall {
  /** The resource server (for processHTTPRequest / processSettlement). */
  resourceServer: x402HTTPResourceServer;
  /** Receiver address (for display + usage rows). */
  payTo: string;
  /** Price string (for usage rows). */
  price: string;
}

function adapterFor(req: IncomingMessage, path: string): HTTPAdapter {
  return {
    getHeader: (name: string) => {
      const h = req.headers[name.toLowerCase()];
      return Array.isArray(h) ? h[0] : h;
    },
    getMethod: () => req.method ?? 'GET',
    getPath: () => path,
    getUrl: () => req.url ?? path,
    getAcceptHeader: () => req.headers.accept ?? '',
    getUserAgent: () => req.headers['user-agent'] ?? '',
  };
}

export function createPaywall(config: X402Config): X402Paywall | null {
  if (!config.paymentWalletKey) {
    // No payment wallet configured → the route stays free (local dev).
    return null;
  }
  const account: PrivateKeyAccount = privateKeyToAccount(config.paymentWalletKey);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(config.rpcUrl) });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http(config.rpcUrl) });

  // viem walletClient (has .account.address) → the signer shape the
  // facilitator wants: one client carrying address + contract ops.
  const signer: FacilitatorEvmSigner = toFacilitatorEvmSigner(
    walletClient as unknown as Parameters<typeof toFacilitatorEvmSigner>[0],
  );

  const facilitator = new x402Facilitator();
  registerExactEvmScheme(facilitator, {
    signer,
    networks: 'eip155:84532', // Base Sepolia
  });

  // Bridge the local facilitator into the FacilitatorClient interface
  // (its getSupported is sync; the client interface wants a promise, and
  // the literal types widen — the cast is a shape identity, not a lie).
  const facilitatorClient = {
    verify: (facilitator.verify.bind(facilitator) as FacilitatorClient['verify']),
    settle: (facilitator.settle.bind(facilitator) as FacilitatorClient['settle']),
    getSupported: (async () => facilitator.getSupported()) as FacilitatorClient['getSupported'],
  };

  const route = config.route ?? 'POST /v1/memories/query';
  const routes: RoutesConfig = {
    [route]: {
      accepts: [
        {
          scheme: 'exact' as const,
          payTo: account.address,
          price: config.queryPrice,
          network: 'eip155:84532' as const,
        },
      ],
      resource: 'https://cepid.dev/v1/memories/query',
      description: 'CEPID memory retrieval — ranked relevant memories for an agent situation',
      mimeType: 'application/json',
    },
  };
  const resourceServer = new x402HTTPResourceServer(
    new x402ResourceServer(facilitatorClient),
    routes,
  );


  return { resourceServer, payTo: account.address, price: config.queryPrice };
}

export type PaymentCheckResult =
  | { type: 'free' }
  | {
      type: 'payment-required';
      response: { status: number; headers: Record<string, string>; body: unknown };
    }
  | {
      type: 'verified';
      settle: () => Promise<{
        ok: boolean;
        headers: Record<string, string>;
        txHash?: string;
        payer?: string;
      }>;
    };

/**
 * Check payment for a request against the paywall.
 * Returns what the API should do next: free pass, 402, or verified (with a
 * settle() to run after the handler succeeds).
 */
export async function checkPayment(
  paywall: X402Paywall | null,
  req: IncomingMessage,
  path: string,
  method: string,
): Promise<PaymentCheckResult> {
  if (!paywall) return { type: 'free' };

  const context: HTTPRequestContext = {
    adapter: adapterFor(req, path),
    path,
    method,
    paymentHeader: Array.isArray(req.headers['payment-signature'])
      ? req.headers['payment-signature'][0]
      : req.headers['payment-signature'] as string | undefined,
  };

  if (!paywall.resourceServer.requiresPayment(context)) {
    return { type: 'free' };
  }

  const result = await paywall.resourceServer.processHTTPRequest(context);

  if (result.type === 'no-payment-required') {
    return { type: 'free' };
  }

  if (result.type === 'payment-error') {
    const { status, headers, body } = result.response;
    return {
      type: 'payment-required',
      response: { status, headers, body },
    };
  }

  // payment-verified: prepare the settle step for after the handler runs.
  return {
    type: 'verified',
    settle: async () => {
      const settleResult = await paywall.resourceServer.processSettlement(
        result.paymentPayload,
        result.paymentRequirements,
      );
      const ok = settleResult.success === true;
      const tx = (settleResult as { transactionHash?: string }).transactionHash;
      const payer = (settleResult as { payer?: string }).payer;
      return {
        ok,
        headers: ok ? settleResult.headers : {},
        txHash: typeof tx === 'string' ? tx : undefined,
        payer: typeof payer === 'string' ? payer : undefined,
      };
    },
  };
}

export { baseSepolia };
export type { Hex };
