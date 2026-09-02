/**
 * Platform configuration for @cepid/server.
 *
 * Phase 1 carries the transitional dataDir (used only by the test/transition
 * JSON repository until Phase 2 replaces it with the Sibyl sidecar). Phase 2
 * adds sidecarUrl; Phase 7 adds the x402 settings.
 */
export interface CepidServerConfig {
  /** Transitional: backing dir for the test JSON repository. Phase 2 removes. */
  dataDir: string;
  /** Sidecar base URL (Phase 2). Default localhost. */
  sidecarUrl: string;
  /** HTTP API port (Phase 4). */
  port: number;
  /** Price for /v1/memories/query (Phase 7). */
  queryPriceUsd: string;
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number, got "${raw}"`);
  }
  return value;
}

function readString(name: string, fallback: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw;
}

export function loadServerConfig(): CepidServerConfig {
  return {
    dataDir: readString('CEPID_DATA_DIR', './data'),
    sidecarUrl: readString('CEPID_SIDECAR_URL', 'http://127.0.0.1:8765'),
    port: readNumber('CEPID_PORT', 8787),
    queryPriceUsd: readString('CEPID_QUERY_PRICE', '$0.01'),
  };
}
