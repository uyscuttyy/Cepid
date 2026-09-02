/**
 * Decay and reinforcement.
 *
 * Decay: memories lose strength over time (1%/hr ordinary, ×0.25 for scarred
 * memories), floor 0.05, never deleted — the audit trail is permanent.
 *
 * Reinforcement: memories that were used in a decision whose outcome
 * validated them gain strength (+VALIDATED_GAIN); memories that mislead get
 * weakened (−CONTRADICTED_PENALTY). This closes the lifecycle:
 * retrieved → used → outcome → validated → strengthened/weakened.
 */
import type { MemoryRepository } from '../repository/repository.js';
import { DEFAULT_MEMORY_META } from '../core/domain.js';

const ORDINARY_DECAY_PER_HOUR = 0.01;
const SCAR_DECAY_MULTIPLIER = 0.25;
const MIN_STRENGTH = 0.05;

export const VALIDATED_GAIN = 0.05;
export const CONTRADICTED_PENALTY = 0.03;

export interface DecayResult {
  weakened: number;
  reinforced: number;
}

export async function runDecay(
  repo: MemoryRepository,
  agentId: string,
  now: Date = new Date(),
): Promise<DecayResult> {
  const meta = await repo.getMeta(agentId);
  const fallback = { ...DEFAULT_MEMORY_META };
  const lastDecay = meta.lastDecayAt ? new Date(meta.lastDecayAt) : null;
  if (!lastDecay) {
    await repo.setMeta(agentId, { ...(meta.experienceCount === 0 ? fallback : meta), lastDecayAt: now.toISOString() });
    return { weakened: 0, reinforced: 0 };
  }
  const hours = Math.max(0, (now.getTime() - lastDecay.getTime()) / 3_600_000);
  if (hours === 0) return { weakened: 0, reinforced: 0 };

  const [memories, scars] = await Promise.all([
    repo.listMemories(agentId),
    repo.listScars(agentId),
  ]);
  const scarIds = new Set<string>();
  for (const s of scars) for (const id of s.memoryIds) scarIds.add(id);

  let weakened = 0;
  for (const m of memories) {
    const isScar = scarIds.has(m.id);
    const decay = (isScar ? ORDINARY_DECAY_PER_HOUR * SCAR_DECAY_MULTIPLIER : ORDINARY_DECAY_PER_HOUR) * hours;
    const next = Math.max(MIN_STRENGTH, m.strength - decay);
    if (next !== m.strength) {
      weakened++;
      await repo.putMemory(agentId, { ...m, strength: next });
    }
  }

  await repo.setMeta(agentId, { ...meta, lastDecayAt: now.toISOString() });
  return { weakened, reinforced: 0 };
}

/** Strengthen a memory whose use was validated by the outcome it predicted. */
export async function reinforce(
  repo: MemoryRepository,
  agentId: string,
  memoryId: string,
  amount: number = VALIDATED_GAIN,
): Promise<void> {
  const memory = await repo.getMemory(agentId, memoryId);
  if (!memory) return;
  const next = Math.min(1, memory.strength + amount);
  await repo.putMemory(agentId, { ...memory, strength: next });
}

/** Weaken a memory that misled the decision it participated in. */
export async function weaken(
  repo: MemoryRepository,
  agentId: string,
  memoryId: string,
  amount: number = CONTRADICTED_PENALTY,
): Promise<void> {
  const memory = await repo.getMemory(agentId, memoryId);
  if (!memory) return;
  const next = Math.max(MIN_STRENGTH, memory.strength - amount);
  await repo.putMemory(agentId, { ...memory, strength: next });
}
