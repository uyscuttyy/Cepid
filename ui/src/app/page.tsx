import Link from 'next/link';
import { EmptyState, Figure, Figures, Ledger, Notice, Section, Stamp } from '@/components/Primitives';
import { getClient } from '@/lib/data';
import { CepidClientError } from '@/lib/cepid';
import { formatCount, formatRelative } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * OVERVIEW — the whole claim on one page: the agent met the same
 * situation twice and behaved differently the second time because
 * CEPID remembered. The hero is the two verdicts, stamped.
 */
export default async function OverviewPage() {
  const client = getClient();
  const hasKey = !!process.env.CEPID_API_KEY;

  const [agents, readiness, activity] = await Promise.all([
    client.listAgents().catch((e: unknown) => ({
      _error: e instanceof CepidClientError ? e.code : 'UNREACHABLE',
    })),
    client.getReadiness().catch(() => null),
    hasKey
      ? client.getActivity('self').catch((e: unknown) => ({
          _error: e instanceof CepidClientError ? e.code : 'UNREACHABLE',
        }))
      : Promise.resolve(null),
  ]);

  const platformDown = !readiness;
  const substrateDown = readiness?.substrate !== 'ok';
  const agentList =
    agents && !('_error' in agents)
      ? (agents as Array<{ id: string; name: string; description: string; createdAt: string }>)
      : [];

  const events =
    activity && !('_error' in activity)
      ? (activity as { events: Array<Record<string, unknown>> }).events
      : [];
  const denies = events.filter((e) => e.type === 'gate.denied');
  const lastDeny = denies
    .map((e) => String(e.at ?? ''))
    .sort()
    .at(-1);
  const decisions = events.filter((e) => e.type === 'decision.recorded').length;

  return (
    <div>
      <div className="hero">
        <p className="kicker">
          <span className="filing-no">CEPID-001</span> · Memory infrastructure for autonomous agents
        </p>
        <h1 className="hero-title">An agent that remembers is an agent that can be stopped.</h1>
        <p className="lede">
          CEPID stores the situations an agent encounters, the decisions it made, and the
          outcomes that followed — then hands back the experience it needs{' '}
          <strong>before its next decision</strong>. When retrieved memory proves the
          proposed action already failed, the constraint gate returns DENY, and the agent
          does not trade.
        </p>
        <div className="hero__stamps">
          <Stamp verdict="ALLOW" size="hero" />
          <span className="hero__arrow" aria-hidden="true">
            →
          </span>
          <Stamp verdict="DENY" size="hero" lands />
        </div>
        <p className="hero__caption">
          Run 1 lost on-chain. Run 2 met the same situation and was stopped by its own
          scar. Read the docket on the <Link href="/demo">Demo</Link> page.
        </p>
      </div>

      {platformDown && (
        <Notice title="Platform unreachable" tone="deny">
          The CEPID API at <span className="evidence">CEPID_API_URL</span> did not respond.
          Set it in your environment and restart the dashboard.
        </Notice>
      )}

      {!platformDown && substrateDown && (
        <Notice title="Substrate down" tone="warn">
          The CEPID API is reachable, but the Sibyl sidecar is not. Retrieval, recording,
          and history all fail until the sidecar is restored. This is by design — the
          substrate is load-bearing.
        </Notice>
      )}

      <Section
        title="Standing of the platform"
        note={readiness ? `${readiness.service} · ${readiness.version}` : undefined}
      >
        <Figures>
          <Figure label="Agents on record" value={formatCount(agentList.length)} note="registered" />
          <Figure
            label="Decisions recorded"
            value={hasKey ? formatCount(decisions) : '—'}
            note={hasKey ? 'in this journal' : 'needs CEPID_API_KEY'}
          />
          <Figure
            label="Trades stopped"
            value={hasKey ? formatCount(denies.length) : '—'}
            tone={hasKey && denies.length > 0 ? 'deny' : undefined}
            note={lastDeny ? `last ${formatRelative(lastDeny)}` : 'no DENY on record'}
          />
          <Figure
            label="Substrate"
            value={readiness ? (readiness.substrate === 'ok' ? 'Up' : 'Down') : '—'}
            tone={readiness ? (readiness.substrate === 'ok' ? 'allow' : 'deny') : undefined}
            note="Sibyl memory layer"
          />
        </Figures>
      </Section>

      <Section title="Agents" note={<Link href="/agents">Full registry</Link>}>
        {agentList.length === 0 ? (
          <EmptyState
            title="No agents yet"
            body="The registry is empty. The first step is to register an agent — the Developers page walks through it."
            action={<Link href="/developers">Register an agent</Link>}
          />
        ) : (
          <Ledger>
            {agentList.slice(0, 10).map((a) => (
              <Link className="ledger__row" href={`/agents/${a.id}`} key={a.id}>
                <span className="ledger__id">{a.id.slice(0, 12)}</span>
                <span>
                  <span className="ledger__title">{a.name}</span>
                  {a.description && <span className="ledger__sub">{a.description}</span>}
                </span>
                <span className="ledger__meta">{formatRelative(a.createdAt)}</span>
              </Link>
            ))}
          </Ledger>
        )}
      </Section>

      {!hasKey && (
        <Section title="Read the journal">
          <EmptyState
            title="Set CEPID_API_KEY to see decisions and stops"
            body="Counts of decisions and DENY verdicts come from the bearer key's journal. Generate a key on the Developers page, set it, and restart the dashboard."
            action={<Link href="/developers">Open Developers</Link>}
          />
        </Section>
      )}
    </div>
  );
}
