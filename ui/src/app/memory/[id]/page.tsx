import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Band,
  Chip,
  KV,
  KVRow,
  Metric,
  Metrics,
  PageHead,
  Panel,
} from '@/components/Primitives';
import { ExperienceStory } from '@/components/Experience';
import { OutcomeMark } from '@/components/Primitives';
import { getExperience, getExperiences, getPatterns, getScars } from '@/lib/data';
import {
  DASH,
  formatDateTime,
  formatPercent,
  formatRelative,
  formatUsdcSigned,
  marketOf,
  pnlTone,
  shortId,
} from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Memory ${shortId(id)}` };
}

/**
 * A single experience, told as the story the agent recorded.
 *
 * The trade is not a row here: it is conditions → retrieval → decision →
 * execution → outcome → the memory it became. Related memories at the bottom are
 * the ones sharing this experience's condition fingerprint, which is the same
 * key the retriever matches on — so "related" means genuinely retrievable
 * together, not merely similar-looking.
 */
export default async function MemoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [exp, all, patterns, scars] = await Promise.all([
    getExperience(id),
    getExperiences(),
    getPatterns(),
    getScars(),
  ]);
  if (!exp) notFound();

  const tag = exp.tags[0] ?? null;
  const related = tag
    ? all.filter((e) => e.id !== exp.id && e.tags.includes(tag)).slice(0, 6)
    : [];

  const inPatterns = patterns.filter((p) => p.experienceIds.includes(exp.id));
  const inScars = scars.filter((s) => s.experienceIds.includes(exp.id));

  return (
    <div className="page">
      <PageHead
        eyebrow={
          <Link className="link" href="/memory">
            Memory
          </Link>
        }
        aside={<span className="mono">{shortId(exp.id)}</span>}
        title={marketOf(exp.asset, exp.timeframe, exp.decision.direction)}
        sub={exp.outcome.lesson || undefined}
      />

      <Band tight>
        <Metrics>
          <Metric
            label="Outcome"
            value={<OutcomeMark outcome={exp.outcome.outcome} />}
            sub={
              exp.outcome.settlementAt
                ? `settled ${formatRelative(exp.outcome.settlementAt)}`
                : 'not settled'
            }
          />
          <Metric
            label="PnL"
            value={
              exp.outcome.outcome === 'PENDING' ? DASH : formatUsdcSigned(exp.outcome.pnl)
            }
            tone={exp.outcome.outcome === 'PENDING' ? 'muted' : pnlTone(exp.outcome.pnl)}
            sub="USDC realized"
          />
          <Metric
            label="Confidence"
            value={formatPercent(exp.decision.finalConfidence)}
            tone="blue"
            sub={`base ${formatPercent(exp.decision.baseConfidence)}`}
          />
          <Metric
            label="Importance"
            value={formatPercent(exp.importance)}
            sub={exp.surprising ? 'surprising outcome' : 'expected outcome'}
          />
        </Metrics>
      </Band>

      {(inPatterns.length > 0 || inScars.length > 0) && (
        <Band tight>
          <div className="flow__chips">
            {inPatterns.map((p) => (
              <Chip key={p.id} tone="blue">
                pattern · {formatPercent(p.winRate)} win rate
              </Chip>
            ))}
            {inScars.map((s) => (
              <Chip key={s.id} tone="neg">
                scar · strength {formatPercent(s.strength)}
              </Chip>
            ))}
          </div>
        </Band>
      )}

      {/* ------------------------------------------------------------ the story */}
      <Band title="The experience" hint="as the agent recorded it">
        <div className="split">
          <ExperienceStory exp={exp} decisionHref="/decision" />

          <div className="stack">
            <Panel title="Record">
              <KV>
                <KVRow k="Memory id" v={exp.id} mono />
                <KVRow k="Created" v={formatDateTime(exp.createdAt)} mono />
                <KVRow k="Session" v={exp.sessionId} mono />
                <KVRow k="Market" v={exp.marketId} mono />
                <KVRow k="Condition tag" v={tag ?? DASH} mono />
              </KV>
            </Panel>

            <Panel title="Retention" tone="thin">
              <KV>
                <KVRow k="Strength" v={formatPercent(exp.strength)} mono />
                <KVRow k="Importance" v={formatPercent(exp.importance)} mono />
                <KVRow k="Surprising" v={exp.surprising ? 'Yes' : 'No'} />
              </KV>
              <p
                className="prose"
                style={{ fontSize: 'var(--fs-small)', marginTop: 'var(--s-4)' }}
              >
                Strength decays over time; importance does not. A scarred memory decays
                more slowly than an ordinary one, so a painful lesson keeps its weight for
                longer.
              </p>
            </Panel>
          </div>
        </div>
      </Band>

      {/* --------------------------------------------------------- related memories */}
      <Band
        title="Retrievable alongside this"
        hint={
          tag
            ? `experiences sharing the fingerprint ${tag}`
            : 'no condition fingerprint recorded'
        }
      >
        {related.length === 0 ? (
          <Panel tone="thin">
            <p className="prose" style={{ fontSize: 'var(--fs-small)' }}>
              No other experience shares these conditions yet. This memory is currently
              CEPID&rsquo;s only reference point for this kind of market.
            </p>
          </Panel>
        ) : (
          <div className="rows rows--memories">
            {related.map((r) => (
              <Link className="row row--link" href={`/memory/${r.id}`} key={r.id}>
                <span className="row__lead">{shortId(r.id)}</span>
                <span className="row__main">
                  <span className="row__title">
                    {marketOf(r.asset, r.timeframe, r.decision.direction)}
                  </span>
                  {r.outcome.lesson && <span className="row__sub">{r.outcome.lesson}</span>}
                </span>
                <span className="row__trail">
                  <OutcomeMark outcome={r.outcome.outcome} />
                  <span className={`num-${pnlTone(r.outcome.pnl)}`}>
                    {r.outcome.outcome === 'PENDING' ? DASH : formatUsdcSigned(r.outcome.pnl)}
                  </span>
                  <span style={{ color: 'var(--text-3)' }}>{formatRelative(r.createdAt)}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </Band>
    </div>
  );
}
