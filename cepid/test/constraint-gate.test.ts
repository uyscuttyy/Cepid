/**
 * Constraint Gate tests — the deterministic ALLOW/DENY layer that sits
 * between retrieval and the agent's decision.
 *
 * The gate runs server-side after memory retrieval + ranking. It is the
 * control layer: a DENY means the agent must not submit any trade. A
 * BLOCKED DECISION must still be recorded (no trade, no market interaction,
 * no fake transaction).
 *
 * These tests exercise the gate against the real substrate so the data
 * shapes (MemoryRecord, ScarRecord, PatternRecord) match the API. They do
 * not exercise HTTP — that's covered in api.test.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  type MemoryRecord,
  type PatternRecord,
  type ScarRecord,
  type Situation,
} from '../src/core/domain.js';
import { evaluateGate, type GateInput } from '../src/memory/constraint-gate.js';
import { situationSignature } from '../src/memory/importance.js';

const baseSituation = (over: Partial<Situation['facets']> = {}): Situation => ({
  domain: 'prediction-market',
  text: 'ETH volatility high, momentum down, considering LONG',
  facets: { asset: 'ETH', volatility: 'high', momentum: 'down', ...over },
});

function makeMemory(over: Partial<MemoryRecord> & { id: string; outcome: MemoryRecord['outcome'] }): MemoryRecord {
  const now = new Date().toISOString();
  return {
    id: over.id,
    agentId: 'agent-test',
    kind: 'experience',
    situation: over.situation ?? baseSituation(),
    action: over.action ?? 'LONG',
    decision: over.decision ?? {
      action: 'LONG',
      confidenceBase: 0.6,
      confidenceFinal: 0.4,
      memoryInfluence: -0.2,
      memoryIds: [],
      reasoning: [],
    },
    outcome: over.outcome,
    importance: over.importance ?? 0.6,
    surprising: over.surprising ?? false,
    strength: over.strength ?? 0.7,
    retrievedCount: over.retrievedCount ?? 1,
    lastRetrievedAt: over.lastRetrievedAt ?? now,
    source: over.source ?? 'test',
    decisionId: 'decisionId' in over ? over.decisionId ?? null : null,
    relationships: over.relationships ?? [],
    createdAt: over.createdAt ?? now,
    updatedAt: over.updatedAt ?? now,
  };
}

function makePattern(over: Partial<PatternRecord> & { id: string; memoryIds: string[] }): PatternRecord {
  const now = new Date().toISOString();
  return {
    id: over.id,
    agentId: 'agent-test',
    description: over.description ?? 'pattern',
    signature: over.signature ?? situationSignature(baseSituation()),
    memoryIds: over.memoryIds,
    good: over.good ?? 0,
    bad: over.bad ?? 4,
    neutral: over.neutral ?? 0,
    badRate: over.badRate ?? 0.8,
    meanMagnitude: over.meanMagnitude ?? -0.5,
    strength: over.strength ?? 0.7,
    createdAt: now,
    updatedAt: now,
  };
}

function makeScar(over: Partial<ScarRecord> & { id: string; patternId: string; memoryIds: string[] }): ScarRecord {
  const now = new Date().toISOString();
  return {
    id: over.id,
    patternId: over.patternId,
    agentId: 'agent-test',
    description: over.description ?? 'scar',
    memoryIds: over.memoryIds,
    decayMultiplier: 0.25,
    strength: over.strength ?? 0.8,
    createdAt: now,
    updatedAt: now,
  };
}

function makeRetrieved(memory: MemoryRecord, opts: { similarity: number; isScar?: boolean; isPattern?: boolean }) {
  return {
    memory,
    similarity: opts.similarity,
    isScar: opts.isScar ?? false,
    isPattern: opts.isPattern ?? false,
    retrievalScore: opts.similarity,
  };
}

function makeInput(over: Partial<GateInput> = {}): GateInput {
  return {
    situation: over.situation ?? baseSituation(),
    retrieved: over.retrieved ?? [],
    patterns: over.patterns ?? [],
    scars: over.scars ?? [],
  };
}

test('no memories → ALLOW with reason "no memories"', () => {
  const r = evaluateGate(makeInput());
  assert.equal(r.verdict, 'ALLOW');
  assert.deepEqual(r.usedMemoryIds, []);
  assert.deepEqual(r.blockingMemoryIds, []);
  assert.equal(r.reason, 'no memories retrieved');
});

test('a good-outcome memory → ALLOW', () => {
  const m = makeMemory({
    id: 'mem-1',
    outcome: { result: 'WIN', valence: 'good', magnitude: 5, metrics: {}, observedAt: new Date().toISOString() },
  });
  const r = evaluateGate(makeInput({ retrieved: [makeRetrieved(m, { similarity: 0.9 })] }));
  assert.equal(r.verdict, 'ALLOW');
  assert.deepEqual(r.usedMemoryIds, []);
  assert.deepEqual(r.blockingMemoryIds, []);
});

test('a bad-outcome memory with similarity 0.7+ → DENY with that memory as blocking', () => {
  const m = makeMemory({
    id: 'mem-bad-1',
    outcome: { result: 'LOSS', valence: 'bad', magnitude: -3, metrics: {}, observedAt: new Date().toISOString() },
  });
  const r = evaluateGate(makeInput({ retrieved: [makeRetrieved(m, { similarity: 0.7 })] }));
  assert.equal(r.verdict, 'DENY');
  assert.deepEqual(r.usedMemoryIds, ['mem-bad-1']);
  assert.deepEqual(r.blockingMemoryIds, ['mem-bad-1']);
  assert.equal(r.blockedBy, 'bad-experience');
});

test('a bad-outcome memory with similarity < 0.7 → ALLOW (not materially similar)', () => {
  const m = makeMemory({
    id: 'mem-far',
    situation: { domain: 'prediction-market', text: 'BTC up', facets: { asset: 'BTC', volatility: 'low', momentum: 'up' } },
    outcome: { result: 'LOSS', valence: 'bad', magnitude: -3, metrics: {}, observedAt: new Date().toISOString() },
  });
  const r = evaluateGate(makeInput({ retrieved: [makeRetrieved(m, { similarity: 0.4 })] }));
  assert.equal(r.verdict, 'ALLOW');
});

test('a strong matching scar (strength ≥ 0.6) → DENY, blocking = scar memoryIds', () => {
  const scar = makeScar({ id: 'scar-1', patternId: 'pat-1', memoryIds: ['mem-x', 'mem-y'], strength: 0.7 });
  const pat = makePattern({ id: 'pat-1', memoryIds: ['mem-x', 'mem-y'], strength: 0.7 });
  const r = evaluateGate(makeInput({ scars: [scar], patterns: [pat] }));
  assert.equal(r.verdict, 'DENY');
  assert.equal(r.blockedBy, 'scar');
  assert.deepEqual(r.blockingMemoryIds.sort(), ['mem-x', 'mem-y']);
});

test('a weak scar (strength < 0.6) with a weak pattern → ALLOW', () => {
  const scar = makeScar({ id: 'scar-weak', patternId: 'pat-1', memoryIds: ['mem-x'], strength: 0.4 });
  const pat = makePattern({ id: 'pat-1', memoryIds: ['mem-x'], strength: 0.4, badRate: 0.3, bad: 1 });
  const r = evaluateGate(makeInput({ scars: [scar], patterns: [pat] }));
  assert.equal(r.verdict, 'ALLOW');
});

test('a matching pattern with badRate ≥ 0.66 and bad ≥ 3 → DENY', () => {
  const pat = makePattern({ id: 'pat-1', memoryIds: ['mem-a', 'mem-b', 'mem-c'], badRate: 0.7, bad: 4, strength: 0.6 });
  const r = evaluateGate(makeInput({ patterns: [pat] }));
  assert.equal(r.verdict, 'DENY');
  assert.equal(r.blockedBy, 'pattern');
  assert.deepEqual(r.blockingMemoryIds.sort(), ['mem-a', 'mem-b', 'mem-c']);
});

test('a pattern that does not meet the badRate/bad thresholds → ALLOW', () => {
  const pat = makePattern({ id: 'pat-1', memoryIds: ['mem-a'], badRate: 0.4, bad: 1, strength: 0.7 });
  const r = evaluateGate(makeInput({ patterns: [pat] }));
  assert.equal(r.verdict, 'ALLOW');
});

test('scar match wins over pattern match in priority, but blocking ids are a union when both apply', () => {
  const scar = makeScar({ id: 'scar-1', patternId: 'pat-1', memoryIds: ['mem-scar'], strength: 0.7 });
  const pat = makePattern({ id: 'pat-1', memoryIds: ['mem-pat'], badRate: 0.7, bad: 4, strength: 0.6 });
  const r = evaluateGate(makeInput({ scars: [scar], patterns: [pat] }));
  assert.equal(r.verdict, 'DENY');
  assert.deepEqual(r.blockingMemoryIds.sort(), ['mem-pat', 'mem-scar']);
});

test('a bad-experience with low similarity does not block even if a scar exists', () => {
  const far_bad = makeMemory({
    id: 'mem-far-bad',
    situation: { domain: 'prediction-market', text: 'BTC up', facets: { asset: 'BTC', volatility: 'low', momentum: 'up' } },
    outcome: { result: 'LOSS', valence: 'bad', magnitude: -3, metrics: {}, observedAt: new Date().toISOString() },
  });
  const r = evaluateGate(makeInput({ retrieved: [makeRetrieved(far_bad, { similarity: 0.3 })] }));
  assert.equal(r.verdict, 'ALLOW');
});

test('isolation: a scar from a different signature does not block', () => {
  const scar = makeScar({ id: 'scar-other', patternId: 'pat-other', memoryIds: ['mem-other'], strength: 0.9 });
  const pat = makePattern({ id: 'pat-other', memoryIds: ['mem-other'], strength: 0.9, signature: 'other-domain|asset:X' });
  const r = evaluateGate(makeInput({ scars: [scar], patterns: [pat] }));
  assert.equal(r.verdict, 'ALLOW');
  assert.deepEqual(r.blockingMemoryIds, []);
});
