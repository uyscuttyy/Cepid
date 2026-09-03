/**
 * Service entrypoint — boots CEPID against the Sibyl sidecar.
 *
 *   sidecar (python, 8765)  ←  SibylRepository  ←  API (node, 8787)
 *
 * Run: CEPID_SIDECAR_URL=… SIDECAR_TOKEN=… npx tsx src/main.ts
 * The sidecar must already be up (readyz checks it).
 */
import { loadServerConfig } from '../core/config.js';
import { SibylRepository } from '../repository/sibyl-repository.js';
import { AgentRegistry, PLATFORM_TENANT } from '../registry/registry.js';
import { startApi } from './server.js';
import { createPaywall } from './x402.js';

async function main() {
  const config = loadServerConfig();
  const repo = new SibylRepository(config.sidecarUrl, process.env.SIDECAR_TOKEN ?? 'dev-sidecar-token');
  const registry = new AgentRegistry(repo);

  // x402 gate: live when the payment wallet is configured; routes stay
  // free otherwise (local dev / tests). D2: $0.01 per query; D3: query only.
  const paymentKey = process.env.CEPID_PAYMENT_WALLET_KEY as `0x${string}` | undefined;
  const paywall = paymentKey
    ? createPaywall({
        paymentWalletKey: paymentKey,
        queryPrice: config.queryPriceUsd,
        rpcUrl: process.env.CEPID_RPC_URL_BASE_SEPOLIA ?? 'https://sepolia.base.org',
      })
    : null;

  const api = await startApi({ repo, registry, port: config.port, paywall });

  // Readiness requires the substrate; fail fast at boot if it's missing.
  try {
    await repo.getMeta(PLATFORM_TENANT);
  } catch {
    console.error(`[cepid] FATAL: Sibyl sidecar not reachable at ${config.sidecarUrl}`);
    console.error('[cepid] CEPID has no memory without Sibyl — there is no fallback.');
    process.exit(1);
  }

  console.log(`[cepid] api listening on http://127.0.0.1:${config.port}`);
  console.log(`[cepid] substrate: ${config.sidecarUrl}`);
  console.log(`[cepid] x402: ${paywall ? `PAID — /v1/memories/query at ${paywall.price} → ${paywall.payTo}` : 'free (no payment wallet configured)'}`);

  const shutdown = async () => {
    await api.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
