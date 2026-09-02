/**
 * Memory repository — the persistence seam.
 *
 * The interface is the contract. The ONLY implementation is SibylRepository
 * (see sibyl-repository.ts): Sibyl Memory via the localhost sidecar. There is
 * deliberately NO fallback store — the load-bearing gate depends on the
 * substrate being irreplaceable.
 *
 * Every method takes agentId: isolation is part of the repository contract,
 * not a caller courtesy.
 */
import { randomUUID } from 'node:crypto';
import type {
  MemoryRecord,
  PatternRecord,
  ScarRecord,
  MemoryMeta,
  RetrievalRecord,
  DecisionRecord,
  OutcomeRecord,
} from '../core/domain.js';
import { CepidError, MEMORY_SUBSTRATE_UNAVAILABLE } from '../core/errors.js';

export interface MemoryRepository {
  // Memory records (experiences)
  putMemory(agentId: string, memory: MemoryRecord): Promise<void>;
  getMemory(agentId: string, id: string): Promise<MemoryRecord | null>;
  listMemories(agentId: string, opts?: { limit?: number; since?: string; kind?: string }): Promise<MemoryRecord[]>;

  // Patterns
  putPattern(agentId: string, p: PatternRecord): Promise<void>;
  getPattern(agentId: string, id: string): Promise<PatternRecord | null>;
  listPatterns(agentId: string): Promise<PatternRecord[]>;

  // Scars
  putScar(agentId: string, s: ScarRecord): Promise<void>;
  listScars(agentId: string): Promise<ScarRecord[]>;

  // Influence chain
  putRetrieval(agentId: string, r: RetrievalRecord): Promise<void>;
  getRetrieval(agentId: string, id: string): Promise<RetrievalRecord | null>;
  putDecision(agentId: string, d: DecisionRecord): Promise<void>;
  getDecision(agentId: string, id: string): Promise<DecisionRecord | null>;
  putOutcome(agentId: string, o: OutcomeRecord): Promise<void>;
  listOutcomes(agentId: string, opts?: { limit?: number }): Promise<OutcomeRecord[]>;

  // Journal (activity) — per agent
  appendEvent(agentId: string, event: Record<string, unknown>): Promise<void>;
  listEvents(agentId: string, opts?: { limit?: number; since?: string }): Promise<Array<Record<string, unknown>>>;

  // Meta
  getMeta(agentId: string): Promise<MemoryMeta>;
  setMeta(agentId: string, meta: MemoryMeta): Promise<void>;

  // Generic record I/O (platform metadata, registry, usage rows).
  // Maps directly to Sibyl entities: (tenant, category, name) → body.
  putRecord(agentId: string, category: string, name: string, body: Record<string, unknown>): Promise<void>;
  getRecord(agentId: string, category: string, name: string): Promise<Record<string, unknown> | null>;
  listRecords(agentId: string, category: string): Promise<Array<Record<string, unknown>>>;
}

/** New memory id. */
export function newMemoryId(): string {
  return `mem-${randomUUID().slice(0, 12)}`;
}

export { CepidError, MEMORY_SUBSTRATE_UNAVAILABLE };
