import { Band, EmptyState, Metric, Metrics, Notice, PageHead } from '@/components/Primitives';
import { getClient } from '@/lib/data';
import { CepidClientError } from '@/lib/cepid';
import { formatClock, formatCount, formatRelative } from '@/lib/format';
import type { AgentEvent } from '@/lib/cepid';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = { title: 'Activity' };

/**
 * ACTIVITY — the journal feed, newest first.
 *
 * Every API call writes a row to the per-agent journal: agent registered,
 * memory retrieved, decision recorded, outcome recorded, payment settled.
 * The journal is append-only, so the feed is a literal time-ordered slice
 * of what has happened.
 */
export default async function ActivityPage() {
  const client = getClient();
  const needsAuth = !process.env.CEPID_API_KEY;
  let events: AgentEvent[] = [];
  let error: string | null = null;

  if (!needsAuth) {
    try {
      const r = await client.getActivity('self');
      events = r.events;
    } catch (e) {
      error = e instanceof CepidClientError ? e.code : 'UNREACHABLE';
    }
  }

  if (needsAuth) {
    return (
      <div className="page">
        <PageHead eyebrow="Activity" title="Sign in to view the journal" />
        <EmptyState
          title="CEPID_API_KEY not set"
          body="Activity is read from /v1/activity, which is bearer-keyed. Set CEPID_API_KEY and restart the dashboard."
        />
      </div>
    );
  }

  if (error === 'MEMORY_SUBSTRATE_UNAVAILABLE') {
    return (
      <div className="page">
        <PageHead eyebrow="Activity" title="Substrate down" />
        <Notice title="The journal is unreachable" tone="warn">
          The substrate is load-bearing. Until the sidecar is restored, the journal is also down.
        </Notice>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <PageHead eyebrow="Activity" title="Could not load" />
        <EmptyState title="Platform error" body={error} />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="page">
        <PageHead eyebrow="Activity" title="No activity yet" />
        <EmptyState
          title="The journal is empty"
          body="As the agent runs, every retrieval, decision, outcome, and settled payment is appended here."
        />
      </div>
    );
  }

  const sorted = [...events].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const last7 = sorted.filter((e) => Date.now() - new Date(String(e.at)).getTime() < 7 * 86_400_000).length;

  return (
    <div className="page">
      <PageHead
        eyebrow="Activity"
        aside={
          <span className="mono">
            {formatCount(sorted.length)} {sorted.length === 1 ? 'row' : 'rows'}
          </span>
        }
        title="Journal"
        sub="Every event the platform recorded, newest first. Each row corresponds to a real action."
      />

      <Band tight>
        <Metrics>
          <Metric label="Total rows" value={formatCount(sorted.length)} />
          <Metric label="Last 7 days" value={formatCount(last7)} tone={last7 > 0 ? 'blue' : 'muted'} />
          <Metric
            label="Last activity"
            value={formatRelative(String(sorted[0]!.at))}
            tone="muted"
            sub={String(sorted[0]!.type)}
          />
          <Metric
            label="Distinct event types"
            value={formatCount(new Set(sorted.map((e) => e.type)).size)}
            sub="unique event.type values"
          />
        </Metrics>
      </Band>

      <Band title="Feed">
        <div className="activity">
          {sorted.slice(0, 100).map((ev, i) => (
            <div className="activity__item" key={`${ev.at}-${i}`} data-latest={i === 0 ? 'true' : 'false'}>
              <span className="activity__time">{formatClock(String(ev.at))}</span>
              <span className="activity__body">
                <span className="activity__what">{String(ev.type)}</span>
                <span className="activity__detail">
                  {summarise(ev)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </Band>
    </div>
  );
}

function summarise(ev: AgentEvent): string {
  const known: Record<string, string> = {
    'memory.retrieved': `retrieval ${short(String(ev.retrievalId))} returned ${String(ev.returned ?? '?')}`,
    'decision.recorded': `decision ${short(String(ev.decisionId))} → ${String(ev.action ?? '?')}`,
    'outcome.recorded': `outcome for ${short(String(ev.decisionId))} = ${String(ev.result ?? '?')}`,
    'usage.settled': `${String(ev.route ?? '?')} settled ${String(ev.price ?? '?')}${ev.txHash ? ` · tx ${short(String(ev.txHash))}` : ''}`,
    'agent.registered': `name: ${String(ev.name ?? '?')}`,
    'agent.revoked': `id: ${short(String(ev.agentId ?? '?'))}`,
  };
  return known[String(ev.type)] ?? Object.entries(ev)
    .filter(([k]) => !['type', 'at'].includes(k))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(' · ');
}

function short(s: string): string {
  if (!s) return '?';
  return s.length > 12 ? `${s.slice(0, 8)}…` : s;
}
