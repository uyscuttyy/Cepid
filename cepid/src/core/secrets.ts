/**
 * Secret hygiene — the platform-level guard.
 *
 * A private key must NEVER become part of CEPID memory, the journal, or any
 * persisted store. The engine is the last boundary every write crosses, so
 * the guard lives here: key-shaped values (0x + 64 hex chars, the EVM
 * private-key shape) are rejected before anything is stored — with a precise
 * error rather than silent redaction, so a misbehaving agent finds out
 * immediately instead of corrupting its own memory.
 *
 * This is deliberately narrow: it targets the private-key shape, not hex
 * strings generally (tx hashes are 0x + 64 hex too — but those are also not
 * accepted in *facets/situation content*; they belong in evidence fields
 * which are structurally typed and never serialized into free text).
 */
import { CepidError, VALIDATION } from './errors.js';

const PRIVATE_KEY_SHAPE = /0x[0-9a-fA-F]{64}/;

/** Field names that are exempt from scanning (structured evidence). */
const EVIDENCE_FIELDS = new Set(['txHash', 'externalRef']);

export function assertNoKeyMaterial(value: unknown, path = ''): void {
  if (typeof value === 'string') {
    if (PRIVATE_KEY_SHAPE.test(value)) {
      throw new CepidError(
        VALIDATION,
        `Refusing to persist key-shaped value at ${path || 'root'} — private keys must never enter memory`,
        400,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoKeyMaterial(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (EVIDENCE_FIELDS.has(k)) continue; // txHash is allowed, by name, in evidence
      assertNoKeyMaterial(v, path ? `${path}.${k}` : k);
    }
  }
}
