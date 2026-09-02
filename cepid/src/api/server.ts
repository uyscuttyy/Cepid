/**
 * HTTP API v1 — the product's public boundary.
 *
 * Everything an external agent can do, the demo agent does through the same
 * routes. Route map (architecture.md §10):
 *
 *   POST /v1/agents/register      (free)  name, description → agentId + key (once)
 *   POST /v1/memories/query       (free until Phase 7's x402 gate)
 *   POST /v1/memories             (free)  record an experience
 *   POST /v1/decisions            (free)  record a decision + its retrieval edge
 *   POST /v1/outcomes             (free)  record an outcome → validation loop (Phase 5)
 *   GET  /v1/memories/:id         (free)  tenant-scoped detail
 *   GET  /v1/agents/:id/memory    (free)  dashboard feed
 *   GET  /v1/agents               (free)  registry listing (for the UI)
 *   GET  /v1/activity             (free)  journal-derived feed
 *   GET  /healthz  /readyz        (free)  liveness/readiness (readyz includes sidecar)
 *
 * Auth: `Authorization: Bearer cepid_<…>` on every route except register,
 * healthz, and readyz. The key resolves to an agentId (hash-then-match) and
 * the agentId IS the Sibyl tenant — callers never state tenants, and one
 * agent can never read another's memories because the repository is
 * tenant-scoped by construction (proven in tests).
 *
 * Server: node:http deliberately — the API is small, fully typed, and this
 * keeps the dependency surface near zero. Phase 7's x402 middleware wraps
 * the /v1/memories/query handler directly.
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type {
  DecisionRecord,
  MemoryRecord,
  OutcomeRecord,
  RetrievalRecord,
  Situation,
  MemoryOutcome,
} from '../core/domain.js';
import { assertNoKeyMaterial } from '../core/secrets.js';
import { CepidError, isSubstrateUnavailable, MEMORY_SUBSTRATE_UNAVAILABLE } from '../core/errors.js';
import type { MemoryRepository } from '../repository/repository.js';
import { AgentRegistry } from '../registry/registry.js';
import { retrieveMemories, markMemoryUsed } from '../memory/retriever.js';
import { evaluateAndStore } from '../memory/evaluator.js';
import { linkPatterns } from '../memory/linker.js';
import { updateScars } from '../memory/scars.js';
import { validateAndAdjust } from '../memory/lifecycle.js';
import { runDecay } from '../memory/decay.js';

export interface ApiDeps {
  repo: MemoryRepository;
  registry: AgentRegistry;
  port: number;
}

export class CepidApi {
  readonly server: Server;
  private readonly repo: MemoryRepository;
  private readonly registry: AgentRegistry;

  constructor(private readonly deps: ApiDeps) {
    this.repo = deps.repo;
    this.registry = deps.registry;
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((e) => this.fail(res, e));
    });
  }

  listen(): Promise<void> {
    return new Promise((resolve) => this.server.listen(this.deps.port, '127.0.0.1', resolve));
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  /* ------------------------------------------------------------ routing -- */

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';

    try {
      if (method === 'GET' && (path === '/healthz' || path === '/readyz')) {
        return this.readyz(res, path === '/readyz');
      }

      const body = method === 'POST' ? await this.readJson(req) : {};

      // Registration is open; everything else requires a resolved agent.
      if (method === 'POST' && path === '/v1/agents/register') {
        return this.register(res, body);
      }
      if (method === 'GET' && path === '/v1/agents') {
        return this.listAgents(res);
      }

      const auth = await this.authenticate(req);
      if (!auth) {
        return this.json(res, 401, { error: 'UNAUTHORIZED', message: 'Provide Authorization: Bearer cepid_…' });
      }
      const agentId = auth.agentId;

      if (method === 'POST' && path === '/v1/memories/query') {
        return this.query(res, agentId, body);
      }
      if (method === 'POST' && path === '/v1/memories') {
        return this.recordMemory(res, agentId, body);
      }
      if (method === 'POST' && path === '/v1/decisions') {
        return this.recordDecision(res, agentId, body);
      }
      if (method === 'POST' && path === '/v1/outcomes') {
        return this.recordOutcome(res, agentId, body);
      }
      if (method === 'GET' && path.startsWith('/v1/memories/')) {
        return this.getMemory(res, agentId, path.slice('/v1/memories/'.length));
      }
      if (method === 'GET' && path === '/v1/agents/history') {
        return this.history(res, agentId);
      }
      if (method === 'GET' && path === '/v1/activity') {
        return this.activity(res, agentId);
      }
      if (method === 'GET' && path === '/v1/usage') {
        return this.usage(res, agentId);
      }

      return this.json(res, 404, { error: 'NOT_FOUND', path });
    } catch (e) {
      this.fail(res, e);
    }
  }

  /* ------------------------------------------------------------ handlers -- */

  private async register(res: ServerResponse, body: Record<string, unknown>) {
    const name = String(body.name ?? '');
    const description = String(body.description ?? '');
    const { agent, issued } = await this.registry.register({ name, description });
    // The key is shown exactly once, here. Never logged, never stored.
    return this.json(res, 201, {
      agent,
      apiKey: issued.key,
      keyPrefix: issued.prefix,
      keyLast4: issued.last4,
      warning: 'Store this key now — it is never shown again.',
    });
  }

  private async listAgents(res: ServerResponse) {
    const agents = await this.registry.listAgents();
    return this.json(res, 200, { agents });
  }

  private async query(res: ServerResponse, agentId: string, body: Record<string, unknown>) {
    const situation = this.parseSituation(body.situation);
    const limit = typeof body.limit === 'number' ? Math.min(Math.max(body.limit, 1), 50) : 10;
    const minSimilarity = typeof body.minSimilarity === 'number' ? body.minSimilarity : undefined;

    // Deterministic decay tick — memories fade between sessions unless
    // reinforced by outcomes (the full lifecycle).
    await runDecay(this.repo, agentId).catch(() => undefined);
    const hits = await retrieveMemories(this.repo, agentId, situation, { limit, minSimilarity });

    // THE INFLUENCE EDGE: this retrieval is recorded so the decision that
    // uses it can reference it. Real rows, real counts — nothing inferred.
    const retrieval: RetrievalRecord = {
      id: `ret-${randomUUID().slice(0, 12)}`,
      agentId,
      situation,
      returnedMemoryIds: hits.map((h) => h.memory.id),
      ranking: hits.map((h) => ({
        memoryId: h.memory.id,
        similarity: h.similarity,
        retrievalScore: h.retrievalScore,
      })),
      occurredAt: new Date().toISOString(),
    };
    await this.repo.putRetrieval(agentId, retrieval);
    await this.repo.appendEvent(agentId, {
      type: 'memory.retrieved',
      at: retrieval.occurredAt,
      retrievalId: retrieval.id,
      query: situation.text,
      returned: hits.length,
    });

    return this.json(res, 200, {
      retrievalId: retrieval.id,
      memories: hits.map((h) => ({
        id: h.memory.id,
        situation: h.memory.situation,
        action: h.memory.action,
        outcome: h.memory.outcome,
        importance: h.memory.importance,
        strength: h.memory.strength,
        retrievedCount: h.memory.retrievedCount,
        surprising: h.memory.surprising,
        createdAt: h.memory.createdAt,
        similarity: h.similarity,
        isScar: h.isScar,
        isPattern: h.isPattern,
        retrievalScore: h.retrievalScore,
      })),
    });
  }

  private async recordMemory(res: ServerResponse, agentId: string, body: Record<string, unknown>) {
    const situation = this.parseSituation(body.situation);
    const decision = this.parseDecision(body.decision);
    const outcome = this.parseOutcome(body.outcome);
    assertNoKeyMaterial(body, 'body');

    const memory = await evaluateAndStore(this.repo, {
      agentId,
      situation,
      decision,
      outcome,
      source: String(body.source ?? 'api'),
      decisionId: body.decisionId ? String(body.decisionId) : null,
    });
    // Post-write derivation keeps structure fresh.
    await linkPatterns(this.repo, agentId);
    await updateScars(this.repo, agentId);
    return this.json(res, 201, { memory });
  }

  private async recordDecision(res: ServerResponse, agentId: string, body: Record<string, unknown>) {
    assertNoKeyMaterial(body, 'body');
    // If the caller cites a retrieval, it must exist in THEIR tenant and
    // must actually have returned the memories they claim to have used.
    let usedMemoryIds: string[] = [];
    let retrievalId: string | null = null;
    if (body.retrievalId) {
      retrievalId = String(body.retrievalId);
      const retrieval = await this.repo.getRetrieval(agentId, retrievalId);
      if (!retrieval) {
        return this.json(res, 404, { error: 'RETRIEVAL_NOT_FOUND', message: 'no such retrieval in your memory' });
      }
      const claimed = Array.isArray(body.memoryIds) ? body.memoryIds.map(String) : [];
      usedMemoryIds = retrieval.returnedMemoryIds.filter((id) => claimed.includes(id));
      if (claimed.some((id) => !retrieval.returnedMemoryIds.includes(id))) {
        return this.json(res, 400, {
          error: 'INFLUENCE_NOT_SUPPORTED',
          message: 'cited memories were not returned by that retrieval — influence edges must be real',
        });
      }
      // Real usage counts: only memories actually used in a decision.
      if (usedMemoryIds.length > 0) {
        await markMemoryUsed(this.repo, agentId, usedMemoryIds);
      }
    }

    const decision: DecisionRecord = {
      id: `dec-${randomUUID().slice(0, 12)}`,
      agentId,
      situation: this.parseSituation(body.situation),
      action: String(body.action ?? ''),
      confidenceBase: num(body.confidenceBase),
      confidenceFinal: num(body.confidenceFinal),
      memoryInfluence: num(body.memoryInfluence ?? 0),
      reasoning: Array.isArray(body.reasoning) ? body.reasoning.map(String) : [],
      retrievalId,
      createdAt: new Date().toISOString(),
    };
    await this.repo.putDecision(agentId, decision);
    await this.repo.appendEvent(agentId, {
      type: 'decision.recorded',
      at: decision.createdAt,
      decisionId: decision.id,
      action: decision.action,
      retrievalId,
      usedMemories: usedMemoryIds.length,
    });
    return this.json(res, 201, { decision, usedMemoryIds });
  }

  private async recordOutcome(res: ServerResponse, agentId: string, body: Record<string, unknown>) {
    assertNoKeyMaterial(body, 'body');
    const decisionId = String(body.decisionId ?? '');
    const decision = await this.repo.getDecision(agentId, decisionId);
    if (!decision) {
      return this.json(res, 404, { error: 'DECISION_NOT_FOUND', message: 'no such decision in your memory' });
    }
    const outcome = this.parseOutcome(body.outcome);
    const record: OutcomeRecord = {
      id: `out-${randomUUID().slice(0, 12)}`,
      decisionId,
      agentId,
      decisionAction: decision.action,
      outcome,
      observedAt: new Date().toISOString(),
    };
    await this.repo.putOutcome(agentId, record);
    await this.repo.appendEvent(agentId, {
      type: 'outcome.recorded',
      at: record.observedAt,
      decisionId,
      result: outcome.result,
      valence: outcome.valence,
      marketOutcome: outcome.marketOutcome ?? null,
      tradeOutcome: outcome.tradeOutcome ?? null,
      evidence: outcome.evidence ?? null,
    });

    // THE LIFECYCLE LOOP: the outcome validates the memories the decision
    // actually used (decision → retrieval → cited memories), reinforcing the
    // honest ones and weakening the misleading ones.
    const validation = await validateAndAdjust(this.repo, agentId, decision, record);

    return this.json(res, 201, { outcome: record, validation });
  }

  private async getMemory(res: ServerResponse, agentId: string, id: string) {
    const memory = await this.repo.getMemory(agentId, id);
    if (!memory) return this.json(res, 404, { error: 'NOT_FOUND' });
    return this.json(res, 200, { memory });
  }

  private async history(res: ServerResponse, agentId: string) {
    const [memories, patterns, scars] = await Promise.all([
      this.repo.listMemories(agentId, { limit: 100 }),
      this.repo.listPatterns(agentId),
      this.repo.listScars(agentId),
    ]);
    return this.json(res, 200, { agentId, memories, patterns, scars });
  }

  private async activity(res: ServerResponse, agentId: string) {
    const events = await this.repo.listEvents(agentId, { limit: 100 });
    return this.json(res, 200, { agentId, events });
  }

  private async usage(res: ServerResponse, _agentId: string) {
    // Phase 7: real Usage rows on settled x402 payments. Until then the
    // honest answer is empty — nothing fabricated.
    return this.json(res, 200, { usage: [], note: 'metering arrives with the x402 gate (Phase 7)' });
  }

  private async readyz(res: ServerResponse, deep: boolean) {
    if (deep) {
      try {
        await this.repo.getMeta('cepid-platform');
      } catch {
        return this.json(res, 503, { ok: false, substrate: 'down' });
      }
    }
    return this.json(res, 200, { ok: true, service: 'cepid-api', version: 'v1' });
  }

  /* ------------------------------------------------------------ helpers -- */

  private async authenticate(req: IncomingMessage): Promise<{ agentId: string } | null> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    const key = header.slice('Bearer '.length).trim();
    return this.registry.resolveKey(key);
  }

  private parseSituation(raw: unknown): Situation {
    const s = raw as Record<string, unknown> | undefined;
    if (!s || typeof s.domain !== 'string' || typeof s.text !== 'string' || typeof s.facets !== 'object') {
      throw new CepidError('VALIDATION', 'situation {domain, text, facets} is required', 400);
    }
    return { domain: s.domain, text: s.text, facets: s.facets as Situation['facets'] };
  }

  /** The decision block of a record-experience body (evaluateAndStore input). */
  private parseDecision(raw: unknown): {
    action: string;
    confidenceBase: number;
    confidenceFinal: number;
    memoryInfluence: number;
    memoryIds: string[];
    reasoning: string[];
  } {
    const d = raw as Record<string, unknown> | undefined;
    return {
      action: String(d?.action ?? ''),
      confidenceBase: num(d?.confidenceBase),
      confidenceFinal: num(d?.confidenceFinal),
      memoryInfluence: num(d?.memoryInfluence ?? 0),
      memoryIds: Array.isArray(d?.memoryIds) ? d!.memoryIds.map(String) : [],
      reasoning: Array.isArray(d?.reasoning) ? d!.reasoning.map(String) : [],
    };
  }

  private parseOutcome(raw: unknown): MemoryOutcome {
    const o = raw as Record<string, unknown> | undefined;
    if (!o || typeof o.result !== 'string' || !o.valence) {
      throw new CepidError('VALIDATION', 'outcome {result, valence} is required', 400);
    }
    if (o.valence !== 'good' && o.valence !== 'bad' && o.valence !== 'neutral') {
      throw new CepidError('VALIDATION', 'outcome.valence must be good|bad|neutral', 400);
    }
    const out: MemoryOutcome = {
      result: o.result,
      valence: o.valence,
      metrics: (o.metrics as Record<string, number>) ?? {},
      observedAt: typeof o.observedAt === 'string' ? o.observedAt : new Date().toISOString(),
    };
    if (typeof o.magnitude === 'number') out.magnitude = o.magnitude;
    if (typeof o.marketOutcome === 'string') out.marketOutcome = o.marketOutcome;
    if (typeof o.tradeOutcome === 'string') out.tradeOutcome = o.tradeOutcome;
    if (o.evidence && typeof o.evidence === 'object') out.evidence = o.evidence as MemoryOutcome['evidence'];
    return out;
  }

  private async readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > 1_000_000) throw new CepidError('VALIDATION', 'body too large', 413);
      chunks.push(chunk as Buffer);
    }
    if (chunks.length === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new CepidError('VALIDATION', 'invalid JSON body', 400);
    }
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
    res.end(payload);
  }

  private fail(res: ServerResponse, e: unknown): void {
    if (res.headersSent) { res.end(); return; }
    if (e instanceof CepidError) {
      return this.json(res, e.status, { error: e.code, message: e.message });
    }
    if (isSubstrateUnavailable(e)) {
      return this.json(res, 503, { error: MEMORY_SUBSTRATE_UNAVAILABLE, message: (e as Error).message });
    }
    const message = e instanceof Error ? e.message : String(e);
    return this.json(res, 500, { error: 'INTERNAL', message });
  }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Boot the API against a repo + registry; resolves when listening. */
export async function startApi(deps: ApiDeps): Promise<CepidApi> {
  const api = new CepidApi(deps);
  await api.listen();
  return api;
}
