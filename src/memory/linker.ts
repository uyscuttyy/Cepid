/**
 * Pattern linker — detects recurring market configurations across experiences.
 *
 * A pattern is identified by a coarse tag key derived from the market context
 * (asset + timeframe + vol + momentum + liquidity + time-bucket). When enough
 * experiences share a tag and the same outcome direction, a pattern forms.
 */
import { randomUUID } from 'node:crypto';
import type { Experience, MarketContext, PatternMemory } from '../config/types.js';
import { contextTag } from './importance.js';
import type { MemoryRepository } from './repository.js';

const MIN_SAMPLES = 3;

export async function linkPatterns(repo: MemoryRepository): Promise<PatternMemory[]> {
  const experiences = await repo.listExperiences();
  if (experiences.length === 0) return [];

  // Group by tag key
  const groups = new Map<string, Experience[]>();
  for (const e of experiences) {
    const key = contextTag(e.conditions);
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  const now = new Date().toISOString();
  const out: PatternMemory[] = [];

  for (const [tagKey, exps] of groups.entries()) {
    if (exps.length < MIN_SAMPLES) continue;

    const wins = exps.filter((e) => e.outcome.outcome === 'WIN').length;
    const losses = exps.filter((e) => e.outcome.outcome === 'LOSS').length;
    if (wins + losses === 0) continue;
    const winRate = wins / (wins + losses);
    const avgPnl = exps.reduce((s, e) => s + e.outcome.pnl, 0) / exps.length;

    // Strength grows with sample count and extremity of win-rate
    const extremity = Math.abs(winRate - 0.5) * 2; // 0..1
    const strength = Math.min(1, (exps.length / 10) * (0.5 + extremity * 0.5));

    out.push({
      id: `pat-${hashTag(tagKey)}`,
      description: describe(tagKey, winRate, exps),
      tagKey,
      experienceIds: exps.map((e) => e.id),
      wins,
      losses,
      winRate,
      avgPnl,
      strength,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Replace any prior pattern with the same id
  for (const p of out) await repo.putPattern(p);
  return out;
}

function hashTag(tag: string): string {
  // Tiny non-cryptographic hash for stable ids
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function describe(tagKey: string, winRate: number, exps: Experience[]): string {
  const sample = exps[0];
  if (!sample) return tagKey;
  const verdict = winRate >= 0.6 ? 'historically performed well' : winRate <= 0.4 ? 'historically performed poorly' : 'mixed outcomes';
  return `${tagKey} — ${verdict} (${(winRate * 100).toFixed(0)}% win rate over ${exps.length} samples)`;
}

export function deriveContextTag(ctx: MarketContext): string {
  return contextTag(ctx);
}
