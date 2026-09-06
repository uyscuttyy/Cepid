import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState, Figure, Figures, PageHead, Record, RecordRow, Section } from '@/components/Primitives';
import { getClient } from '@/lib/data';
import { CepidClientError } from '@/lib/cepid';
import { DASH, formatCount, formatDateTime, shortId } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Agent ${shortId(id)}` };
}

/**
 * AGENT DETAIL — one agent's file. The dashboard key scopes the private
 * sections: the agent's own key opens them, any other key does not.
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
  const usageRows = useOk ? (usage as { usage: unknown[] }).usage : [];

  const errCode = (e: unknown) =>
    e && typeof e === 'object' && '_error' in e ? (e as { _error: string })._error : null;

  return (
    <div>
      <PageHead
        filing={`CEPID-003 · ${shortId(agent.id)}`}
        title={agent.name}
        lede={agent.description || 'No description on file.'}
      />

      <Section title="Standing">
        <Figures>
          <Figure
            label="Status"
            value={agent.status}
            tone={agent.status === 'active' ? 'allow' : 'deny'}
          />
          <Figure label="Keys" value={formatCount(agent.keyCount)} note="issued" />
          <Figure
            label="Memories"
            value={histOk ? formatCount(memories.length) : DASH}
            note={histOk ? `${patterns.length} patterns · ${scars.length} scars` : (errCode(history) ?? 'private')}
          />
          <Figure
            label="Journal entries"
            value={actOk ? formatCount(events.length) : DASH}
            note={actOk ? 'last 100' : (errCode(activity) ?? 'private')}
          />
          <Figure
            label="Payments"
            value={useOk ? formatCount(usageRows.length) : DASH}
            note={useOk ? 'settled x402' : (errCode(usage) ?? 'private')}
          />
        </Figures>
      </Section>

      <Section title="The file">
        <Record>
          <RecordRow k="Agent id" v={agent.id} mono />
          <RecordRow k="Name" v={agent.name} />
          <RecordRow k="Description" v={agent.description || DASH} />
          <RecordRow k="Status" v={agent.status} />
          <RecordRow k="Keys issued" v={String(agent.keyCount)} mono />
          <RecordRow k="Registered" v={formatDateTime(agent.createdAt)} mono />
        </Record>
      </Section>

      {histOk && memories.length > 0 && (
        <Section title="Memory" note={`${formatCount(memories.length)} experiences held`}>
          <p className="prose">
            The full list lives on the <Link href="/memories">Memories docket</Link>, with a
            detail exhibit for every experience.
          </p>
        </Section>
      )}

      {!histOk && errCode(history) === 'UNAUTHORIZED' && (
        <Section title="Memory">
          <EmptyState
            title="Scoped to a different agent"
            body="The dashboard's CEPID_API_KEY belongs to a different agent. To inspect this agent's private data, set the dashboard's key to one of this agent's keys."
          />
        </Section>
      )}
    </div>
  );
}
