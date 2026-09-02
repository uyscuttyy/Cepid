/**
 * Agent registry — identity for memory consumers.
 *
 * The agent IS the identity (no user accounts, no PII — deliberate).
 * Registration mints an API key shown ONCE; only its SHA-256 hash is
 * stored, under the platform tenant `cepid-platform`. agentId maps 1:1 to a
 * Sibyl tenant (verified in Phase 2 probes: arbitrary string ids, hard
 * isolation). Every request resolves key → agentId → tenant server-side;
 * callers never state tenants.
 *
 * Storage: plain entities in the platform tenant.
 *   category 'agent'   name = agentId   → AgentRecord
 *   category 'apikey'  name = keyHash  → ApiKeyRecord
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { MemoryRepository } from '../repository/repository.js';

export const PLATFORM_TENANT = 'cepid-platform';

export interface AgentRecord {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'revoked';
  createdAt: string;
  keyCount: number;
}

export interface ApiKeyRecord {
  agentId: string;
  prefix: string;
  last4: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface IssuedKey {
  /** Plaintext key — shown once, never stored anywhere. */
  key: string;
  agentId: string;
  prefix: string;
  last4: string;
}

const KEY_PREFIX_LEN = 6;
const KEY_SECRET_LEN = 32;

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function mintKey(): { key: string; prefix: string; last4: string } {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (n: number) =>
    Array.from(randomBytes(n)).map((b) => alphabet[b % alphabet.length]).join('');
  const prefix = pick(KEY_PREFIX_LEN);
  const secret = pick(KEY_SECRET_LEN);
  const key = `cepid_${prefix}${secret}`;
  return { key, prefix, last4: key.slice(-4) };
}

export class AgentRegistry {
  constructor(private readonly repo: MemoryRepository) {}

  /** Register a new agent; returns the one-time key. */
  async register(input: { name: string; description: string }): Promise<{ agent: AgentRecord; issued: IssuedKey }> {
    if (!input.name || input.name.trim().length === 0 || input.name.length > 128) {
      throw new Error('Agent name is required (1–128 chars)');
    }
    const agentId = `agent-${randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();

    const agent: AgentRecord = {
      id: agentId,
      name: input.name.trim(),
      description: (input.description ?? '').slice(0, 512),
      status: 'active',
      createdAt: now,
      keyCount: 1,
    };

    const { key, prefix, last4 } = mintKey();
    const apiKey: ApiKeyRecord = {
      agentId,
      prefix,
      last4,
      createdAt: now,
      revokedAt: null,
    };

    await this.repo.putRecord(PLATFORM_TENANT, 'agent', agentId, { ...agent });
    await this.repo.putRecord(PLATFORM_TENANT, 'apikey', sha256(key), { ...apiKey });
    await this.repo.appendEvent(PLATFORM_TENANT, {
      type: 'agent.registered',
      at: now,
      agentId,
      name: agent.name,
      description: agent.description,
    });

    return { agent, issued: { key, agentId, prefix, last4 } };
  }

  /** Resolve a plaintext key → agentId. Null when unknown, revoked, or agent revoked. */
  async resolveKey(key: string): Promise<{ agentId: string; prefix: string } | null> {
    if (!key.startsWith('cepid_')) return null;
    const row = await this.repo.getRecord(PLATFORM_TENANT, 'apikey', sha256(key));
    if (!row) return null;
    if (row.revokedAt) return null;
    const agentId = row.agentId as string;
    const agent = await this.getAgent(agentId);
    if (!agent || agent.status !== 'active') return null;
    return { agentId, prefix: row.prefix as string };
  }

  async getAgent(agentId: string): Promise<AgentRecord | null> {
    const row = await this.repo.getRecord(PLATFORM_TENANT, 'agent', agentId);
    if (!row) return null;
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string) ?? '',
      status: row.status as AgentRecord['status'],
      createdAt: row.createdAt as string,
      keyCount: (row.keyCount as number) ?? 1,
    };
  }

  async listAgents(): Promise<AgentRecord[]> {
    const rows = await this.repo.listRecords(PLATFORM_TENANT, 'agent');
    return rows
      .map((row) => ({
        id: row.id as string,
        name: row.name as string,
        description: (row.description as string) ?? '',
        status: row.status as AgentRecord['status'],
        createdAt: row.createdAt as string,
        keyCount: (row.keyCount as number) ?? 1,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Rotate: revoke the old key (if given) and mint a new one. */
  async rotateKey(oldKey: string): Promise<IssuedKey | null> {
    const resolved = await this.resolveKey(oldKey);
    if (!resolved) return null;
    const agentId = resolved.agentId;

    await this.repo.putRecord(PLATFORM_TENANT, 'apikey', sha256(oldKey), {
      agentId,
      prefix: resolved.prefix,
      last4: oldKey.slice(-4),
      createdAt: new Date().toISOString(),
      revokedAt: new Date().toISOString(),
    });

    const { key, prefix, last4 } = mintKey();
    await this.repo.putRecord(PLATFORM_TENANT, 'apikey', sha256(key), {
      agentId, prefix, last4,
      createdAt: new Date().toISOString(),
      revokedAt: null,
    });
    const agent = await this.getAgent(agentId);
    if (agent) {
      await this.repo.putRecord(PLATFORM_TENANT, 'agent', agentId, { ...agent, keyCount: agent.keyCount + 1 });
    }
    return { key, agentId, prefix, last4 };
  }

  async revokeAgent(agentId: string): Promise<boolean> {
    const agent = await this.getAgent(agentId);
    if (!agent) return false;
    await this.repo.putRecord(PLATFORM_TENANT, 'agent', agentId, { ...agent, status: 'revoked' });
    await this.repo.appendEvent(PLATFORM_TENANT, {
      type: 'agent.revoked',
      at: new Date().toISOString(),
      agentId,
    });
    return true;
  }
}

export { sha256 as hashKey };
