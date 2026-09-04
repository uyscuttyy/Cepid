/**
 * Typed client over the CEPID /v1/* API.
 *
 * This is the seam between the dashboard and the live server. It does exactly
 * one thing: turn the routes the platform exposes into well-typed functions,
 * and refuse to call anything the server does not serve. There is no in-memory
 * cache, no retry logic, no LLM seam — those belong to higher layers if and
 * when they earn their keep.
 *
 * Auth: the bearer key is attached to every request except `register` and the
 * open liveness routes (`/healthz`, `/readyz`). The server resolves the key
 * to an agentId and scopes every response to that agent's tenant — callers
 * never state tenants, and the client does not either.
 *
 * The client is injectable: a `fetch` function can be passed in for tests.
 * In production it uses the global `fetch` (Node 18+).
 *
 * Errors: any non-2xx response is surfaced as a `CepidClientError` with the
 * server's `code` and `message`. The UI reads `code` to drive honest
 * empty/down states (e.g. `MEMORY_SUBSTRATE_UNAVAILABLE`).
 */

// ----- Types mirror @cepid/server's domain.ts + registry/registry.ts -----

export interface AgentRecord {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'revoked';
  createdAt: string;
  keyCount: number;
}

export interface Situation {
  domain: string;
  text: string;
  facets: Record<string, string | number>;
}

export type MemoryKind = 'experience' | 'pattern' | 'scar' | 'strategy-note';

export type MemoryEdge = {
  targetId: string;
  relation: 'related-to' | 'contributes-to' | 'contradicts' | 'pattern-of' | 'scarred-by';
  weight: number;
};

export interface MemoryOutcome {
  result: string;
  valence: 'good' | 'bad' | 'neutral';
  magnitude?: number;
  metrics: Record<string, number>;
  marketOutcome?: string;
  tradeOutcome?: string;
  evidence?: { chain?: string; txHash?: string; blockNumber?: number; externalRef?: string };
  observedAt: string;
}

export interface MemoryRecord {
  id: string;
  agentId: string;
  kind: MemoryKind;
  situation: Situation;
  action: string;
  decision: {
    action: string;
    confidenceBase: number;
    confidenceFinal: number;
    memoryInfluence: number;
    memoryIds: string[];
    reasoning: string[];
  };
  outcome: MemoryOutcome | null;
  importance: number;
  surprising: boolean;
  strength: number;
  retrievedCount: number;
  lastRetrievedAt: string | null;
  source: string;
  relationships: MemoryEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface PatternRecord {
  id: string;
  agentId: string;
  description: string;
  signature: string;
  memoryIds: string[];
  good: number;
  bad: number;
  neutral: number;
  badRate: number;
  meanMagnitude: number;
  strength: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScarRecord {
  id: string;
  patternId: string;
  agentId: string;
  description: string;
  memoryIds: string[];
  decayMultiplier: number;
  strength: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentHistory {
  agentId: string;
  memories: MemoryRecord[];
  patterns: PatternRecord[];
  scars: ScarRecord[];
}

export type AgentEvent = {
  type: string;
  at: string;
  [key: string]: unknown;
};

export interface ActivityResponse {
  agentId: string;
  events: AgentEvent[];
}

/** A settled x402 payment recorded by the API on /v1/memories/query. */
export interface UsageRow {
  type: 'usage.settled';
  at: string;
  agentId: string;
  route: string;
  price: string;
  payTo: string | null;
  txHash: string | null;
  payer: string | null;
}

export interface UsageResponse {
  usage: UsageRow[];
  count: number;
  note?: string;
}

export interface ReadinessResponse {
  ok: boolean;
  /** 'down' when the sidecar is unreachable; 'ok' otherwise. */
  substrate: 'ok' | 'down';
  service: string;
  version: string;
}

export interface RegisterResponse {
  agent: AgentRecord;
  /** Plaintext key — shown once, never stored. */
  apiKey: string;
  keyPrefix: string;
  keyLast4: string;
  warning: string;
}

// ----- Client -----

export class CepidClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'CepidClientError';
    this.status = status;
    this.code = code;
  }
}

export interface CepidClientOptions {
  baseUrl: string;
  /** Omit for unauthenticated calls (register, liveness). */
  apiKey?: string;
  fetch?: typeof fetch;
}

export interface CepidClient {
  /** Open — no auth. Returns the registered agent + the one-time key. */
  register(input: { name: string; description: string }): Promise<RegisterResponse>;
  /** Open — liveness + sidecar health. */
  getReadiness(): Promise<ReadinessResponse>;
  /** Auth — all platform data is scoped to the bearer key's agent. */
  listAgents(): Promise<AgentRecord[]>;
  getAgentHistory(agentId: string): Promise<AgentHistory>;
  getActivity(agentId: string): Promise<ActivityResponse>;
  getUsage(agentId: string): Promise<UsageResponse>;
  getMemory(agentId: string, memoryId: string): Promise<MemoryRecord>;
}

const OPEN_PATHS = new Set(['/v1/agents/register', '/healthz', '/readyz']);

export function createCepidClient(opts: CepidClientOptions): CepidClient {
  const base = opts.baseUrl.replace(/\/+$/, '');
  const f = opts.fetch ?? globalThis.fetch;
  if (typeof f !== 'function') {
    throw new Error('CepidClient: no fetch available (Node 18+ or pass { fetch })');
  }

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (!OPEN_PATHS.has(path) && opts.apiKey) {
      headers.authorization = `Bearer ${opts.apiKey}`;
    }
    let initBody: string | undefined;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      initBody = JSON.stringify(body);
    }
    const res = await f(`${base}${path}`, { method, headers, body: initBody });
    const text = await res.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // Non-JSON error body: surface as a generic internal error.
        if (!res.ok) {
          throw new CepidClientError(res.status, 'INTERNAL', text.slice(0, 500));
        }
        throw new Error(`CepidClient: non-JSON response from ${path}`);
      }
    }
    if (!res.ok) {
      const err = (parsed ?? {}) as { error?: string; message?: string };
      const code = err.error ?? `HTTP_${res.status}`;
      const message = err.message ?? res.statusText ?? 'request failed';
      throw new CepidClientError(res.status, code, message);
    }
    return parsed as T;
  }

  return {
    register(input) {
      return call('POST', '/v1/agents/register', input);
    },
    async getReadiness() {
      const r = await call<{ ok: boolean; service: string; version: string; substrate?: 'down' }>(
        'GET',
        '/readyz',
      );
      return {
        ok: r.ok,
        service: r.service,
        version: r.version,
        substrate: r.substrate === 'down' ? 'down' : 'ok',
      };
    },
    listAgents() {
      return call<{ agents: AgentRecord[] }>('GET', '/v1/agents').then((r) => r.agents);
    },
    getAgentHistory(_agentId: string) {
      // The server scopes by the bearer key, not the agentId in the URL —
      // but we keep the parameter for type clarity at call sites.
      return call<AgentHistory>('GET', '/v1/agents/history');
    },
    getActivity(_agentId: string) {
      return call<ActivityResponse>('GET', '/v1/activity');
    },
    getUsage(_agentId: string) {
      return call<UsageResponse>('GET', '/v1/usage');
    },
    getMemory(_agentId: string, memoryId: string) {
      return call<{ memory: MemoryRecord }>('GET', `/v1/memories/${encodeURIComponent(memoryId)}`).then(
        (r) => r.memory,
      );
    },
  };
}
