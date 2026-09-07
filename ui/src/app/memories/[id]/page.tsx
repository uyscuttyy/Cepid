import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState, PageHead, Record, RecordRow, Section, Stamp, VerdictWord } from '@/components/Primitives';
import { getClient } from '@/lib/data';
import { CepidClientError } from '@/lib/cepid';
import { DASH, formatDateTime, formatPercent, formatRelative, formatUsdcSigned, shortId } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Memory ${shortId(id)}` };
}

/**
 * MEMORY DETAIL — one experience, read as an exhibit: the situation, the
 * decision, the outcome, and every later decision it influenced or stopped.
 */
export default async function MemoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient();

  let memory: Awaited<ReturnType<typeof client.getMemory>> | null = null;
  let error: string | null = null;
  try {
    memory = await client.getMemory('self', id);
  } catch (e) {
    if (e instanceof CepidClientError) {
      if (e.status === 404) notFound();
      error = e.code;
    } else {
      error = 'UNREACHABLE';
    }
  }

  // Decisions that cite this memory — the influence chain, read from the
  // journal. decision.recorded carries usedMemoryIds; gate.denied carries
  // blockingMemoryIds. Both are server-written, never client-claimed.
  let citingDecisions: Array<{
    decisionId: string; action: string; verdict: string; at: string; retrievalId: string | null;
  }> = [];
  let blockedBy: Array<{ retrievalId: string; reason: string; at: string }> = [];
  if (memory) {
    try {
      const act = await client.getActivity('self');
      for (const e of act.events) {
        const used = Array.isArray(e.usedMemoryIds) ? (e.usedMemoryIds as string[]) : [];
        if (e.type === 'decision.recorded' && used.includes(id)) {
          citingDecisions.push({
            decisionId: String(e.decisionId ?? '?'),
            action: String(e.action ?? '?'),
            verdict: String(e.gateVerdict ?? 'ALLOW'),
            at: String(e.at ?? ''),
            retrievalId: typeof e.retrievalId === 'string' ? e.retrievalId : null,
          });
        }
        const blocking = Array.isArray(e.blockingMemoryIds) ? (e.blockingMemoryIds as string[]) : [];
        if (e.type === 'gate.denied' && blocking.includes(id)) {
          blockedBy.push({
            retrievalId: String(e.retrievalId ?? '?'),
            reason: String(e.reason ?? ''),
            at: String(e.at ?? ''),
          });
        }
      }
    } catch {
      // Activity unavailable — the memory itself is still showable.
    }
  }

  if (!memory) {
    return (
      <div>
        <PageHead filing={`CEPID · ${shortId(id)}`} title="Exhibit missing" />
        <EmptyState
          title={error === 'MEMORY_SUBSTRATE_UNAVAILABLE' ? 'Substrate down' : (error ?? 'Not found')}
          body={
            error === 'MEMORY_SUBSTRATE_UNAVAILABLE'
              ? 'The Sibyl sidecar is not reachable. The substrate is load-bearing — without it there is no memory to show.'
              : error === 'UNAUTHORIZED'
                ? 'Set CEPID_API_KEY to load private memory detail.'
                : "The memory id is not in this agent's memory. Either it has been pruned or the id is wrong."
          }
        />
      </div>
    );
  }

  const m = memory;
  const sign = m.outcome?.magnitude;
  const stoppedSomething = blockedBy.length > 0;

  return (
    <div>
      <PageHead
        filing={`CEPID · exhibit ${shortId(m.id)}`}
        title={m.situation.text || m.situation.domain}
        lede={
          <>
            {m.situation.domain} → <span className="evidence">{m.action}</span> · outcome{' '}
            <span className="evidence">{m.outcome?.result ?? 'pending'}</span>
          </>
        }
      />

      {stoppedSomething && (
        <div style={{ margin: '28px 0 8px' }}>
          <Stamp verdict="DENY" size="hero" />
          <p className="hero__caption" style={{ marginTop: 16 }}>
            This memory helped stop a later trade. The gate cited it as blocking evidence —
            see the influence record below.
          </p>
        </div>
      )}

      <Section title="The facts">
        <Record>
          <RecordRow k="Domain" v={m.situation.domain} mono />
          <RecordRow k="Action" v={m.action} mono />
          <RecordRow
            k="Facets"
            v={
              Object.entries(m.situation.facets).length > 0 ? (
                <span className="evidence" style={{ fontSize: 'var(--fs-small)' }}>
                  {Object.entries(m.situation.facets)
                    .map(([k, v]) => `${k}=${String(v)}`)
                    .join(' · ')}
                </span>
              ) : (
                DASH
              )
            }
          />
          <RecordRow
            k="Outcome"
            v={
              m.outcome ? (
                <>
                  <span className="evidence">{m.outcome.result}</span> · valence{' '}
                  <span className="evidence">{m.outcome.valence}</span>
                  {sign !== undefined && sign !== null && <> · {formatUsdcSigned(sign)}</>}
                </>
              ) : (
                'pending'
              )
            }
          />
          {m.outcome && (
            <RecordRow k="Observed" v={formatDateTime(m.outcome.observedAt)} mono />
          )}
          {m.outcome?.marketOutcome && (
            <RecordRow k="Market outcome" v={m.outcome.marketOutcome} mono />
          )}
          {m.outcome?.tradeOutcome && (
            <RecordRow k="Trade outcome" v={m.outcome.tradeOutcome} mono />
          )}
          {m.outcome?.evidence?.txHash && (
            <RecordRow k="Evidence (tx)" v={m.outcome.evidence.txHash} mono />
          )}
          <RecordRow
            k="Confidence"
            v={`${formatPercent(m.decision.confidenceFinal)} final (base ${formatPercent(m.decision.confidenceBase)}, memory ${m.decision.memoryInfluence >= 0 ? '+' : ''}${(m.decision.memoryInfluence * 100).toFixed(1)}%)`}
            mono
          />
          <RecordRow
            k="Strength"
            v={`${formatPercent(m.strength)} · importance ${formatPercent(m.importance)} · retrieved ${m.retrievedCount} times`}
            mono
          />
        </Record>
      </Section>

      {m.decision.reasoning.length > 0 && (
        <Section title="The agent's reasoning" note="recorded at decision time">
          <div className="exhibit-box">
            {m.decision.reasoning.map((r, i) => (
              <p className="prose" key={i}>
                <span className="evidence" style={{ color: 'var(--ink-3)', marginRight: 12 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                {r}
              </p>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Influence record"
        note="decisions this memory participated in, from the journal"
      >
        {citingDecisions.length === 0 && blockedBy.length === 0 ? (
          <EmptyState
            title="Not yet cited"
            body="No decision has cited this memory yet. When an agent retrieves it and records a decision against that retrieval, the decision appears here with its verdict."
          />
        ) : (
          <div className="ledger">
            {citingDecisions.map((d) => (
              <div className="ledger__row" key={d.decisionId}>
                <span className="ledger__id">{shortId(d.decisionId)}</span>
                <span>
                  <span className="ledger__title">
                    {d.action} — <VerdictWord verdict={d.verdict} />
                  </span>
                  <span className="ledger__sub">
                    retrieval <span className="evidence">{shortId(d.retrievalId)}</span>
                  </span>
                </span>
                <span className="ledger__meta">{formatRelative(d.at)}</span>
              </div>
            ))}
            {blockedBy.map((b, i) => (
              <div className="ledger__row" key={`${b.retrievalId}-${i}`}>
                <span className="ledger__id">blocked</span>
                <span>
                  <span className="ledger__title">
                    Stopped a trade — <VerdictWord verdict="DENY" />
                  </span>
                  <span className="ledger__sub">{b.reason}</span>
                </span>
                <span className="ledger__meta">{formatRelative(b.at)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Provenance">
        <Record>
          <RecordRow k="Memory id" v={m.id} mono />
          <RecordRow k="Filed" v={formatDateTime(m.createdAt)} mono />
          <RecordRow k="Last retrieved" v={m.lastRetrievedAt ? formatRelative(m.lastRetrievedAt) : DASH} mono />
          <RecordRow k="Source" v={m.source} mono />
          <RecordRow k="Back to" v={<Link href="/memories">the docket</Link>} />
        </Record>
      </Section>
    </div>
  );
}
