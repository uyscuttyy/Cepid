/**
 * Memory decay and strength adjustment.
 *
 * Over time, unused memories lose strength. Memories that participate in
 * decisions get reinforced. Scars decay more slowly.
 *
 * Decay is a per-tick function; the caller decides how often to run it.
 */
import type { Experience, ScarMemory } from '../config/types.js';
import type { MemoryRepository } from './repository.js';

const ORDINARY_DECAY_PER_HOUR = 0.01;
const SCAR_DECAY_MULTIPLIER = 0.25;
const MIN_STRENGTH = 0.05;

export interface DecayResult {
  weakened: number;
  reinforced: number;
  deleted: number;
}

export async function runDecay(repo: MemoryRepository, now: Date = new Date()): Promise<DecayResult> {
  const meta = await repo.getMeta();
  const lastDecay = meta.lastDecayAt ? new Date(meta.lastDecayAt) : null;
  if (!lastDecay) {
    // First run — establish the baseline timestamp; nothing to decay against yet.
    await repo.setMeta({ ...meta, lastDecayAt: now.toISOString() });
    return { weakened: 0, reinforced: 0, deleted: 0 };
  }
  const hours = Math.max(0, (now.getTime() - lastDecay.getTime()) / 3_600_000);
  if (hours === 0) {
    return { weakened: 0, reinforced: 0, deleted: 0 };
  }

  const [experiences, scars] = await Promise.all([repo.listExperiences(), repo.listScars()]);
  const scarIds = new Set<string>();
  for (const s of scars) for (const id of s.experienceIds) scarIds.add(id);

  let weakened = 0;
  let deleted = 0;
  for (const e of experiences) {
    const isScar = scarIds.has(e.id);
    const decay = (isScar ? ORDINARY_DECAY_PER_HOUR * SCAR_DECAY_MULTIPLIER : ORDINARY_DECAY_PER_HOUR) * hours;
    const next = Math.max(MIN_STRENGTH, e.strength - decay);
    if (next !== e.strength) {
      weakened++;
      await repo.putExperience({ ...e, strength: next });
    }
    if (next <= MIN_STRENGTH && !isScar && e.importance < 0.3) {
      // Forgetting: drop only low-importance, non-scarred, already-decayed memories
      // We don't actually delete (audit trail); we just mark strength to MIN.
      // This is intentional — the spec wants the loop to be persistent and visible.
    }
  }

  await repo.setMeta({ ...meta, lastDecayAt: now.toISOString() });
  return { weakened, reinforced: 0, deleted };
}

export async function reinforce(
  repo: MemoryRepository,
  experienceId: string,
  amount: number = 0.05,
): Promise<void> {
  const exp = await repo.getExperience(experienceId);
  if (!exp) return;
  const next = Math.min(1, exp.strength + amount);
  await repo.putExperience({ ...exp, strength: next });
}
