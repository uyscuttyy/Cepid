/**
 * SibylRepository — the ONLY production persistence substrate.
 *
 * Implements MemoryRepository over the localhost Sibyl sidecar. Mapping:
 *   - Each agent is a Sibyl tenant (X-Agent-Tenant), chosen by the API server
 *     after key authentication — never by external callers.
 *   - MemoryRecord    → entity (category 'memory',    name = id)
 *   - PatternRecord    → entity (category 'pattern',   name = id)
 *   - ScarRecord       → entity (category 'scar',      name = id)
 *   - RetrievalRecord  → entity (category 'retrieval', name = id)
 *   - DecisionRecord   → entity (category 'decision',  name = id)
 *   - OutcomeRecord    → entity (category 'outcome',    name = id)
 *   - journal events   → write_event / read_events (tenant-scoped)
 *   - MemoryMeta       → state tier (key 'meta'), tenant-scoped
 *
 * The engine's count/magnitude fields live on the entity BODY; body is the
 * source of truth, so upserts on (tenant, category, name) keep everything
 * consistent. No JSON fallback exists — if the sidecar is down, every call
 * fails with MEMORY_SUBSTRATE_UNAVAILABLE. That is the product's gate.
 */
import type {
  DecisionRecord,
  MemoryMeta,
  MemoryRecord,
  OutcomeRecord,
  PatternRecord,
  RetrievalRecord,
  ScarRecord,
} from '../core/domain.js';
import { DEFAULT_MEMORY_META } from '../core/domain.js';
import { CepidError, MEMORY_SUBSTRATE_UNAVAILABLE } from '../core/errors.js';
import type { MemoryRepository } from './repository.js';

interface SidecarEntityRow {
  id: string;
  tenant_id: string;
  category: string;
  name: string;
  status: string | null;
  body: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export class SibylRepository implements MemoryRepository {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  /* ------------------------------------------------------------- helpers -- */

  private async call<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    agentId: string,
    body?: unknown,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-agent-tenant': agentId,
          'x-sidecar-token': this.token,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new CepidError(
        MEMORY_SUBSTRATE_UNAVAILABLE,
        `Sibyl sidecar unreachable (${this.baseUrl}${path}): ${e instanceof Error ? e.message : String(e)}`,
        503,
      );
    }
    if (res.status === 404) {
      throw new CepidError('NOT_FOUND', `not found: ${path}`, 404);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new CepidError(
        res.status === 400 ? 'VALIDATION' : 'SUBSTRATE_ERROR',
        `sidecar ${method} ${path} → ${res.status}: ${detail.slice(0, 300)}`,
        res.status,
      );
    }
    return (await res.json()) as T;
  }

  private async putEntity<T extends { id: string }>(category: string, record: T, agentId: string): Promise<void> {
    const { id, ...body } = record;
    await this.call('POST', '/entities', agentId, { category, name: id, body });
  }

  private async getEntity<T>(category: string, id: string, agentId: string): Promise<T | null> {
    try {
      const row = await this.call<SidecarEntityRow>('GET', `/entities/${category}/${encodeURIComponent(id)}`, agentId);
      return { ...row.body, id: row.name } as T;
    } catch (e) {
      if (e instanceof CepidError && e.code === 'NOT_FOUND') return null;
      throw e;
    }
  }

  private async listEntities<T>(category: string, agentId: string, limit = 2000): Promise<T[]> {
    const res = await this.call<{ entities: SidecarEntityRow[] }>(
      'GET', `/entities?category=${category}&limit=${limit}`, agentId,
    );
    return res.entities.map((row) => ({ ...row.body, id: row.name }) as T);
  }

  /* ------------------------------------------------------------- memories -- */

  async putMemory(agentId: string, memory: MemoryRecord): Promise<void> {
    await this.putEntity('memory', memory, agentId);
  }

  async getMemory(agentId: string, id: string): Promise<MemoryRecord | null> {
    return this.getEntity<MemoryRecord>('memory', id, agentId);
  }

  async listMemories(agentId: string, opts?: { limit?: number; since?: string; kind?: string }): Promise<MemoryRecord[]> {
    const all = await this.listEntities<MemoryRecord>('memory', agentId);
    let out = all;
    if (opts?.kind) out = out.filter((m) => m.kind === opts.kind);
    if (opts?.since) out = out.filter((m) => m.createdAt >= opts.since!);
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return opts?.limit ? out.slice(0, opts.limit) : out;
  }

  /* ------------------------------------------------------------- patterns -- */

  async putPattern(agentId: string, p: PatternRecord): Promise<void> {
    await this.putEntity('pattern', p, agentId);
  }

  async getPattern(agentId: string, id: string): Promise<PatternRecord | null> {
    return this.getEntity<PatternRecord>('pattern', id, agentId);
  }

  async listPatterns(agentId: string): Promise<PatternRecord[]> {
    const all = await this.listEntities<PatternRecord>('pattern', agentId);
    return all.sort((a, b) => b.strength - a.strength);
  }

  /* ---------------------------------------------------------------- scars -- */

  async putScar(agentId: string, s: ScarRecord): Promise<void> {
    await this.putEntity('scar', s, agentId);
  }

  async listScars(agentId: string): Promise<ScarRecord[]> {
    const all = await this.listEntities<ScarRecord>('scar', agentId);
    return all.sort((a, b) => b.strength - a.strength);
  }

  /* -------------------------------------------------- influence chain ----- */

  async putRetrieval(agentId: string, r: RetrievalRecord): Promise<void> {
    await this.putEntity('retrieval', r, agentId);
  }

  async getRetrieval(agentId: string, id: string): Promise<RetrievalRecord | null> {
    return this.getEntity<RetrievalRecord>('retrieval', id, agentId);
  }

  async putDecision(agentId: string, d: DecisionRecord): Promise<void> {
    await this.putEntity('decision', d, agentId);
  }

  async getDecision(agentId: string, id: string): Promise<DecisionRecord | null> {
    return this.getEntity<DecisionRecord>('decision', id, agentId);
  }

  async putOutcome(agentId: string, o: OutcomeRecord): Promise<void> {
    await this.putEntity('outcome', o, agentId);
  }

  async listOutcomes(agentId: string, opts?: { limit?: number }): Promise<OutcomeRecord[]> {
    const all = await this.listEntities<OutcomeRecord>('outcome', agentId);
    all.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }

  /* -------------------------------------------------------------- journal -- */

  async appendEvent(agentId: string, event: Record<string, unknown>): Promise<void> {
    await this.call('POST', '/events', agentId, { payload: event });
  }

  async listEvents(agentId: string, opts?: { limit?: number; since?: string }): Promise<Array<Record<string, unknown>>> {
    const qs = new URLSearchParams();
    qs.set('limit', String(opts?.limit ?? 200));
    if (opts?.since) qs.set('since', opts.since);
    const res = await this.call<{ events: Array<{ extra?: Record<string, unknown> }> }>(
      'GET', `/events?${qs.toString()}`, agentId,
    );
    return res.events
      .map((e) => (e.extra ?? {}) as Record<string, unknown>)
      .filter((e) => Object.keys(e).length > 0);
  }

  /* ----------------------------------------------------------------- meta -- */

  async getMeta(agentId: string): Promise<MemoryMeta> {
    try {
      const row = await this.call<{ body: MemoryMeta }>('GET', `/state/${encodeURIComponent('meta')}`, agentId);
      return { ...DEFAULT_MEMORY_META, ...row.body };
    } catch (e) {
      if (e instanceof CepidError && e.code === 'NOT_FOUND') return { ...DEFAULT_MEMORY_META };
      throw e;
    }
  }

  async setMeta(agentId: string, meta: MemoryMeta): Promise<void> {
    await this.call('POST', '/state', agentId, { key: 'meta', body: meta });
  }

  /* ------------------------------------------------- generic record I/O --- */

  async putRecord(agentId: string, category: string, name: string, body: Record<string, unknown>): Promise<void> {
    await this.call('POST', '/entities', agentId, { category, name, body });
  }

  async getRecord(agentId: string, category: string, name: string): Promise<Record<string, unknown> | null> {
    try {
      const row = await this.call<SidecarEntityRow>(
        'GET', `/entities/${category}/${encodeURIComponent(name)}`, agentId,
      );
      return { ...row.body, id: row.name } as Record<string, unknown>;
    } catch (e) {
      if (e instanceof CepidError && e.code === 'NOT_FOUND') return null;
      throw e;
    }
  }

  async listRecords(agentId: string, category: string): Promise<Array<Record<string, unknown>>> {
    const res = await this.call<{ entities: SidecarEntityRow[] }>(
      'GET', `/entities?category=${category}&limit=2000`, agentId,
    );
    return res.entities.map((row) => ({ ...row.body, id: row.name }) as Record<string, unknown>);
  }
}
