import Link from 'next/link';
import { EmptyState, Figure, Figures, Ledger, PageHead, Section } from '@/components/Primitives';
import { getClient } from '@/lib/data';
import { CepidClientError } from '@/lib/cepid';
import { DASH, formatCount, formatPercent, formatRelative, shortId } from '@/lib/format';
import type { MemoryRecord } from '@/lib/cepid';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = { title: 'Memories' };

const PAGE_SIZE = 50;

/**
 * MEMORIES — what CEPID has remembered, for the currently-authenticated agent.
 *
 * Read from `/v1/agents/history` (the API scopes by the bearer key, so a
 * single dashboard key shows a single agent's memory). No key, no rows —
 * never a fabricated zero.
 */
export default async function MemoriesPage() {
  const client = await getClient();
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
      <div>
        <PageHead
          filing="CEPID-002"
          title="Sign in to view memory"
          lede="This docket reads the bearer key's agent's memory from /v1/agents/history. Set CEPID_API_KEY in the dashboard's environment to populate it."
        />
        <EmptyState
          title="CEPID_API_KEY not set"
          body="Generate a key on the Developers page, then set CEPID_API_KEY=cepid_… in the dashboard's environment and restart."
          action={<Link href="/developers">Open Developers</Link>}
        />
      </div>
    );
  }

  if (error === 'UNAUTHORIZED') {
    return (
      <div>
        <PageHead filing="CEPID-002" title="Key not recognised" />
        <EmptyState
          title="The platform rejected the key"
          body="CEPID_API_KEY is set but the platform says it is not valid. Generate a new key on the Developers page."
          action={<Link href="/developers">Rotate key</Link>}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHead filing="CEPID-002" title="Substrate down" />
        <EmptyState
          title="CEPID could not read its own memory"
          body={`The API responded with ${error}. The substrate is load-bearing — without it, the dashboard has nothing to show. Restore the Sibyl sidecar and refresh.`}
        />
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div>
        <PageHead
          filing="CEPID-002"
          title="No memories yet"
          lede="Every memory is one situation, one decision, one outcome. As the agent acts, memories appear here and start influencing future decisions."
        />
        <EmptyState
          title="The agent has not recorded anything yet"
          body="Register an agent and run a session with the SDK, then come back — the first retrieval row and the first memory will appear here."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHead
        filing={`CEPID-002 · ${formatCount(memories.length)} ${memories.length === 1 ? 'memory' : 'memories'} on file`}
        title="What CEPID has remembered"
        lede="Experiences, patterns, and scars — held in the substrate for the authenticated agent."
      />

      <Section title="Standing">
        <Figures>
          <Figure label="Experiences" value={formatCount(memories.length)} />
          <Figure
            label="Settled"
            value={settled.length > 0 ? formatCount(settled.length) : DASH}
            note={settled.length > 0 ? `${good} good · ${bad} bad` : 'nothing resolved yet'}
          />
          <Figure
            label="Patterns"
            value={formatCount(patterns.length)}
            tone={patterns.length > 0 ? 'deny' : undefined}
            note="three similar experiences"
          />
          <Figure
            label="Scars"
            value={formatCount(scars.length)}
            tone={scars.length > 0 ? 'deny' : undefined}
            note="weighted heavily on retrieval"
          />
        </Figures>
      </Section>

      {(patterns.length > 0 || scars.length > 0) && (
        <Section title="What has generalised">
          <Ledger>
            {patterns.slice(0, 8).map((p) => (
              <div className="ledger__row" key={p.id}>
                <span className="ledger__id">pattern</span>
                <span>
                  <span className="ledger__title">{p.description}</span>
                  <span className="ledger__sub">
                    <span className="evidence">{p.signature}</span>
                  </span>
                </span>
                <span className="ledger__meta">
                  <span className="evidence">{p.good}G · {p.bad}B</span>
                </span>
              </div>
            ))}
            {scars.slice(0, 8).map((s) => (
              <div className="ledger__row" key={s.id}>
                <span className="ledger__id">scar</span>
                <span>
                  <span className="ledger__title">{s.description}</span>
                  <span className="ledger__sub">
                    strength <span className="evidence">{formatPercent(s.strength)}</span>
                  </span>
                </span>
                <span className="ledger__meta">
                  <span className="evidence">{s.memoryIds.length} memories</span>
                </span>
              </div>
            ))}
          </Ledger>
        </Section>
      )}

      <Section
        title="Experiences"
        note={
          sorted.length > PAGE_SIZE
            ? `showing the ${PAGE_SIZE} most recent of ${formatCount(sorted.length)}`
            : 'most recent first'
        }
      >
        <Ledger>
          {shown.map((m) => (
            <MemoryRow key={m.id} m={m} />
          ))}
        </Ledger>
      </Section>
    </div>
  );
}

function MemoryRow({ m }: { m: MemoryRecord }) {
  const sign = m.outcome?.magnitude;
  const verdict = m.outcome?.valence === 'bad' ? 'against' : m.outcome?.valence === 'good' ? 'for' : 'open';
  return (
    <Link className="ledger__row" href={`/memories/${m.id}`}>
      <span className="ledger__id">{shortId(m.id)}</span>
      <span>
        <span className="ledger__title">{m.situation.text || m.situation.domain}</span>
        <span className="ledger__sub">
          <span className="evidence">
            {m.situation.domain} → {m.action}
          </span>{' '}
          · {m.outcome?.result ?? 'pending'} · {verdict}
        </span>
      </span>
      <span className="ledger__meta">
        <span className="evidence">
          {sign === undefined || sign === null ? DASH : (sign > 0 ? '+' : '') + sign.toFixed(2)}
        </span>{' '}
        · {formatRelative(m.createdAt)}
      </span>
    </Link>
  );
}
