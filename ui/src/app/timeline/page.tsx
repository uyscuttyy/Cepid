import { EmptyState, Section, Stat } from '@/components/Primitives';
import { getExperiences } from '@/lib/data';
import { formatPctSigned, formatPrice } from '@/lib/format';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export default async function TimelinePage() {
  const experiences = await getExperiences();
  const sorted = [...experiences].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (sorted.length === 0) {
    return (
      <div className="page">
        <header className="page__header">
          <span className="page__eyebrow">Timeline</span>
          <h1 className="page__title">No activity yet</h1>
          <p className="page__sub">CEPID hasn't recorded any experiences.</p>
        </header>
      </div>
    );
  }

  // Group by day
  const groups = new Map<string, typeof experiences>();
  for (const e of sorted) {
    const k = dayKey(e.createdAt);
    const list = groups.get(k) ?? [];
    list.push(e);
    groups.set(k, list);
  }

  return (
    <div className="page">
      <header className="page__header">
        <span className="page__eyebrow">Timeline</span>
        <h1 className="page__title">{sorted.length} experiences</h1>
        <p className="page__sub">
          The agent's life story, ordered most recent first. Each entry is a real
          recorded experience with its conditions, decision, and outcome.
        </p>
      </header>

      {Array.from(groups.entries()).map(([day, list]) => (
        <Section key={day} title={day} hint={`${list.length} ${list.length === 1 ? 'entry' : 'entries'}`}>
          {list.map((e) => (
            <Link key={e.id} className="row row--clickable" href={`/memory/${e.id}`}>
              <span className="row__id">
                {new Date(e.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="row__title">
                <span style={{ marginRight: 'var(--s-2)' }}>
                  {e.asset} · {e.timeframe}
                </span>
                <span className={`tag`} data-kind={e.outcome.outcome === 'WIN' ? 'win' : e.outcome.outcome === 'LOSS' ? 'loss' : 'pending'}>
                  {e.outcome.outcome} · {e.decision.direction}
                </span>
                {e.surprising && (
                  <span className="tag" data-kind="loss" style={{ marginLeft: 'var(--s-2)' }}>
                    surprising
                  </span>
                )}
              </span>
              <span className="row__meta">
                {formatPctSigned(e.outcome.pnl, 1)} @ {formatPrice(e.conditions.yesPrice)}
              </span>
            </Link>
          ))}
        </Section>
      ))}
    </div>
  );
}
