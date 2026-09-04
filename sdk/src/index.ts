/**
 * @cepid/client — the SDK every agent uses, ours included.
 *
 *   const cepid = new CepidClient({ baseUrl, apiKey });
 *   const { memories, retrievalId } = await cepid.retrieve({ situation });
 *   const { decision } = await cepid.recordDecision({ retrievalId, memoryIds, action, … });
 *   await cepid.recordOutcome({ decisionId, outcome });
 *
 * Phase 7 adds the x402 buyer loop inside retrieve() — a 402 response
 * triggers sign+retry automatically when a payer account is configured. The
 * fetch wrapper here is the seam it drops into.
 */

export interface Situation {
  domain: string;
  text: string;
  facets: Record<string, string | number>;
}

export interface RetrievedMemoryView {
  id: string;
  situation: Situation;
  action: string;
  outcome: {
    result: string;
    valence: string;
    metrics: Record<string, number>;
    marketOutcome?: string;
    tradeOutcome?: string;
    magnitude?: number;
    evidence?: { chain?: string; txHash?: string; blockNumber?: number };
  } | null;
  importance: number;
  strength: number;
  retrievedCount: number;
  surprising: boolean;
  createdAt: string;
  similarity: number;
  isScar: boolean;
  isPattern: boolean;
  retrievalScore: number;
}

export interface RetrieveResult {
  retrievalId: string;
  memories: RetrievedMemoryView[];
}

export interface DecisionInput {
  retrievalId?: string;
  memoryIds?: string[];
  situation: Situation;
  action: string;
  confidenceBase: number;
  confidenceFinal: number;
  memoryInfluence?: number;
  reasoning?: string[];
}

export interface OutcomeInput {
  decisionId: string;
  outcome: {
    result: string;
    valence: 'good' | 'bad' | 'neutral';
    magnitude?: number;
    metrics?: Record<string, number>;
    marketOutcome?: string;
    tradeOutcome?: string;
    evidence?: { chain?: string; txHash?: string; blockNumber?: number };
    /** ISO 8601. Optional — the platform defaults to now if absent. */
    observedAt?: string;
  };
}

export interface RecordExperienceInput {
  situation: Situation;
  decision: {
    action: string;
    confidenceBase: number;
    confidenceFinal: number;
    memoryInfluence?: number;
    memoryIds?: string[];
    reasoning?: string[];
  };
  outcome: OutcomeInput['outcome'] & { observedAt?: string };
  source?: string;
  decisionId?: string;
}

export interface RegisterResult {
  agent: { id: string; name: string; description: string; status: string; createdAt: string; keyCount: number };
  apiKey: string;
  keyPrefix: string;
  keyLast4: string;
}

export class CepidError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

/**
 * Build an x402-paying fetch for the demo agent (and any agent that wants
 * paid retrieval without writing payment code). Requires viem +
 * @x402/fetch + @x402/evm — the demo agent passes its signer; external
 * agents can do the same or bring their own payment layer.
 *
 * Phase 7: the 402 → sign → retry loop runs INSIDE the returned fetch.
 */
export async function buildPayingFetch(
  payerPrivateKey: `0x${string}`,
  rpcUrl: string = 'https://sepolia.base.org',
): Promise<typeof globalThis.fetch> {
  const { privateKeyToAccount } = await import('viem/accounts');
  const { createPublicClient, http } = await import('viem');
  const { baseSepolia } = await import('viem/chains');
  const { x402Client } = await import('@x402/core/client');
  const { registerExactEvmScheme } = await import('@x402/evm/exact/client');
  const { wrapFetchWithPayment } = await import('@x402/fetch');

  const account = privateKeyToAccount(payerPrivateKey);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const client = new x402Client();
  registerExactEvmScheme(client, {
    signer: account as never,
    schemeOptions: { 84532: { rpcUrl } },
    networks: ['eip155:84532' as const],
  });
  void publicClient;
  return wrapFetchWithPayment(fetch, client);
}

export interface CepidClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Phase 7: payer account for x402-paid routes. Optional until then. */
  payer?: unknown;
}

export class CepidClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(opts: CepidClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
  }

  /** POST /v1/agents/register — static helper; the key comes back once. */
  static async register(baseUrl: string, input: { name: string; description: string }): Promise<{
    agent: { id: string; name: string; description: string; status: string; createdAt: string; keyCount: number };
    apiKey: string;
    keyPrefix: string;
    keyLast4: string;
  }> {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/agents/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new CepidError(res.status, 'REGISTER_FAILED', `registration failed (${res.status}): ${body}`);
    }
    const body = (await res.json()) as RegisterResult;
    return body;
  }

  async retrieve(input: { situation: Situation; limit?: number; minSimilarity?: number }): Promise<RetrieveResult> {
    return this.post('/v1/memories/query', input);
  }

  async recordExperience(input: RecordExperienceInput): Promise<{ memory: unknown }> {
    return this.post('/v1/memories', input);
  }

  async recordDecision(input: DecisionInput): Promise<{ decision: { id: string }; usedMemoryIds: string[] }> {
    return this.post('/v1/decisions', input);
  }

  async recordOutcome(input: OutcomeInput): Promise<{ outcome: unknown }> {
    return this.post('/v1/outcomes', input);
  }

  async getMemory(id: string): Promise<{ memory: unknown }> {
    return this.get(`/v1/memories/${encodeURIComponent(id)}`);
  }

  async history(): Promise<unknown> {
    return this.get('/v1/agents/history');
  }

  async activity(): Promise<unknown> {
    return this.get('/v1/activity');
  }

  /* ------------------------------------------------------------- transport */

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    return this.interpret<T>(res);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { authorization: `Bearer ${this.apiKey}` },
    });
    return this.interpret<T>(res);
  }

  /**
   * Phase 7 hooks here: a 402 with PAYMENT-REQUIRED headers triggers the
   * x402 sign+retry loop before surfacing the error. Until then 402 is an
   * ordinary failure.
   */
  private async interpret<T>(res: Response): Promise<T> {
    if (res.ok) return res.json() as Promise<T>;
    const body = await res.json().catch(() => ({}));
    const code = (body as Record<string, unknown>).error ?? `HTTP_${res.status}`;
    const message = (body as Record<string, unknown>).message ?? res.statusText;
    throw new CepidError(res.status, String(code), String(message), body);
  }
}
