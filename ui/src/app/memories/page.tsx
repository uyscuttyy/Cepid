import Link from 'next/link';
import { Band, EmptyState, Metric, Metrics, PageHead } from '@/components/Primitives';
import { getClient } from '@/lib/data';
import { CepidClientError } from '@/lib/cepid';
import { DASH, formatCount, formatPercent, formatRelative, outcomeTone, shortId, trendOf } from '@/lib/format';
import type { MemoryRecord } from '@/lib/cepid';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = { title: 'Memories' };

const PAGE_SIZE = 50;

/**
 * MEMORIES — what CEPID has remembered, for the currently-authenticated agent.
 *
 * Memories are read from `/v1/agents/history` (the API scopes by the bearer
 * key, so a single dashboard key shows a single agent's memory). When the
 * platform is reachable but no key is set, this page renders a clear
 * "set CEPID_API_KEY" empty state — not a fabricated zero.
 */
export default async function MemoriesPage() {
  const client = getClient();
  const needsAuth = !process.env.CEPID_API_KEY;
  let result: Awaited<ReturnType<typeof client.getAgentHistory>> | null = null;
  let error: string | null = null;

  if (!needsAuth) {
    try {
      result = await client.getAgentHistory('self');
    } catch (e) {
      error = e instanceof CepidClientError ? e.code : 'UNREACHABLE';
    }
  }

  const memories = result?.memories ?? [];
  const patterns = result?.patterns ?? [];
  const scars = result?.scars ?? [];
  const settled = memories.filter((m) => m.outcome !== null);
  const good = settled.filter((m) => m.outcome?.valence === 'good').length;
  const bad = settled.filter((m) => m.outcome?.valence === 'bad').length;
  const sorted = [...memories].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const shown = sorted.slice(0, PAGE_SIZE);

  if (needsAuth) {
    return (
      <div className="page">
        <PageHead
          eyebrow="Memories"
          title="Sign in to view memory"
          sub="The Memories page reads the bearer key's agent's memory from /v1/agents/history. Set CEPID_API_KEY in the dashboard's environment to populate it."
        />
        <EmptyState
          title="CEPID_API_KEY not set"
          body="Generate a key on the Developers page, then set CEPID_API_KEY=cepid_… in the dashboard's environment and restart."
          action={<Link className="link" href="/developers">Open Developers →</Link>}
        />
      </div>
    );
  }

  if (error === 'UNAUTHORIZED') {
    return (
      <div className="page">
        <PageHead eyebrow="Memories" title="Key not recognised" />
        <EmptyState
          title="The platform rejected the key"
          body="CEPID_API_KEY is set but the platform says it is not valid. Generate a new key on the Developers page."
          action={<Link className="link" href="/developers">Rotate key →</Link>}
        />
      </div>
    );
  }

  if (error === 'MEMORY_SUBSTRATE_UNAVAILABLE' || error) {
    return (
      <div className="page">
        <PageHead eyebrow="Memories" title="Substrate down" />
        <EmptyState
          title="CEPID could not read its own memory"
          body={`The API responded with ${error}. The substrate is load-bearing — without it, the dashboard has nothing to show. Restore the Sibyl sidecar and refresh.`}
        />
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="page">
        <PageHead
          eyebrow="Memories"
          title="No memories yet"
          sub="Every memory is one situation, one decision, one outcome. As the agent acts, memories appear here and start influencing future decisions."
        />
        <EmptyState
          title="The agent has not recorded anything yet"
          body="Run a session with the SDK or the demo agent, then come back — the first retrieval row and the first memory will appear here."
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead
        eyebrow="Memories"
        aside={
          <span className="mono">
            {formatCount(memories.length)} {memories.length === 1 ? 'memory' : 'memories'}
          </span>
        }
        title="What CEPID has remembered"
        sub="Experiences, patterns, and scars — held in the substrate for the authenticated agent."
      />

      <Band tight>
        <Metrics>
          <Metric label="Experiences" value={formatCount(memories.length)} />
          <Metric
            label="Settled"
            value={settled.length > 0 ? formatCount(settled.length) : DASH}
            sub={settled.length > 0 ? `${good} good · ${bad} bad` : 'nothing resolved yet'}
          />
          <Metric
            label="Patterns"
            value={formatCount(patterns.length)}
            tone={patterns.length > 0 ? 'blue' : 'muted'}
            sub="formed from three similar experiences"
          />
          <Metric
            label="Scars"
            value={formatCount(scars.length)}
            tone={scars.length > 0 ? 'neg' : 'muted'}
            sub="weighted more heavily on retrieval"
          />
        </Metrics>
      </Band>

      {(patterns.length > 0 || scars.length > 0) && (
        <Band title="What has generalised" tight>
          <div className="split split--even">
            <div>
              <span className="label">Patterns · {formatCount(patterns.length)}</span>
              {patterns.slice(0, 8).map((p) => (
                <div className="row" key={p.id}>
                  <span className="row__lead">{formatPercent(p.strength)}</span>
                  <span className="row__main">
                    <span className="row__title">{p.description}</span>
                    <span className="row__sub mono">{p.signature}</span>
                  </span>
                  <span className="row__trail">
                    <span>{p.good}G · {p.bad}B</span>
                  </span>
                </div>
              ))}
            </div>
            <div>
              <span className="label">Scars · {formatCount(scars.length)}</span>
              {scars.slice(0, 8).map((s) => (
                <div className="row" key={s.id}>
                  <span className="row__lead">{formatPercent(s.strength)}</span>
                  <span className="row__main">
                    <span className="row__title">{s.description}</span>
                  </span>
                  <span className="row__trail">
                    <span>{s.memoryIds.length} memories</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Band>
      )}

      <Band
        title="Experiences"
        hint={
          sorted.length > PAGE_SIZE
            ? `showing the ${PAGE_SIZE} most recent of ${formatCount(sorted.length)}`
            : 'most recent first'
        }
      >
        <div className="rows rows--memories">
          {shown.map((m) => (
            <MemoryRow key={m.id} m={m} />
          ))}
        </div>
      </Band>
    </div>
  );
}

function MemoryRow({ m }: { m: MemoryRecord }) {
  const tone = m.outcome ? outcomeTone(m.outcome) : 'muted';
  const sign = m.outcome?.magnitude;
  return (
    <Link className="row row--link" href={`/memories/${m.id}`}>
      <span className="row__lead">{shortId(m.id)}</span>
      <span className="row__main">
        <span className="row__title">
          {m.situation.text || m.situation.domain}
        </span>
        <span className="row__sub mono">
          {m.situation.domain} → {m.action}
        </span>
      </span>
      <span className="row__trail">
        <span className={`num-${trendOf(sign ?? null)}`}>
          {sign === undefined || sign === null ? DASH : (sign > 0 ? '+' : '') + sign.toFixed(2)}
        </span>
        <span style={{ color: 'var(--text-3)' }}>{formatRelative(m.createdAt)}</span>
        <span className={`chip chip--${tone}`} style={{ marginLeft: 'var(--s-3)' }}>
          {m.outcome?.result ?? 'pending'}
        </span>
      </span>
    </Link>
  );
}
