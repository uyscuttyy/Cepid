/**
 * Agent-local event log (transitional).
 *
 * Phase 0: the orchestrator still writes its run events here. Phase 2 moves
 * the durable trail into Sibyl's per-tenant journal, and Phase 4 (agent as
 * pure SDK consumer) deletes this file entirely. It never contained, and
 * must never contain, key material — see the key-leak regression tests in
 * cepid/test.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface AgentEvent {
  type: string;
  at: string;
  [key: string]: unknown;
}

export class EventStore {
  constructor(private readonly file = resolve(process.env.CEPID_DATA_DIR ?? 'data', 'events.json')) {}

  async append(event: AgentEvent): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    let events: AgentEvent[] = [];
    try {
      events = JSON.parse(await readFile(this.file, 'utf8'));
    } catch {
      events = [];
    }
    events.push(event);
    await writeFile(this.file, JSON.stringify(events, null, 2) + '\n');
  }

  async all(): Promise<AgentEvent[]> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8')) as AgentEvent[];
    } catch {
      return [];
    }
  }
}
