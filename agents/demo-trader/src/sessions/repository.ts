/**
 * Agent session persistence.
 *
 * A session tracks: id, start/end, markets observed, decisions, trades,
 * memory ids created during the session. Survives process restart.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {  } from '@cepid/server';
import type { AgentSession } from '../config/types.js';

export class SessionRepository {
  private readonly file: string;

  constructor(dataDir: string) {
    this.file = join(dataDir, 'sessions.json');
  }

  async all(): Promise<AgentSession[]> {
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as AgentSession[]) : [];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  async upsert(session: AgentSession): Promise<void> {
    const all = await this.all();
    const idx = all.findIndex((s) => s.id === session.id);
    if (idx >= 0) all[idx] = session;
    else all.push(session);
    await mkdir(this.file.replace(/sessions\.json$/, ''), { recursive: true });
    await writeFile(this.file, JSON.stringify(all, null, 2));
  }

  async latest(): Promise<AgentSession | null> {
    const all = await this.all();
    if (all.length === 0) return null;
    return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
  }
}
