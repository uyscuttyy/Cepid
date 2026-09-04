import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Band, Chip, KV, KVRow, Metric, Metrics, PageHead, Panel } from '@/components/Primitives';
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
 * MEMORY DETAIL — one experience, told as the story the agent recorded.
 *
 * The shape comes straight from the platform's MemoryRecord: situation →
 * decision → outcome → the lessons drawn. Lifecycle numbers (strength,
 * retrievedCount) are read from the same record — they're maintained by
 * the platform, never recomputed here.
 */
export default async function MemoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getClient();

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

  if (!memory) {
    return (
      <div className="page">
        <PageHead eyebrow="Memory" title="Could not load" />
        <Empty
          title={error === 'MEMORY_SUBSTRATE_UNAVAILABLE' ? 'Substrate down' : error ?? 'Not found'}
          body={
            error === 'MEMORY_SUBSTRATE_UNAVAILABLE'
              ? 'The Sibyl sidecar is not reachable. The substrate is load-bearing — without it there is no memory to show.'
              : error === 'UNAUTHORIZED'
                ? 'Set CEPID_API_KEY to load private memory detail.'
                : 'The memory id is not in this agent\'s memory. Either it has been pruned or the id is wrong.'
          }
        />
      </div>
    );
  }

  const m = memory;
  const outcomeToneChip = m.outcome?.valence === 'good' ? 'pos' : m.outcome?.valence === 'bad' ? 'neg' : 'quiet';
  const sign = m.outcome?.magnitude;

  return (
    <div className="page">
      <PageHead
        eyebrow={
          <Link className="link" href="/memories">Memories</Link>
        }
        aside={<span className="mono">{shortId(m.id)}</span>}
        title={m.situation.text || m.situation.domain}
        sub={m.outcome?.result ? `Outcome: ${m.outcome.result}` : 'Pending outcome'}
      />

      <Band tight>
        <Metrics>
          <Metric
            label="Outcome"
            value={<Chip tone={outcomeToneChip}>{m.outcome?.result ?? 'pending'}</Chip>}
            sub={m.outcome ? `observed ${formatRelative(m.outcome.observedAt)}` : 'awaiting outcome'}
          />
          <Metric
            label="Magnitude"
            value={
              sign === undefined || sign === null
                ? DASH
                : formatUsdcSigned(sign)
            }
            tone={
              sign === undefined || sign === null
                ? 'muted'
                : sign > 0
                  ? 'pos'
                  : sign < 0
                    ? 'neg'
                    : 'muted'
            }
            sub={m.outcome ? `valence: ${m.outcome.valence}` : '—'}
          />
          <Metric
            label="Confidence (final)"
            value={formatPercent(m.decision.confidenceFinal)}
            tone="blue"
            sub={`base ${formatPercent(m.decision.confidenceBase)}`}
          />
          <Metric
            label="Strength"
            value={formatPercent(m.strength)}
            sub={`importance ${formatPercent(m.importance)}`}
          />
        </Metrics>
      </Band>

      <Band title="Situation">
        <Panel>
          <KV>
            <KVRow k="Domain" v={m.situation.domain} mono />
            <KVRow k="Text" v={m.situation.text} />
            {Object.entries(m.situation.facets).length > 0 && (
              <KVRow
                k="Facets"
                v={
                  <span className="mono" style={{ fontSize: 'var(--fs-small)' }}>
                    {Object.entries(m.situation.facets)
                      .map(([k, v]) => `${k}=${String(v)}`)
                      .join(' · ')}
                  </span>
                }
              />
            )}
          </KV>
        </Panel>
      </Band>

      <Band title="Decision" hint="what the agent did, and why">
        <div className="split">
          <Panel>
            <KV>
              <KVRow k="Action" v={m.action} mono />
              <KVRow k="Base confidence" v={formatPercent(m.decision.confidenceBase)} mono />
              <KVRow
                k="Memory influence"
                v={`${m.decision.memoryInfluence >= 0 ? '+' : ''}${(m.decision.memoryInfluence * 100).toFixed(1)}%`}
                mono
              />
              <KVRow k="Final confidence" v={formatPercent(m.decision.confidenceFinal)} mono />
            </KV>
          </Panel>
          <Panel>
            <span className="label">Reasoning</span>
            {m.decision.reasoning.length > 0 ? (
              <ol className="reasons">
                {m.decision.reasoning.map((r, i) => (
                  <li className="reasons__item" key={i}>
                    <span className="reasons__index mono">{String(i + 1).padStart(2, '0')}</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="prose">No reasoning recorded.</p>
            )}
          </Panel>
        </div>
      </Band>

      {m.outcome && (
        <Band title="Outcome">
          <Panel>
            <KV>
              <KVRow k="Result" v={m.outcome.result} mono />
              <KVRow k="Valence" v={m.outcome.valence} mono />
              <KVRow k="Observed" v={formatDateTime(m.outcome.observedAt)} mono />
              {m.outcome.marketOutcome && (
                <KVRow k="Market outcome" v={m.outcome.marketOutcome} mono />
              )}
              {m.outcome.tradeOutcome && (
                <KVRow k="Trade outcome" v={m.outcome.tradeOutcome} mono />
              )}
              {m.outcome.evidence?.txHash && (
                <KVRow k="Evidence (tx)" v={m.outcome.evidence.txHash} mono />
              )}
              {Object.keys(m.outcome.metrics).length > 0 && (
                <KVRow
                  k="Metrics"
                  v={
                    <span className="mono" style={{ fontSize: 'var(--fs-small)' }}>
                      {Object.entries(m.outcome.metrics)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(' · ')}
                    </span>
                  }
                />
              )}
            </KV>
          </Panel>
        </Band>
      )}

      <Band title="Lifecycle" tight>
        <Panel tone="thin">
          <KV>
            <KVRow k="Memory id" v={m.id} mono />
            <KVRow k="Created" v={formatDateTime(m.createdAt)} mono />
            <KVRow k="Updated" v={formatDateTime(m.updatedAt)} mono />
            <KVRow k="Retrieved" v={`${m.retrievedCount} times`} mono />
            {m.lastRetrievedAt && (
              <KVRow k="Last retrieved" v={formatRelative(m.lastRetrievedAt)} mono />
            )}
            <KVRow k="Source" v={m.source} mono />
            <KVRow k="Surprising" v={m.surprising ? 'Yes' : 'No'} />
          </KV>
        </Panel>
      </Band>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="state">
      <h3 className="state__title">{title}</h3>
      <p className="state__body">{body}</p>
    </div>
  );
}
