import Link from 'next/link';
import {
  Band,
  EmptyState,
  InlineFact,
  Metric,
  Metrics,
  Notice,
  PageHead,
} from '@/components/Primitives';
import { getClient } from '@/lib/data';
import { CepidClientError } from '@/lib/cepid';
import { formatCount, formatRelative, formatClock, shortId, DASH } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * OVERVIEW — what CEPID remembers, right now.
 *
 * The product's whole claim is "the agent met the same situation twice and
 * behaved differently the second time because CEPID remembered". This page
 * makes that visible: what agents are connected, what they have remembered,
 * what was just retrieved, and whether the substrate that holds the memory
 * is up. Every number is read from the live /v1/* API.
 */
export default async function OverviewPage() {
  const client = getClient();
  const [agents, readiness] = await Promise.all([
    client.listAgents().catch((e: unknown) => {
      if (e instanceof CepidClientError) return { _error: e.code as string };
      return { _error: 'UNREACHABLE' as string };
    }),
    client.getReadiness().catch(() => null),
  ]);

  const platformDown = !readiness;
  const substrateDown = readiness?.substrate === 'down';

  // Per-agent memory + activity are read with each agent's key, but the
  // platform's `listAgents` route is open and returns only the registry.
  // We surface the *count* of agents and link into per-agent pages that
  // ask for a key (the Developers page documents the flow).
  const agentList = (agents && !('_error' in agents) ? agents : []) as Array<{ id: string; name: string; description: string; createdAt: string }>;
  const platformError = agents && '_error' in agents ? (agents as { _error: string })._error : null;

  return (
    <div className="page">
      <div className="hero">
        <div className="hero__top">
          <span className="hero__divider" aria-hidden="true" />
          <span className="label" style={{ letterSpacing: '0.14em' }}>
            Memory infrastructure for autonomous agents
          </span>
        </div>
        <h1 className="hero__title">An agent that remembers.</h1>
        <p className="hero__lede">
          CEPID stores the situations an agent encounters, the decisions it
          made, the outcomes that followed, and the lessons drawn — and hands
          back the experience the agent needs <strong>before its next decision</strong>.
        </p>
      </div>

      {platformDown && (
        <div style={{ marginBottom: 'var(--s-6)' }}>
          <Notice title="Platform unreachable" tone="neg">
            The CEPID API at <code>CEPID_API_URL</code> did not respond. Set
            it in your environment and restart the dashboard.
          </Notice>
        </div>
      )}

      {!platformDown && substrateDown && (
        <div style={{ marginBottom: 'var(--s-6)' }}>
          <Notice title="Substrate down" tone="warn">
            The CEPID API is reachable, but the Sibyl sidecar is not. Retrieval,
            recording, and history all fail until the sidecar is restored. This
            is by design — the substrate is load-bearing.
          </Notice>
        </div>
      )}

      {platformError && platformError !== 'UNAUTHORIZED' && (
        <div style={{ marginBottom: 'var(--s-6)' }}>
          <Notice title="Could not list agents" tone="neg">
            The platform returned <code>{platformError}</code>. Check the API logs.
          </Notice>
        </div>
      )}

      <Band title="Agents" hint={<Link className="link" href="/agents">All agents →</Link>}>
        {agentList.length === 0 ? (
          <EmptyState
            title="No agents yet"
            body={
              platformError === 'UNAUTHORIZED'
                ? 'Listing agents requires an API key. Generate one on the Developers page, set CEPID_API_KEY, and restart the dashboard.'
                : 'The registry is empty. The first step is to register an agent — the Developers page walks through it.'
            }
            action={
              <Link className="link" href="/developers">
                Register an agent →
              </Link>
            }
          />
        ) : (
          <div className="rows rows--memories">
            {agentList.slice(0, 10).map((a) => (
              <Link className="row row--link" href={`/agents/${a.id}`} key={a.id}>
                <span className="row__lead">{shortId(a.id)}</span>
                <span className="row__main">
                  <span className="row__title">{a.name}</span>
                  {a.description && <span className="row__sub">{a.description}</span>}
                </span>
                <span className="row__trail">
                  <span style={{ color: 'var(--text-3)' }}>{formatRelative(a.createdAt)}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </Band>

      <Band
        title="Platform"
        hint={
          readiness ? (
            <span style={{ color: 'var(--text-3)' }}>
              {readiness.service} · {readiness.version}
            </span>
          ) : undefined
        }
      >
        <Metrics>
          <Metric
            label="Agents"
            value={formatCount(agentList.length)}
            sub={agentList.length === 0 ? 'registry empty' : 'registered'}
          />
          <Metric
            label="API"
            value={readiness ? 'reachable' : 'down'}
            tone={readiness ? 'pos' : 'neg'}
            sub={readiness ? readiness.version : 'unreachable'}
          />
          <Metric
            label="Sibyl substrate"
            value={readiness ? (readiness.substrate === 'ok' ? 'connected' : 'disconnected') : DASH}
            tone={!readiness ? 'muted' : readiness.substrate === 'ok' ? 'pos' : 'neg'}
            sub={readiness ? (readiness.substrate === 'ok' ? 'memory layer live' : 'core function offline') : 'no signal'}
          />
          <Metric
            label="Build"
            value="v1"
            tone="muted"
            sub="public API"
          />
        </Metrics>
      </Band>

      <Band title="Next step" tight>
        <EmptyState
          title="Register an agent, point its SDK at this API"
          body="The product is reachable by any external agent over HTTP. The Developers page shows how to mint a key, install @cepid/client, and make the first retrieve() call."
          action={
            <Link className="link" href="/developers">
              Open Developers →
            </Link>
          }
        />
      </Band>
    </div>
  );
}
