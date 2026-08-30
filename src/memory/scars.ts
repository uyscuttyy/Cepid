/**
 * Scar memory lifecycle.
 *
 * A scar is created when a pattern produces repeated losses. Scars decay
 * more slowly than ordinary memories and receive a retrieval boost.
 */
import { randomUUID } from 'node:crypto';
import type { Experience, PatternMemory, ScarMemory } from '../config/types.js';
import type { MemoryRepository } from './repository.js';

const SCAR_WIN_RATE_THRESHOLD = 0.35;
const SCAR_MIN_SAMPLES = 3;
const SCAR_MIN_AVG_PNL = -0.01;

export async function updateScars(repo: MemoryRepository): Promise<ScarMemory[]> {
  const patterns = await repo.listPatterns();
  const existing = await repo.listScars();
  const scarsByPattern = new Map<string, ScarMemory>();
  for (const s of existing) scarsByPattern.set(s.patternId, s);

  const now = new Date().toISOString();
  const updated: ScarMemory[] = [];

  for (const p of patterns) {
    const qualifiesAsScar =
      p.losses >= SCAR_MIN_SAMPLES &&
      p.winRate <= SCAR_WIN_RATE_THRESHOLD &&
      p.avgPnl <= SCAR_MIN_AVG_PNL;

    const prior = scarsByPattern.get(p.id);
    if (qualifiesAsScar) {
      // Strengthen or create
      const nextStrength = prior
        ? Math.min(1, prior.strength + 0.05)
        : 0.7;
      const scar: ScarMemory = {
        id: prior?.id ?? `scar-${randomUUID().slice(0, 8)}`,
        patternId: p.id,
        description: `Scar: ${p.description}`,
        experienceIds: p.experienceIds,
        decayMultiplier: 0.25,
        strength: nextStrength,
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
      };
      await repo.putScar(scar);
      updated.push(scar);
    } else if (prior) {
      // Pattern no longer qualifies — let the scar fade
      const nextStrength = Math.max(0, prior.strength - 0.1);
      const faded: ScarMemory = { ...prior, strength: nextStrength, updatedAt: now };
      await repo.putScar(faded);
      updated.push(faded);
    }
  }

  return updated;
}
