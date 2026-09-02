/**
 * CEPID error taxonomy.
 *
 * The load-bearing contract lives here: when the Sibyl substrate is missing,
 * every core operation must fail with MEMORY_SUBSTRATE_UNAVAILABLE — never
 * silently degrade, never fall back to another store.
 */

export const MEMORY_SUBSTRATE_UNAVAILABLE = 'MEMORY_SUBSTRATE_UNAVAILABLE';
export const AGENT_NOT_FOUND = 'AGENT_NOT_FOUND';
export const UNAUTHORIZED = 'UNAUTHORIZED';
export const FORBIDDEN_TENANT = 'FORBIDDEN_TENANT';
export const VALIDATION = 'VALIDATION';

export class CepidError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 500,
  ) {
    super(message);
    this.name = 'CepidError';
  }
}

export function isSubstrateUnavailable(e: unknown): boolean {
  return e instanceof CepidError && e.code === MEMORY_SUBSTRATE_UNAVAILABLE;
}
