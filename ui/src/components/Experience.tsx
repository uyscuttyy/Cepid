import type { Experience } from '@/lib/types';
import { formatPctSigned, formatPrice, formatRelative, formatUsdc, outcomeKind } from '@/lib/format';
import Link from 'next/link';

export function ExperienceRow({ exp, href }: { exp: Experience; href?: string }) {
  const kind = outcomeKind(exp.outcome.outcome);
  const inner = (
    <>
      <span className="row__id">{exp.id.slice(0, 8)}</span>
      <span className="row__title">
        <span style={{ marginRight: 'var(--s-2)' }}>
          {exp.asset} · {exp.timeframe}
        </span>
        <span className={`tag`} data-kind={kind}>
          {exp.outcome.outcome} · {formatPctSigned(exp.outcome.pnl, 1)}
        </span>
        {exp.surprising && (
          <span className="tag" data-kind="loss" style={{ marginLeft: 'var(--s-2)' }}>
            surprising
          </span>
        )}
      </span>
      <span className="row__meta">{formatRelative(exp.createdAt)}</span>
    </>
  );
  if (href) {
    return (
      <Link className="row row--clickable" href={href}>
        {inner}
      </Link>
    );
  }
  return <div className="row">{inner}</div>;
}

export function ExperienceDetail({ exp }: { exp: Experience }) {
  return (
    <details>
      <summary>
        <span>
          <span className="row__id" style={{ marginRight: 'var(--s-3)' }}>{exp.id.slice(0, 8)}</span>
          {exp.asset} · {exp.timeframe} · {exp.decision.direction}
        </span>
        <span className="row__meta">
          {exp.outcome.outcome} · {formatPctSigned(exp.outcome.pnl, 1)}
        </span>
      </summary>
      <div className="details__body">
        <ConditionsBlock exp={exp} />
        <DecisionBlock exp={exp} />
        <OutcomeBlock exp={exp} />
      </div>
    </details>
  );
}

export function ConditionsBlock({ exp }: { exp: Experience }) {
  const c = exp.conditions;
  return (
    <div>
      <div className="stat__label" style={{ marginBottom: 'var(--s-2)' }}>Conditions</div>
      <ul className="reasoning">
        <li>YES price: <code style={{ fontFamily: 'var(--font-mono)' }}>{formatPrice(c.yesPrice)}</code></li>
        <li>Volatility: {c.volatility}</li>
        <li>Momentum: {c.momentum}</li>
        <li>Liquidity: {c.liquidity}</li>
        <li>Time remaining: {c.timeRemainingBucket}</li>
      </ul>
    </div>
  );
}

export function DecisionBlock({ exp }: { exp: Experience }) {
  const d = exp.decision;
  return (
    <div>
      <div className="stat__label" style={{ marginBottom: 'var(--s-2)' }}>Decision</div>
      <ul className="reasoning">
        <li>Direction: <code>{d.direction}</code></li>
        <li>Base confidence: {(d.baseConfidence * 100).toFixed(0)}%</li>
        <li>Memory influence: {formatPctSigned(d.memoryInfluence, 0)}</li>
        <li>Final confidence: {(d.finalConfidence * 100).toFixed(0)}%</li>
        {d.memoryIds.length > 0 && (
          <li>Retrieved {d.memoryIds.length} {d.memoryIds.length === 1 ? 'memory' : 'memories'}</li>
        )}
      </ul>
    </div>
  );
}

export function OutcomeBlock({ exp }: { exp: Experience }) {
  const o = exp.outcome;
  return (
    <div>
      <div className="stat__label" style={{ marginBottom: 'var(--s-2)' }}>Outcome</div>
      <ul className="reasoning">
        <li>Result: <code>{o.outcome}</code></li>
        <li>PnL: {formatUsdc(o.pnl)}</li>
        <li>Expectation: {o.expectation || '—'}</li>
        <li>Lesson: {o.lesson || '—'}</li>
      </ul>
    </div>
  );
}
