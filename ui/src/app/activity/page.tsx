import Link from 'next/link';
import { EmptyState, Figure, Figures, Ledger, Notice, PageHead, Section } from '@/components/Primitives';
import { getClient } from '@/lib/data';
import { CepidClientError } from '@/lib/cepid';
import type { AgentEvent } from '@/lib/cepid';
import { formatClock, formatCount, formatRelative } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = { title: 'Activity' };

/**
 * ACTIVITY — the journal, newest first. An append-only record of everything
 * the platform did: retrievals, verdicts, decisions, outcomes, settlements.
 */
export default async function ActivityPage() {
  const client = await getClient();
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
      <div>
        <PageHead filing="CEPID-004" title="Sign in to read the journal" />
        <EmptyState
          title="CEPID_API_KEY not set"
          body="Activity is read from /v1/activity, which is bearer-keyed. Set CEPID_API_KEY and restart the dashboard."
        />
      </div>
    );
  }

  if (error === 'MEMORY_SUBSTRATE_UNAVAILABLE') {
    return (
      <div>
        <PageHead filing="CEPID-004" title="Substrate down" />
        <Notice title="The journal is unreachable" tone="warn">
          The substrate is load-bearing. Until the sidecar is restored, the journal is
          also down.
        </Notice>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHead filing="CEPID-004" title="Could not load" />
        <EmptyState title="Platform error" body={error} />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div>
        <PageHead filing="CEPID-004" title="No activity yet" />
        <EmptyState
          title="The journal is empty"
          body="As the agent runs, every retrieval, decision, outcome, and settled payment is appended here."
        />
      </div>
    );
  }

  const sorted = [...events].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const denies = sorted.filter((e) => e.type === 'gate.denied').length;
  const last7 = sorted.filter((e) => Date.now() - new Date(String(e.at)).getTime() < 7 * 86_400_000).length;

  return (
    <div>
      <PageHead
        filing={`CEPID-004 · ${formatCount(sorted.length)} ${sorted.length === 1 ? 'entry' : 'entries'}`}
        title="The journal"
        lede="Every event the platform recorded, newest first. Each entry corresponds to something that really happened."
      />

      <Section title="Standing">
        <Figures>
          <Figure label="Entries" value={formatCount(sorted.length)} />
          <Figure label="Last 7 days" value={formatCount(last7)} />
          <Figure
            label="Trades stopped"
            value={formatCount(denies)}
            tone={denies > 0 ? 'deny' : undefined}
            note="gate.denied entries"
          />
          <Figure
            label="Last entry"
            value={formatRelative(String(sorted[0]!.at))}
            mono
            note={String(sorted[0]!.type)}
          />
        </Figures>
      </Section>

      <Section title="Entries">
        <Ledger>
          {sorted.slice(0, 100).map((ev, i) => (
            <div className="ledger__row" key={`${String(ev.at)}-${i}`}>
              <span className="ledger__time">{formatClock(String(ev.at))}</span>
              <span>
                <span className="ledger__title">{titleFor(ev)}</span>
                <span className="ledger__sub">{summarise(ev)}</span>
              </span>
              <span className="ledger__meta">{kindFor(ev)}</span>
            </div>
          ))}
        </Ledger>
      </Section>
    </div>
  );
}

function titleFor(ev: AgentEvent): string {
  const t = String(ev.type);
  if (t === 'gate.denied') return 'Trade stopped';
  if (t === 'decision.recorded') return `Decision: ${String(ev.action ?? '?')}`;
  if (t === 'memory.retrieved') return 'Retrieval';
  if (t === 'outcome.recorded') return `Outcome: ${String(ev.result ?? '?')}`;
  if (t === 'memory.settled') return 'Memory settled';
  if (t === 'memory.validated') return 'Memory validated';
  if (t === 'memory.created') return 'Memory filed';
  if (t === 'usage.settled') return 'Payment settled';
  if (t === 'agent.registered') return 'Agent registered';
  if (t === 'agent.revoked') return 'Agent revoked';
  return t;
}

function kindFor(ev: AgentEvent): string {
  const t = String(ev.type);
  if (t === 'gate.denied') return 'DENY';
  if (t === 'decision.recorded') return String(ev.gateVerdict ?? 'ALLOW');
  if (t === 'outcome.recorded') return String(ev.result ?? '');
  if (t === 'memory.settled') return String(ev.result ?? '');
  return '';
}

function summarise(ev: AgentEvent): React.ReactNode {
  if (ev.type === 'gate.denied') {
    const ids = Array.isArray(ev.blockingMemoryIds) ? (ev.blockingMemoryIds as string[]) : [];
    return (
      <>
        {String(ev.reason ?? 'blocked by memory')}
        {ids.length > 0 && (
          <>
            {' '}· blocking:{' '}
            {ids.map((id, i) => (
              <span key={id}>
                {i > 0 && ', '}
                <Link className="evidence" href={`/memories/${id}`}>
                  {short(id)}
                </Link>
              </span>
            ))}
          </>
        )}
      </>
    );
  }
  if (ev.type === 'decision.recorded') {
    const used = Array.isArray(ev.usedMemoryIds) ? (ev.usedMemoryIds as string[]) : [];
    return (
      <>
        decision <span className="evidence">{short(String(ev.decisionId))}</span>
        {used.length > 0 && (
          <>
            {' '}· used:{' '}
            {used.slice(0, 4).map((id, i) => (
              <span key={id}>
                {i > 0 && ', '}
                <Link className="evidence" href={`/memories/${id}`}>
                  {short(id)}
                </Link>
              </span>
            ))}
            {used.length > 4 && ` +${used.length - 4} more`}
          </>
        )}
      </>
    );
  }
  const known: Record<string, string> = {
    'memory.retrieved': `retrieval ${short(String(ev.retrievalId))} returned ${String(ev.returned ?? '?')}`,
    'outcome.recorded': `for ${short(String(ev.decisionId))}`,
    'memory.settled': `memory ${short(String(ev.memoryId))}`,
    'memory.validated': `${String(ev.reinforced ?? 0)} reinforced, ${String(ev.weakened ?? 0)} weakened`,
    'memory.created': `memory ${short(String(ev.memoryId))}`,
    'usage.settled': `${String(ev.route ?? '?')} settled ${String(ev.price ?? '?')}${ev.txHash ? ` · tx ${short(String(ev.txHash))}` : ''}`,
    'agent.registered': `name: ${String(ev.name ?? '?')}`,
    'agent.revoked': `id: ${short(String(ev.agentId ?? '?'))}`,
  };
  return (
    known[String(ev.type)] ??
    Object.entries(ev)
      .filter(([k]) => !['type', 'at'].includes(k))
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(' · ')
  );
}

function short(s: string): string {
  if (!s) return '?';
  return s.length > 12 ? `${s.slice(0, 8)}…` : s;
}
