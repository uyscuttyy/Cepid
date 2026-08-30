import { EmptyState, Section, Stat } from '@/components/Primitives';
import { ExperienceDetail, ExperienceRow } from '@/components/Experience';
import { getExperiences, getPatterns, getScars } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function MemoryPage() {
  const [experiences, patterns, scars] = await Promise.all([
    getExperiences(),
    getPatterns(),
    getScars(),
  ]);

  const sorted = [...experiences].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const total = sorted.length;
  const high = sorted.filter((e) => e.importance > 0.6);
  const surprising = sorted.filter((e) => e.surprising);

  return (
    <div className="page">
      <header className="page__header">
        <span className="page__eyebrow">Memory</span>
        <h1 className="page__title">{total.toLocaleString()} experiences</h1>
        <p className="page__sub">
          Every CEPID experience captures the market conditions, the decision, the
          outcome, and the lesson. Use the experience list to inspect what the agent
          has learned.
        </p>
      </header>

      <div className="cols">
        <Section title="Counts">
          <Stat label="Total" value={total.toLocaleString()} />
          <Stat label="High-value" value={high.length.toLocaleString()} sub="importance > 0.6" />
          <Stat label="Surprising" value={surprising.length.toLocaleString()} sub="result defied expectation" />
        </Section>
        <Section title="Aggregate">
          <Stat label="Patterns" value={patterns.length.toString()} />
          <Stat label="Scars" value={scars.length.toString()} sub="repeated loss patterns" />
        </Section>
      </div>

      {scars.length > 0 && (
        <Section title="Scars" hint="strongly influence future decisions">
          {scars.map((s) => (
            <div key={s.id} className="row">
              <span className="row__id">{s.id.slice(0, 8)}</span>
              <span className="row__title">
                <span className="tag" data-kind="scar" style={{ marginRight: 'var(--s-2)' }}>scar</span>
                {s.description}
              </span>
              <span className="row__meta">strength {(s.strength * 100).toFixed(0)}%</span>
            </div>
          ))}
        </Section>
      )}

      {patterns.length > 0 && (
        <Section title="Patterns" hint="recurring market configurations">
          {patterns.map((p) => (
            <div key={p.id} className="row">
              <span className="row__id">{p.id.slice(0, 8)}</span>
              <span className="row__title">
                <span className="tag" data-kind="pattern" style={{ marginRight: 'var(--s-2)' }}>pattern</span>
                {p.description}
              </span>
              <span className="row__meta">
                {p.wins}W · {p.losses}L · {(p.winRate * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </Section>
      )}

      <Section title="All experiences" hint="most recent first">
        {sorted.length === 0 ? (
          <EmptyState
            title="No memories yet"
            body="CEPID hasn't recorded any experiences. Run the agent to begin building memory."
          />
        ) : (
          sorted.slice(0, 30).map((e) => (
            <ExperienceDetail key={e.id} exp={e} />
          ))
        )}
        {sorted.length > 30 && (
          <p className="page__sub">
            Showing the 30 most recent of {sorted.length} experiences.
          </p>
        )}
      </Section>
    </div>
  );
}
