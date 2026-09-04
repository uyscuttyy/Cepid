import Link from 'next/link';
import { Band, EmptyState, Metric, Metrics, PageHead, Notice } from '@/components/Primitives';
import { getClient } from '@/lib/data';
import { CepidClientError } from '@/lib/cepid';
import { DASH, formatCount, formatRelative, shortId } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = { title: 'Agents' };

/**
 * AGENTS — the registry of every agent that has been issued a key.
 *
 * This view is open: listing agents does not require a key. Once an agent
 * is selected, the per-agent page (when authenticated as that agent) reads
 * its memory, activity, and usage.
 */
export default async function AgentsPage() {
  const client = getClient();
  let agents: Array<{ id: string; name: string; description: string; status: 'active' | 'revoked'; createdAt: string; keyCount: number }> = [];
  let error: string | null = null;

  try {
    agents = await client.listAgents();
  } catch (e) {
    error = e instanceof CepidClientError ? e.code : 'UNREACHABLE';
  }

  if (error) {
    return (
      <div className="page">
        <PageHead eyebrow="Agents" title="Could not reach the registry" />
        <Notice title="Platform unreachable" tone="neg">
          {error === 'MEMORY_SUBSTRATE_UNAVAILABLE'
            ? 'The Sibyl sidecar is down. The agent registry lives in the substrate, so it cannot be served until the sidecar is restored.'
            : `The platform returned ${error}.`}
        </Notice>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="page">
        <PageHead
          eyebrow="Agents"
          title="No agents yet"
          sub="The registry is the list of every agent that has been issued a key. The first step is to register one."
        />
        <EmptyState
          title="Register the first agent"
          body="The Developers page walks through registration, key storage, and the first retrieve() call against the live API."
          action={
            <Link className="link" href="/developers">
              Open Developers →
            </Link>
          }
        />
      </div>
    );
  }

  const active = agents.filter((a) => a.status === 'active').length;

  return (
    <div className="page">
      <PageHead
        eyebrow="Agents"
        aside={
          <span className="mono">
            {formatCount(agents.length)} {agents.length === 1 ? 'agent' : 'agents'}
          </span>
        }
        title="Registered agents"
        sub="Every agent below has at least one key. Tenant isolation is enforced server-side — one agent can never read another's memories."
      />

      <Band tight>
        <Metrics>
          <Metric label="Total" value={formatCount(agents.length)} />
          <Metric label="Active" value={formatCount(active)} tone={active > 0 ? 'pos' : 'muted'} />
          <Metric
            label="Revoked"
            value={formatCount(agents.length - active)}
            tone={agents.length - active > 0 ? 'neg' : 'muted'}
          />
          <Metric label="Keys issued" value={DASH} sub="sum across agents" />
        </Metrics>
      </Band>

      <Band title="Registry">
        <div className="rows rows--memories">
          {agents.map((a) => (
            <Link className="row row--link" href={`/agents/${a.id}`} key={a.id}>
              <span className="row__lead">{shortId(a.id)}</span>
              <span className="row__main">
                <span className="row__title">
                  {a.name}
                  {a.status === 'revoked' && <span className="chip chip--neg" style={{ marginLeft: 'var(--s-3)' }}>revoked</span>}
                </span>
                {a.description && <span className="row__sub">{a.description}</span>}
              </span>
              <span className="row__trail">
                <span style={{ color: 'var(--text-3)' }}>{a.keyCount} key{a.keyCount === 1 ? '' : 's'}</span>
                <span style={{ color: 'var(--text-3)' }}>{formatRelative(a.createdAt)}</span>
              </span>
            </Link>
          ))}
        </div>
      </Band>
    </div>
  );
}
