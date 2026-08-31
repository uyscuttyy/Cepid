import Link from 'next/link';
import {
  Band,
  Chip,
  EmptyState,
  Metric,
  Metrics,
  PageHead,
  Panel,
} from '@/components/Primitives';
import { MemoryRow } from '@/components/Experience';
import { getExperiences, getPatterns, getScars } from '@/lib/data';
import { deriveMemoryStats } from '@/lib/view';
import { DASH, formatCount, formatPercent, formatUsdcSigned, pnlTone } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = { title: 'Memory' };

/** Experiences listed at once before the list is truncated with a count. */
const PAGE_SIZE = 40;

/**
 * MEMORY — the agent's accumulated experience.
 *
 * Memory is CEPID's identity, so this page treats it as a body of experience
 * rather than a database table: the shape of what it has learned first
 * (patterns, scars, spread of conditions), then the experiences themselves at
 * scan level with detail one click away.
 */
export default async function MemoryPage() {
  const [experiences, patterns, scars] = await Promise.all([
    getExperiences(),
    getPatterns(),
    getScars(),
  ]);

  const stats = deriveMemoryStats(experiences);
  const sorted = [...experiences].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const shown = sorted.slice(0, PAGE_SIZE);
  const settled = stats.wins + stats.losses;

  if (experiences.length === 0) {
    return (
      <div className="page">
        <PageHead
          eyebrow="Memory"
          title="No experiences yet"
          sub="Each CEPID memory holds the conditions around a decision, the decision itself, the outcome, and the lesson drawn from it."
        />
        <EmptyState
          title="No experiences yet"
          body="CEPID hasn't created its first trading memory. Once the agent begins trading, its experiences will appear here — and future decisions will start drawing on them."
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead
        eyebrow="Memory"
        aside={
          <span className="mono">
            {formatCount(stats.total)} {stats.total === 1 ? 'experience' : 'experiences'}
          </span>
        }
        title="What CEPID has learned"
        sub="An experience is not a trade record. It keeps the market conditions surrounding the decision, so that a comparable market can be recognised later."
      />

      <Band tight>
        <Metrics>
          <Metric
            label="Experiences"
            value={formatCount(stats.total)}
            sub={`${formatCount(stats.distinctConditions)} distinct condition sets`}
          />
          <Metric
            label="Settled"
            value={settled > 0 ? formatCount(settled) : DASH}
            sub={
              settled > 0
                ? `${stats.wins}W · ${stats.losses}L · ${formatPercent(stats.wins / settled)}`
                : 'nothing has resolved yet'
            }
          />
          <Metric
            label="Surprising"
            value={formatCount(stats.surprising)}
            tone={stats.surprising > 0 ? 'blue' : 'muted'}
            sub="outcome defied expectation"
          />
          <Metric
            label="Avg importance"
            value={stats.avgImportance === null ? DASH : formatPercent(stats.avgImportance)}
            sub="how strongly memories weigh"
          />
        </Metrics>
      </Band>

      {/* --------------------------------------------------- patterns & scars */}
      {(patterns.length > 0 || scars.length > 0) && (
        <Band
          title="What has become a pattern"
          hint="a pattern forms once three experiences share the same conditions"
        >
          <div className="split split--even">
            <div className="stack">
              <span className="label">
                Patterns · {formatCount(patterns.length)}
              </span>
              {patterns.length === 0 ? (
                <p className="prose" style={{ fontSize: 'var(--fs-small)' }}>
                  No pattern has formed yet.
                </p>
              ) : (
                <div className="rows rows--memories">
                  {[...patterns]
                    .sort((a, b) => b.strength - a.strength)
                    .map((p) => (
                      <div className="row" key={p.id}>
                        <span className="row__lead">{formatPercent(p.winRate)}</span>
                        <span className="row__main">
                          <span className="row__title">
                            {p.tagKey}
                            <Chip tone="blue">pattern</Chip>
                          </span>
                          <span className="row__sub">{p.description}</span>
                        </span>
                        <span className="row__trail">
                          <span>
                            {p.wins}W · {p.losses}L
                          </span>
                          <span className={`num-${pnlTone(p.avgPnl)}`}>
                            {formatUsdcSigned(p.avgPnl)}
                          </span>
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="stack">
              <span className="label">Scars · {formatCount(scars.length)}</span>
              {scars.length === 0 ? (
                <p className="prose" style={{ fontSize: 'var(--fs-small)' }}>
                  No scars. A scar forms when a pattern produces repeated losses; it decays
                  more slowly than an ordinary memory and is weighted more heavily on
                  retrieval.
                </p>
              ) : (
                <div className="rows rows--memories">
                  {[...scars]
                    .sort((a, b) => b.strength - a.strength)
                    .map((s) => (
                      <div className="row" key={s.id}>
                        <span className="row__lead">{formatPercent(s.strength)}</span>
                        <span className="row__main">
                          <span className="row__title">
                            <Chip tone="neg">scar</Chip>
                          </span>
                          <span className="row__sub">{s.description}</span>
                        </span>
                        <span className="row__trail">
                          {s.experienceIds.length}{' '}
                          {s.experienceIds.length === 1 ? 'memory' : 'memories'}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </Band>
      )}

      {patterns.length === 0 && scars.length === 0 && (
        <Band title="Patterns" tight>
          <Panel tone="thin">
            <p className="prose" style={{ fontSize: 'var(--fs-small)' }}>
              No patterns have formed yet. CEPID needs at least three experiences sharing
              the same condition fingerprint before it will generalise from them — and a
              pattern that keeps losing becomes a scar, which is weighted more heavily
              still.
            </p>
          </Panel>
        </Band>
      )}

      {/* ------------------------------------------------------- the experiences */}
      <Band
        title="Experiences"
        hint={
          sorted.length > PAGE_SIZE
            ? `showing the ${PAGE_SIZE} most recent of ${formatCount(sorted.length)}`
            : 'most recent first'
        }
      >
        <div className="rows rows--memories">
          {shown.map((e) => (
            <MemoryRow key={e.id} exp={e} />
          ))}
        </div>
        {sorted.length > PAGE_SIZE && (
          <p className="prose" style={{ fontSize: 'var(--fs-small)', marginTop: 'var(--s-5)' }}>
            {formatCount(sorted.length - PAGE_SIZE)} older experiences are held in memory and
            remain retrievable — they are not listed here. See the{' '}
            <Link className="link" href="/timeline">
              timeline
            </Link>{' '}
            for the full chronological record.
          </p>
        )}
      </Band>
    </div>
  );
}
