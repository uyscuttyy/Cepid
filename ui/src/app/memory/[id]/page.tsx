import { EmptyState, Section } from '@/components/Primitives';
import { notFound } from 'next/navigation';
import { getExperience } from '@/lib/data';
import { ConditionsBlock, DecisionBlock, OutcomeBlock } from '@/components/Experience';
import { formatPctSigned, formatPrice, formatUsdc, outcomeKind } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ExperienceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exp = await getExperience(id);
  if (!exp) notFound();

  const kind = outcomeKind(exp.outcome.outcome);
  const c = exp.conditions;
  const d = exp.decision;
  const o = exp.outcome;
  const e = exp.execution;

  return (
    <div className="page">
      <header className="page__header">
        <span className="page__eyebrow">Memory · {exp.id.slice(0, 8)}</span>
        <h1 className="page__title">
          {exp.asset} · {exp.timeframe} · {d.direction}
        </h1>
        <p className="page__sub">{new Date(exp.createdAt).toLocaleString()}</p>
      </header>

      <div className="cols">
        <Section title="Conditions" hint="at decision time">
          <ul className="reasoning">
            <li>YES price: <code>{formatPrice(c.yesPrice)}</code></li>
            <li>Volatility: {c.volatility}</li>
            <li>Momentum: {c.momentum}</li>
            <li>Liquidity: {c.liquidity}</li>
            <li>Time remaining: {c.timeRemainingBucket}</li>
            <li>Tag: <code>{exp.tags[0] ?? '—'}</code></li>
          </ul>
        </Section>

        <Section title="Decision">
          <ul className="reasoning">
            <li>Direction: <code>{d.direction}</code></li>
            <li>Base confidence: {(d.baseConfidence * 100).toFixed(0)}%</li>
            <li>Memory influence: {formatPctSigned(d.memoryInfluence, 0)}</li>
            <li>Final confidence: {(d.finalConfidence * 100).toFixed(0)}%</li>
            <li>Retrieved memories: {d.memoryIds.length}</li>
          </ul>
        </Section>
      </div>

      <Section title="Execution" hint="fill details">
        {e.entryPrice !== undefined ? (
          <ul className="reasoning">
            <li>Entry price: <code>{formatPrice(e.entryPrice)}</code></li>
            <li>Shares: {e.shares ?? '—'}</li>
            {e.txHash && <li>Tx: <code>{e.txHash.slice(0, 18)}…</code></li>}
            {e.executedAt && <li>Executed: {new Date(e.executedAt).toLocaleString()}</li>}
          </ul>
        ) : (
          <EmptyState
            title="No execution"
            body="This experience was captured in preview mode — no order was submitted."
          />
        )}
      </Section>

      <Section title="Outcome">
        <ul className="reasoning">
          <li>
            Result: <span className={`tag`} data-kind={kind}>{o.outcome}</span>
          </li>
          <li>PnL: {formatUsdc(o.pnl)}</li>
          <li>Expectation: {o.expectation || '—'}</li>
          <li>Lesson: {o.lesson || '—'}</li>
          {o.settlementAt && <li>Settled: {new Date(o.settlementAt).toLocaleString()}</li>}
        </ul>
      </Section>

      <Section title="Memory metadata">
        <ul className="reasoning">
          <li>Importance: {(exp.importance * 100).toFixed(0)}%</li>
          <li>Strength: {(exp.strength * 100).toFixed(0)}%</li>
          <li>Surprising: {exp.surprising ? 'yes' : 'no'}</li>
          <li>Session: <code>{exp.sessionId}</code></li>
        </ul>
      </Section>
    </div>
  );
}
