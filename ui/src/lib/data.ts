/**
 * Server-only data access for the dashboard.
 *
 * The dashboard reads the CEPID /v1/* API through the typed client. There is
 * no local file read, no demo-agent JSON store, and no fallback. If the
 * platform is unreachable, the page renders an honest empty/down state.
 *
 * Configuration:
 *   CEPID_API_URL   (required) — e.g. http://127.0.0.1:8787
 *   CEPID_API_KEY   (optional, process) — default key
 *   cepid_demo_key  (cookie) — overrides the env key for a demo session
 */
import 'server-only';
import { cookies } from 'next/headers';
import { createCepidClient, type CepidClient } from './cepid';

/** Resolve the active key: demo session cookie takes precedence, then env. */
export async function resolveApiKey(): Promise<string | undefined> {
  const jar = await cookies();
  const cookieKey = jar.get('cepid_demo_key')?.value;
  if (cookieKey) return cookieKey;
  return process.env.CEPID_API_KEY;
}

export async function getClient(): Promise<CepidClient> {
  const baseUrl = process.env.CEPID_API_URL;
  if (!baseUrl) {
    throw new Error('CEPID_API_URL is not set. The dashboard needs the platform API.');
  }
  const apiKey = await resolveApiKey();
  return createCepidClient({ baseUrl, apiKey });
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
  const apiKey = await resolveApiKey();
  const client = createCepidClient({ baseUrl: process.env.CEPID_API_URL!, apiKey });
  const [agents, readiness] = await Promise.all([
    client.listAgents().catch(() => null),
    client.getReadiness().catch(() => null),
  ]);
  return {
    agentCount: agents?.length ?? null,
    substrate: readiness?.substrate ?? null,
    authenticated: Boolean(apiKey),
  };
}
