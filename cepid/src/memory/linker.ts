/**
 * Pattern linker — recurring situations across an agent's memories.
 *
 * A pattern forms when ≥ MIN_SAMPLES experiences share a situation signature
 * (facet fingerprint, domain-anchored) and have settled outcomes. The pattern
 * tracks good/bad/neutral counts and mean signed magnitude; scars form from
 * patterns that are consistently bad (see scars.ts).
 */
import { randomUUID } from 'node:crypto';
import type { MemoryRecord, PatternRecord, Situation } from '../core/domain.js';
import { situationSignature } from './importance.js';
import type { MemoryRepository } from '../repository/repository.js';

const MIN_SAMPLES = 3;

export async function linkPatterns(
  repo: MemoryRepository,
  agentId: string,
): Promise<PatternRecord[]> {
  const memories = (await repo.listMemories(agentId)).filter((m) => m.kind === 'experience');
  if (memories.length === 0) return [];

  const groups = new Map<string, MemoryRecord[]>();
  for (const m of memories) {
    const key = situationSignature(m.situation);
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }

  const now = new Date().toISOString();
  const out: PatternRecord[] = [];

  for (const [signature, group] of groups.entries()) {
    const settled = group.filter((m) => m.outcome !== null);
    if (settled.length < MIN_SAMPLES) continue;

    let good = 0, bad = 0, neutral = 0;
    let magSum = 0;
    for (const m of settled) {
      const o = m.outcome!;
      if (o.valence === 'good') good++;
      else if (o.valence === 'bad') bad++;
      else neutral++;
      magSum += o.magnitude ?? 0;
    }
    if (good + bad + neutral === 0) continue;

    const badRate = bad / (good + bad + neutral);
    const meanMagnitude = magSum / settled.length;

    // Strength grows with sample count and outcome extremity.
    const extremity = Math.abs(badRate - 0.5) * 2;
    const strength = Math.min(1, (settled.length / 10) * (0.5 + extremity * 0.5));

    const id = `pat-${hashSignature(signature)}`;
    const prior = await repo.getPattern(agentId, id);
    out.push({
      id,
      agentId,
      description: describe(signature, badRate, settled),
      signature,
      memoryIds: settled.map((m) => m.id),
      good,
      bad,
      neutral,
      badRate,
      meanMagnitude,
      strength,
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
    });
  }

  for (const p of out) await repo.putPattern(agentId, p);
  return out;
}

function hashSignature(sig: string): string {
  let h = 0;
  for (let i = 0; i < sig.length; i++) h = (h * 31 + sig.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function describe(signature: string, badRate: number, settled: MemoryRecord[]): string {
  const verdict =
    badRate >= 0.6 ? 'repeatedly produced bad outcomes'
    : badRate <= 0.4 ? 'historically produced good outcomes'
    : 'mixed outcomes';
  return `${signature} — ${verdict} (${(badRate * 100).toFixed(0)}% bad over ${settled.length} settled samples)`;
}

export { situationSignature };
export type { Situation };
