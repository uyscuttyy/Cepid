import { Banner, EmptyState, Section, Stat } from '@/components/Primitives';
import { DecisionHero } from '@/components/DecisionHero';
import { getEvents, getExperiences } from '@/lib/data';
import { formatPercent, formatPrice, formatRelative, formatUsdc } from '@/lib/format';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function DecisionPage() {
  const [events, experiences] = await Promise.all([getEvents(), getExperiences()]);

  // A "decision" is captured in a preview event. The most recent one is the current
  // decision the agent is reasoning about.
  const previews = events
    .filter((e) => e.type === 'preview')
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const last = previews[0] as (Record<string, unknown> & { at: string }) | undefined;

  if (!last) {
    return (
      <div className="page">
        <header className="page__header">
          <span className="page__eyebrow">Decision</span>
          <h1 className="page__title">No decision has been made</h1>
          <p className="page__sub">
            Run the agent in preview or execute mode and the latest decision will appear
            here, with the full reasoning chain.
          </p>
        </header>
        <EmptyState
          title="No decision yet"
          body="Use `npm run agent:preview` to generate a decision. This page is the
          most important view in CEPID — it shows exactly how memory changed (or did
          not change) the agent's call."
        />
      </div>
    );
  }

  const market = last.market as Record<string, unknown>;
  const intent = last.intent as Record<string, unknown>;
  const decision = (last.decision as Record<string, unknown>) ?? {};
  const risk = (last.risk as Record<string, unknown>) ?? {};
  const retrieved = (last.retrieved as Array<{ experience: { id: string }; similarity: number; isScar: boolean; isPattern: boolean; retrievalScore: number }>) ?? [];
  const direction = String(intent.direction ?? 'NO_TRADE');
  const baseConfidence = Number(intent.baseConfidence ?? 0);
  const memoryInfluence = Number(decision.memoryInfluence ?? 0);
  const finalConfidence = Number(decision.finalConfidence ?? 0);
  const memoryIds = (decision.memoryIds as string[]) ?? [];
  const reasoning = (decision.reasoning as string[]) ?? [];
  const collateralUsdc = Number(intent.shares ?? 0) * Number(intent.price ?? 0);
  const riskApproved = Boolean(risk.approved);
  const riskReasons = (risk.reasons as string[]) ?? [];

  return (
    <div className="page">
      <header className="page__header">
        <span className="page__eyebrow">Decision · {formatRelative(String(last.at))}</span>
        <h1 className="page__title">Why did CEPID make this decision?</h1>
        <p className="page__sub">
          The current decision is the result of a base strategy, a memory retrieval,
          and a structured reconciliation. Each input is shown below; nothing is
          inferred.
        </p>
      </header>

      {!riskApproved && (
        <div style={{ marginBottom: 'var(--s-5)' }}>
          <Banner kind="err" title="Risk rejected this decision">
            {riskReasons.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
                {riskReasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            ) : (
              'The risk engine refused this trade.'
            )}
          </Banner>
        </div>
      )}

      <DecisionHero
        direction={direction as 'YES' | 'NO' | 'NO_TRADE'}
        baseConfidence={baseConfidence}
        memoryInfluence={memoryInfluence}
        finalConfidence={finalConfidence}
        collateralUsdc={direction === 'NO_TRADE' ? null : collateralUsdc}
        marketLabel={`${String(market.asset ?? '?')} · ${String(market.timeframe ?? '?')} · ${String(market.title ?? market.id ?? '')}`}
      />

      <div className="cols">
        <Section title="Current conditions" hint="from the live market">
          <Stat
            label="YES price"
            value={typeof market.yesPrice === 'number' ? formatPrice(market.yesPrice) : '—'}
          />
          <Stat
            label="Expires"
            value={
              market.expiresAt
                ? new Date(Number(market.expiresAt) * 1000).toLocaleString()
                : '—'
            }
          />
        </Section>

        <Section title="Base strategy">
          <Stat
            label="Direction"
            value={String(intent.direction ?? '—')}
            sub={String(intent.reason ?? '')}
          />
          <Stat
            label="Base confidence"
            value={formatPercent(baseConfidence)}
          />
        </Section>
      </div>

      <Section
        title="CEPID memory"
        hint={
          retrieved.length > 0
            ? `${retrieved.length} similar ${retrieved.length === 1 ? 'memory' : 'memories'} found`
            : 'no memories retrieved'
        }
      >
        {retrieved.length === 0 ? (
          <EmptyState
            title="No memories to retrieve"
            body="This is the agent's first encounter with this kind of market, so no past experience was used."
          />
        ) : (
          retrieved.map((r) => {
            const exp = r.experience as unknown as { id: string; outcome: { outcome: string } };
            const outcome = exp.outcome.outcome;
            return (
              <div key={exp.id} className="row row--clickable">
                <span className="row__id">
                  {(r.similarity * 100).toFixed(0)}%
                </span>
                <span className="row__title">
                  <Link href={`/memory/${exp.id}`} style={{ textDecoration: 'underline' }}>
                    {exp.id.slice(0, 8)}
                  </Link>
                  <span className="tag" data-kind={outcome === 'WIN' ? 'win' : outcome === 'LOSS' ? 'loss' : 'pending'} style={{ marginLeft: 'var(--s-2)' }}>
                    {outcome}
                  </span>
                  {r.isScar && (
                    <span className="tag" data-kind="scar" style={{ marginLeft: 'var(--s-2)' }}>
                      scar
                    </span>
                  )}
                  {r.isPattern && (
                    <span className="tag" data-kind="pattern" style={{ marginLeft: 'var(--s-2)' }}>
                      pattern
                    </span>
                  )}
                </span>
                <span className="row__meta">
                  sim {(r.retrievalScore * 100).toFixed(0)}
                </span>
              </div>
            );
          })
        )}
      </Section>

      <Section title="Memory influence" hint="how retrieval changed the decision">
        <div className="influence-bar">
          <span className="stat__label" style={{ minWidth: 96 }}>Influence</span>
          <div className="influence-bar__track">
            <div className="influence-bar__center" aria-hidden="true" />
            <div
              className="influence-bar__fill"
              data-sign={memoryInfluence > 0.005 ? 'pos' : memoryInfluence < -0.005 ? 'neg' : 'neutral'}
              style={{
                left: memoryInfluence >= 0 ? '50%' : `${50 + memoryInfluence * 50}%`,
                width: `${Math.min(50, Math.abs(memoryInfluence) * 50)}%`,
              }}
            />
          </div>
          <span className="stat__label" style={{ minWidth: 80, textAlign: 'right' }}>
            {formatPercent(memoryInfluence, 0)}
          </span>
        </div>

        <Stat
          label="Final confidence"
          value={formatPercent(finalConfidence)}
          sub={finalConfidence < 0.5 ? 'Below no-trade threshold — vetoed' : 'Above threshold — trade allowed'}
        />
        <Stat
          label="Outcome"
          value={finalConfidence < 0.5 ? 'NO TRADE' : direction}
          trend={finalConfidence < 0.5 ? 'neutral' : direction === 'YES' ? 'up' : 'down'}
        />
      </Section>

      {reasoning.length > 0 && (
        <Section title="Reasoning" hint="decision log">
          <ul className="reasoning">
            {reasoning.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </Section>
      )}

      <Section title="Risk check" hint="never bypassed by memory">
        <Stat
          label="Approved"
          value={riskApproved ? 'YES' : 'NO'}
          trend={riskApproved ? 'up' : 'down'}
        />
        <Stat
          label="Collateral"
          value={direction === 'NO_TRADE' ? '—' : formatUsdc(collateralUsdc)}
        />
        {riskReasons.length > 0 && (
          <ul className="reasoning">
            {riskReasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
      </Section>

      {memoryIds.length > 0 && experiences.length > 0 && (
        <Section title="Memory references" hint={`${memoryIds.length} IDs cited in this decision`}>
          {memoryIds.map((id) => {
            const exp = experiences.find((e) => e.id === id);
            if (!exp) return null;
            return (
              <Link key={id} className="row row--clickable" href={`/memory/${id}`}>
                <span className="row__id">{id.slice(0, 8)}</span>
                <span className="row__title">
                  {exp.asset} · {exp.timeframe} · {exp.decision.direction} · {exp.outcome.outcome}
                </span>
                <span className="row__meta">{formatUsdc(exp.outcome.pnl)}</span>
              </Link>
            );
          })}
        </Section>
      )}
    </div>
  );
}
