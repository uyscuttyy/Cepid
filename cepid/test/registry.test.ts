/**
 * Agent registry tests — identity, key handling, isolation.
 *
 * Runs against the real substrate (sidecar on scratch DB). The security
 * property under test: one agent can never retrieve another's private
 * memories THROUGH THE REGISTRY-PATH, and keys are only ever stored hashed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentRegistry,
  PLATFORM_TENANT,
  evaluateAndStore,
  retrieveMemories,
  type SibylRepository,
  type Situation,
  type MemoryOutcome,
} from '@cepid/server';
import { startSidecar, repoFor } from './helpers/sidecar.js';

const situation: Situation = {
  domain: 'prediction-market',
  text: 'ETH high volatility, liquidity declining, considering LONG',
  facets: { asset: 'ETH', volatility: 'high', liquidity: 'declining' },
};

const loss: MemoryOutcome = {
  result: 'LOSS', valence: 'bad', magnitude: -0.5, metrics: { pnl: -0.5 },
  marketOutcome: 'NO_WON', tradeOutcome: 'LOSS', observedAt: new Date().toISOString(),
};

test('registry: register → key issued once → resolve → isolate', async () => {
  const fx = await startSidecar();
  try {
    const repo = repoFor(fx);
    const registry = new AgentRegistry(repo);

    // 1) Registration returns a real key, exactly once.
    const { agent, issued } = await registry.register({
      name: 'Demo Trading Agent',
      description: 'The CEPID reference consumer.',
    });
    assert.ok(issued.key.startsWith('cepid_'));
    assert.ok(issued.key.length > 32);
    assert.ok(agent.id.startsWith('agent-'));
    assert.equal(agent.status, 'active');

    // 2) The key resolves to the agent.
    const resolved = await registry.resolveKey(issued.key);
    assert.ok(resolved, 'fresh key must resolve');
    assert.equal(resolved!.agentId, agent.id);

    // 3) Only the HASH is stored — scanning the whole platform tenant must
    //    not reveal the plaintext key anywhere.
    const keyRows = await repo.listRecords(PLATFORM_TENANT, 'apikey');
    assert.ok(keyRows.length >= 1);
    const serialized = JSON.stringify(keyRows);
    assert.ok(!serialized.includes(issued.key), 'plaintext key must never be stored');
    assert.ok(!serialized.includes(issued.key.slice(-20)), 'not even the secret tail');
    // the hash (name) IS there — that's the design
    assert.ok(keyRows.some((r) => String(r.id).length === 64), 'stored by sha256 name');

    // 4) Wrong keys don't resolve.
    assert.equal(await registry.resolveKey('cepid_nope'), null);
    assert.equal(await registry.resolveKey(''), null);
    assert.equal(await registry.resolveKey(issued.key.slice(0, -2) + 'zz'), null);

    // 5) A second agent registers, stores its own memory, and CANNOT see
    //    the first agent's — the isolation the registry is supposed to
    //    enforce via key→tenant resolution.
    const { agent: agentB, issued: issuedB } = await registry.register({
      name: 'Support Agent', description: 'Different domain entirely.',
    });
    assert.notEqual(agentB.id, agent.id);

    // Agent A earns a memory (through the platform path).
    await evaluateAndStore(repo, {
      agentId: agent.id, situation,
      decision: { action: 'LONG', confidenceBase: 0.7, confidenceFinal: 0.7, memoryInfluence: 0, memoryIds: [], reasoning: [] },
      outcome: loss, source: 'registry-test', decisionId: null,
    });

    // Tenant resolution: B's agentId sees nothing of A's.
    assert.equal((await repo.listMemories(agentB.id)).length, 0);
    const bHits = await retrieveMemories(repo, agentB.id, situation, { minSimilarity: 0 });
    assert.equal(bHits.length, 0, 'agent B must not retrieve agent A memories');
    const aHits = await retrieveMemories(repo, agent.id, situation, { minSimilarity: 0.3 });
    assert.ok(aHits.length > 0, 'agent A still sees its own');

    // 6) B's key does not resolve A's identity — and vice versa.
    const bResolved = await registry.resolveKey(issuedB.key);
    assert.equal(bResolved!.agentId, agentB.id);
    assert.notEqual(bResolved!.agentId, agent.id);

    // 7) Revoking the agent kills its key.
    assert.ok(await registry.revokeAgent(agent.id));
    assert.equal(await registry.resolveKey(issued.key), null, 'revoked agent key stops resolving');
  } finally {
    await fx.dispose();
  }
});

test('registry: key rotation — old key dies, new key works', async () => {
  const fx = await startSidecar();
  try {
    const repo = repoFor(fx);
    const registry = new AgentRegistry(repo);
    const { agent, issued } = await registry.register({ name: 'Rotating Agent', description: '' });

    const rotated = await registry.rotateKey(issued.key);
    assert.ok(rotated, 'rotation succeeds');
    assert.notEqual(rotated!.key, issued.key);

    // Old key is dead.
    assert.equal(await registry.resolveKey(issued.key), null);
    // New key resolves to the SAME agent.
    const resolved = await registry.resolveKey(rotated!.key);
    assert.ok(resolved);
    assert.equal(resolved!.agentId, agent.id);

    // Rotation is evented.
    const agentRow = await registry.getAgent(agent.id);
    assert.ok((agentRow!.keyCount ?? 1) >= 2, 'key count tracked');
  } finally {
    await fx.dispose();
  }
});

test('registry: registration journal + listing', async () => {
  const fx = await startSidecar();
  try {
    const repo = repoFor(fx);
    const registry = new AgentRegistry(repo);
    await registry.register({ name: 'Alpha', description: 'first' });
    await registry.register({ name: 'Beta', description: 'second' });

    const agents = await registry.listAgents();
    assert.equal(agents.length, 2);
    assert.ok(agents.every((a) => a.id.startsWith('agent-')));

    const events = await repo.listEvents(PLATFORM_TENANT, { limit: 20 });
    assert.ok(events.filter((e) => e.type === 'agent.registered').length >= 2);
  } finally {
    await fx.dispose();
  }
});
