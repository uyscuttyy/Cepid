/**
 * Server-only data access for the dashboard.
 *
 * The dashboard reads the CEPID /v1/* API through the typed client. There is
 * no local file read, no demo-agent JSON store, and no fallback. If the
 * platform is unreachable, the page renders an honest empty/down state.
 *
 * Configuration:
 *   CEPID_API_URL   (required) — e.g. http://127.0.0.1:8787
 *   CEPID_API_KEY   (optional) — required to read private data
 *
 * The instance is cached per-process so a single page load with N data
 * fetches doesn't open N TLS sockets.
 */
import 'server-only';
import { createCepidClient, type CepidClient } from './cepid';

let _client: CepidClient | null = null;

export function getClient(): CepidClient {
  if (_client) return _client;
  const baseUrl = process.env.CEPID_API_URL;
  if (!baseUrl) {
    throw new Error('CEPID_API_URL is not set. The dashboard needs the platform API.');
  }
  const apiKey = process.env.CEPID_API_KEY;
  _client = createCepidClient({ baseUrl, apiKey });
  return _client;
}

export interface ShellSummary {
  /** Total registered agents, or null when the platform is unreachable. */
  agentCount: number | null;
  /** Substrate status from /readyz, or null when the platform is unreachable. */
  substrate: 'ok' | 'down' | null;
  /** True when the dashboard is logged in (a key is set), false otherwise. */
  authenticated: boolean;
}

/** Fast, fail-soft summary the shell uses to populate the rail. */
export async function getShellSummary(): Promise<ShellSummary> {
  const client = getClient();
  const [agents, readiness] = await Promise.all([
    client.listAgents().catch(() => null),
    client.getReadiness().catch(() => null),
  ]);
  return {
    agentCount: agents?.length ?? null,
    substrate: readiness?.substrate ?? null,
    authenticated: Boolean(process.env.CEPID_API_KEY),
  };
}
