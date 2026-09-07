import Link from 'next/link';
import { EmptyState, Figure, Figures, Ledger, Notice, PageHead, Section } from '@/components/Primitives';
import { getClient } from '@/lib/data';
import { CepidClientError } from '@/lib/cepid';
import { formatCount, formatRelative, shortId } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = { title: 'Agents' };

/**
 * AGENTS — the registry. Open to all; private data stays behind keys.
 */
export default async function AgentsPage() {
  const client = await getClient();
  let agents: Array<{
    id: string; name: string; description: string; status: 'active' | 'revoked'; createdAt: string; keyCount: number;
  }> = [];
  let error: string | null = null;

  try {
    agents = await client.listAgents();
  } catch (e) {
    error = e instanceof CepidClientError ? e.code : 'UNREACHABLE';
  }

  if (error) {
    return (
      <div>
        <PageHead filing="CEPID-003" title="Could not reach the registry" />
        <Notice title="Platform unreachable" tone="deny">
          {error === 'MEMORY_SUBSTRATE_UNAVAILABLE'
            ? 'The Sibyl sidecar is down. The agent registry lives in the substrate, so it cannot be served until the sidecar is restored.'
            : `The platform returned ${error}.`}
        </Notice>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div>
        <PageHead
          filing="CEPID-003"
          title="No agents yet"
          lede="The registry lists every agent that has been issued a key. The first step is to register one."
        />
        <EmptyState
          title="Register the first agent"
          body="The Developers page walks through registration, key storage, and the first retrieve() call against the live API."
          action={<Link href="/developers">Open Developers</Link>}
        />
      </div>
    );
  }

  const active = agents.filter((a) => a.status === 'active').length;

  return (
    <div>
      <PageHead
        filing={`CEPID-003 · ${formatCount(agents.length)} ${agents.length === 1 ? 'agent' : 'agents'} on file`}
        title="Registered agents"
        lede="Every agent below holds at least one key. Isolation is enforced server-side — one agent can never read another's memories."
      />

      <Section title="Standing">
        <Figures>
          <Figure label="Total" value={formatCount(agents.length)} />
          <Figure label="Active" value={formatCount(active)} tone={active > 0 ? 'allow' : undefined} />
          <Figure
            label="Revoked"
            value={formatCount(agents.length - active)}
            tone={agents.length - active > 0 ? 'deny' : undefined}
          />
        </Figures>
      </Section>

      <Section title="Registry">
        <Ledger>
          {agents.map((a) => (
            <Link className="ledger__row" href={`/agents/${a.id}`} key={a.id}>
              <span className="ledger__id">{shortId(a.id)}</span>
              <span>
                <span className="ledger__title">
                  {a.name}
                  {a.status === 'revoked' && (
                    <span className="ledger__sub" style={{ color: 'var(--deny)' }}>
                      revoked
                    </span>
                  )}
                </span>
                {a.description && <span className="ledger__sub">{a.description}</span>}
              </span>
              <span className="ledger__meta">
                <span className="evidence">
                  {a.keyCount} key{a.keyCount === 1 ? '' : 's'}
                </span>{' '}
                · {formatRelative(a.createdAt)}
              </span>
            </Link>
          ))}
        </Ledger>
      </Section>
    </div>
  );
}
