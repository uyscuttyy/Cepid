import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Band, EmptyState, KV, KVRow, Metric, Metrics, Notice, PageHead, Panel } from '@/components/Primitives';
import { getClient } from '@/lib/data';
import { CepidClientError } from '@/lib/cepid';
import { DASH, formatCount, formatDateTime, formatPercent, formatRelative, shortId } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Agent ${shortId(id)}` };
}

/**
 * AGENT DETAIL — what CEPID knows about one agent.
 *
 * The dashboard's bearer key is what scopes the per-agent data. If the
 * dashboard key IS the agent's own key, the memory and activity sections
 * populate. If the key belongs to a different agent, the registry lists
 * the agent but the private data is hidden by the platform (404 / 403).
 */
export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getClient();

  const [agents, history, activity, usage] = await Promise.all([
    client.listAgents().catch(() => []),
    client.getAgentHistory(id).catch((e: unknown) => {
      if (e instanceof CepidClientError) return { _error: e.code as string };
      return { _error: 'UNREACHABLE' as string };
    }),
    client.getActivity(id).catch((e: unknown) => {
      if (e instanceof CepidClientError) return { _error: e.code as string };
      return { _error: 'UNREACHABLE' as string };
    }),
    client.getUsage(id).catch((e: unknown) => {
      if (e instanceof CepidClientError) return { _error: e.code as string };
      return { _error: 'UNREACHABLE' as string };
    }),
  ]);

  const agent = agents.find((a) => a.id === id);
  if (!agent) notFound();

  const histOk = history && !('_error' in history);
  const actOk = activity && !('_error' in activity);
  const useOk = usage && !('_error' in usage);

  const memories = histOk ? (history as { memories: unknown[] }).memories : [];
  const patterns = histOk ? (history as { patterns: unknown[] }).patterns : [];
  const scars = histOk ? (history as { scars: unknown[] }).scars : [];
  const events = actOk ? (activity as { events: unknown[] }).events : [];
  const usageRows = useOk ? (usage as { usage: unknown[]; count: number }).usage : [];

  const errCode = (e: { _error?: string } | unknown) => (e && typeof e === 'object' && '_error' in e ? (e as { _error: string })._error : null);

  return (
    <div className="page">
      <PageHead
        eyebrow={
          <Link className="link" href="/agents">Agents</Link>
        }
        aside={<span className="mono">{shortId(agent.id)}</span>}
        title={agent.name}
        sub={agent.description || 'No description on file.'}
      />

      <Band tight>
        <Metrics>
          <Metric label="Status" value={agent.status} tone={agent.status === 'active' ? 'pos' : 'neg'} />
          <Metric label="Keys" value={formatCount(agent.keyCount)} sub="issued" />
          <Metric
            label="Memories"
            value={histOk ? formatCount(memories.length) : DASH}
            sub={histOk ? `${patterns.length} patterns · ${scars.length} scars` : (errCode(history) ?? 'private')}
          />
          <Metric
            label="Activity rows"
            value={actOk ? formatCount(events.length) : DASH}
            sub={actOk ? 'last 100' : (errCode(activity) ?? 'private')}
          />
          <Metric
            label="Usage rows"
            value={useOk ? formatCount(usageRows.length) : DASH}
            sub={useOk ? 'settled x402 payments' : (errCode(usage) ?? 'private')}
          />
        </Metrics>
      </Band>

      <Band title="Record">
        <Panel>
          <KV>
            <KVRow k="Agent id" v={agent.id} mono />
            <KVRow k="Name" v={agent.name} />
            <KVRow k="Description" v={agent.description || '—'} />
            <KVRow k="Status" v={agent.status} />
            <KVRow k="Keys issued" v={String(agent.keyCount)} mono />
            <KVRow k="Registered" v={formatDateTime(agent.createdAt)} mono />
          </KV>
        </Panel>
      </Band>

      {histOk && (
        <Band title="Memory" hint={`${formatCount(memories.length)} experiences held`}>
          <p className="prose">
            {memories.length === 0
              ? 'This agent has no memories yet. Have it record a situation, decision, and outcome via the SDK and the first one will appear here.'
              : 'See the Memories page for the full list and detail views.'}
          </p>
          <p>
            <Link className="link" href="/memories">Open Memories →</Link>
          </p>
        </Band>
      )}

      {actOk && events.length > 0 && (
        <Band title="Recent activity" hint="the agent's journal, newest first">
          <p>
            <Link className="link" href="/activity">Open Activity →</Link>
          </p>
        </Band>
      )}

      {!histOk && errCode(history) === 'UNAUTHORIZED' && (
        <Band title="Memory" tight>
          <EmptyState
            title="Scoped to a different agent"
            body="The dashboard's CEPID_API_KEY belongs to a different agent. To inspect this agent's private data, set the dashboard's key to one of this agent's keys."
          />
        </Band>
      )}
    </div>
  );
}
