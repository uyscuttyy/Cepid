/**
 * CEPID core domain — the generic memory schema.
 *
 * These types are agent-agnostic and domain-agnostic on purpose. CEPID is a
 * memory layer for ANY autonomous agent; trading is the first profile and its
 * vocabulary lives in the demo agent, never here. If you find yourself adding
 * ETH, PnL, or trade directions to this file, stop — that belongs in a
 * consumer's own types.
 *
 * Correctness rules encoded here (architecture.md §6):
 *  - `marketOutcome` (what the environment resolved to) and `tradeOutcome`
 *    (whether the agent's action was right) are SEPARATE fields. They are
 *    never inferred from each other.
 *  - Metrics (PnL for trading, or anything else) are independent and are the
 *    source of truth for the financial/result magnitude.
 *  - `valence` is the agent's own declaration of whether an outcome was good,
 *    bad, or neutral for it — the platform never guesses it.
 */

/* -------------------------------------------------------------------------- */
/* Situations                                                                  */
/* -------------------------------------------------------------------------- */

/** What an agent encountered. The unit every memory is keyed against. */
export interface Situation {
  /** Domain identifier, e.g. 'prediction-market', 'support', 'ops'. */
  domain: string;
  /** Free-form description of the situation. Full-text search target. */
  text: string;
  /** Typed, comparable features. Schema is per-domain; CEPID compares shared keys. */
  facets: Record<string, string | number>;
}

/** A situation with only the fields the agent knows so far. */
export type SituationInput = Situation;

/* -------------------------------------------------------------------------- */
/* Memory records                                                              */
/* -------------------------------------------------------------------------- */

export type MemoryKind = 'experience' | 'pattern' | 'scar' | 'strategy-note';

/** Typed edge between two memories. */
export interface MemoryEdge {
  targetId: string;
  relation: 'related-to' | 'contributes-to' | 'contradicts' | 'pattern-of' | 'scarred-by';
  weight: number;
}

/**
 * The atomic memory unit: one experienced situation, what the agent did,
 * what happened, and what was learned — plus the lifecycle fields CEPID
 * maintains (importance, strength, retrieval history).
 */
export interface MemoryRecord {
  id: string;
  /** Owning agent. Maps 1:1 to a Sibyl tenant. Never shared across agents. */
  agentId: string;
  kind: MemoryKind;
  situation: Situation;
  /** What the agent did (agent vocabulary, e.g. 'LONG', 'refund', 'NO_TRADE'). */
  action: string;
  decision: {
    action: string;
    confidenceBase: number;
    confidenceFinal: number;
    memoryInfluence: number;
    /** Memories that participated in this decision. */
    memoryIds: string[];
    reasoning: string[];
  };
  outcome: MemoryOutcome | null;
  /** Deterministic importance in [0, 1]. */
  importance: number;
  /** Whether the outcome defied the agent's expectation. */
  surprising: boolean;
  /** Current activation in [0, 1]; decays over time, reinforced by validated use. */
  strength: number;
  /** How many times this memory has been returned AND used in a decision. */
  retrievedCount: number;
  lastRetrievedAt: string | null;
  /** Which run/source produced this memory. */
  source: string;
  relationships: MemoryEdge[];
  createdAt: string;
  updatedAt: string;
}

/** The outcome side of an experience. Both outcome kinds are independent. */
export interface MemoryOutcome {
  /** Agent-vocabulary result, e.g. 'LOSS', 'WIN', 'resolved'. */
  result: string;
  /** Agent-declared polarity. CEPID never infers this. */
  valence: 'good' | 'bad' | 'neutral';
  /**
   * Signed, domain-defined magnitude (PnL for trading). Positive = good for
   * the agent, negative = bad. Optional because some outcomes are qualitative.
   */
  magnitude?: number;
  /** Additional numeric facts (pnl, latency, size, …). */
  metrics: Record<string, number>;
  /** What the environment resolved to, in the domain's own vocabulary. */
  marketOutcome?: string;
  /** Whether the agent's action was right, in the domain's own vocabulary. */
  tradeOutcome?: string;
  /** On-chain or external evidence, when the action touched a chain/system. */
  evidence?: {
    chain?: string;
    txHash?: string;
    blockNumber?: number;
    externalRef?: string;
  };
  observedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Patterns and scars (derived memories)                                      */
/* -------------------------------------------------------------------------- */

/** Coarse, deterministic fingerprint of a situation for pattern grouping. */
export interface PatternRecord {
  id: string;
  agentId: string;
  description: string;
  /** The facet signature this pattern is anchored on. */
  signature: string;
  memoryIds: string[];
  good: number;
  bad: number;
  neutral: number;
  /** bad / (good + bad + neutral with settled outcomes). */
  badRate: number;
  /** Mean signed magnitude across contributing experiences. */
  meanMagnitude: number;
  /** [0,1]; grows with sample count and outcome extremity. */
  strength: number;
  createdAt: string;
  updatedAt: string;
}

/** A meaningful repeated failure that should influence future decisions. */
export interface ScarRecord {
  id: string;
  patternId: string;
  agentId: string;
  description: string;
  memoryIds: string[];
  /** Scars decay at this fraction of the ordinary rate. */
  decayMultiplier: number;
  strength: number;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Retrieval, decisions, outcomes (the influence chain)                       */
/* -------------------------------------------------------------------------- */

/** One ranked memory returned by a retrieval. */
export interface RetrievedMemory {
  memory: MemoryRecord;
  /** Facet + text similarity in [0, 1]. */
  similarity: number;
  isScar: boolean;
  isPattern: boolean;
  /** Final ranking score after boosts. */
  retrievalScore: number;
}

/** A record that a query happened and what it returned. Real counts only. */
export interface RetrievalRecord {
  id: string;
  agentId: string;
  /** The situation the agent asked about. */
  situation: Situation;
  returnedMemoryIds: string[];
  /** Scores at retrieval time — the audit snapshot. */
  ranking: Array<{ memoryId: string; similarity: number; retrievalScore: number }>;
  occurredAt: string;
}

/** What the agent decided after (possibly) consulting memory. */
export interface DecisionRecord {
  id: string;
  agentId: string;
  situation: Situation;
  action: string;
  confidenceBase: number;
  confidenceFinal: number;
  memoryInfluence: number;
  reasoning: string[];
  /** The retrieval this decision used — the influence edge. */
  retrievalId: string | null;
  createdAt: string;
}

/** What actually happened after a decision. */
export interface OutcomeRecord {
  id: string;
  decisionId: string;
  agentId: string;
  decisionAction: string;
  outcome: MemoryOutcome;
  observedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Metering (Phase 7 populates this; the seam exists now)                      */
/* -------------------------------------------------------------------------- */

export interface UsageRecord {
  id: string;
  agentId: string;
  route: string;
  /** 'free' until x402 lands; then the settled amount. */
  amount: number;
  unit: string;
  paymentRef: string | null;
  at: string;
}

/* -------------------------------------------------------------------------- */
/* Repository metadata                                                        */
/* -------------------------------------------------------------------------- */

export interface MemoryMeta {
  experienceCount: number;
  patternCount: number;
  scarCount: number;
  lastDecayAt: string;
  /** Median |magnitude| across settled experiences; scales importance. */
  magnitudeScale: number;
}

export const DEFAULT_MEMORY_META: MemoryMeta = {
  experienceCount: 0,
  patternCount: 0,
  scarCount: 0,
  lastDecayAt: '',
  magnitudeScale: 0.1,
};
