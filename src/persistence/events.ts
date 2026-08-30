/**
 * Append-only event log for the orchestrator.
 *
 * Used by the UI to display the most recent preview, orders submitted, etc.
 * Pure JSON file under ${dataDir}/events.json.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface AgentEvent {
  type: string;
  at: string;
  wallet: string | null;
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
