/**
 * Scar lifecycle — meaningful repeated failures.
 *
 * A scar forms when a pattern is consistently bad: badRate ≥ 55%, ≥ 3 bad
 * outcomes, and mean magnitude ≤ −0.01 (net negative effect). Scars decay at
 * 25% of the ordinary rate and receive a retrieval boost.
 */
import { randomUUID } from 'node:crypto';
import type { ScarRecord } from '../core/domain.js';
import type { MemoryRepository } from '../repository/repository.js';

const SCAR_BAD_RATE_THRESHOLD = 0.55;
const SCAR_MIN_BAD = 3;
const SCAR_MAX_MEAN_MAGNITUDE = -0.01;

export async function updateScars(
  repo: MemoryRepository,
  agentId: string,
): Promise<ScarRecord[]> {
  const patterns = await repo.listPatterns(agentId);
  const existing = await repo.listScars(agentId);
  const scarsByPattern = new Map<string, ScarRecord>();
  for (const s of existing) scarsByPattern.set(s.patternId, s);

  const now = new Date().toISOString();
  const updated: ScarRecord[] = [];

  for (const p of patterns) {
    const qualifies =
      p.bad >= SCAR_MIN_BAD &&
      p.badRate >= SCAR_BAD_RATE_THRESHOLD &&
      p.meanMagnitude <= SCAR_MAX_MEAN_MAGNITUDE;

    const prior = scarsByPattern.get(p.id);
    if (qualifies) {
      const nextStrength = prior ? Math.min(1, prior.strength + 0.05) : 0.7;
      const scar: ScarRecord = {
        id: prior?.id ?? `scar-${randomUUID().slice(0, 8)}`,
        patternId: p.id,
        agentId,
        description: `Scar: ${p.description}`,
        memoryIds: p.memoryIds,
        decayMultiplier: 0.25,
        strength: nextStrength,
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
      };
      await repo.putScar(agentId, scar);
      updated.push(scar);
    } else if (prior) {
      // Pattern no longer qualifies — the scar fades.
      const faded: ScarRecord = {
        ...prior,
        strength: Math.max(0, prior.strength - 0.1),
        updatedAt: now,
      };
      await repo.putScar(agentId, faded);
      updated.push(faded);
    }
  }

  return updated;
}
