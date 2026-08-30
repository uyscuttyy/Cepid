import type { ReactNode } from 'react';

export function EmptyState({
  title,
  body,
  variant = 'default',
}: {
  title: string;
  body: string;
  variant?: 'default' | 'error';
}) {
  return (
    <div className={`state ${variant === 'error' ? 'state--error' : ''}`}>
      <h3 className="state__title">{title}</h3>
      <p className="state__body">{body}</p>
    </div>
  );
}

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <div className="section__head">
        <h2 className="section__title">{title}</h2>
        {hint && <span className="section__hint">{hint}</span>}
      </div>
      <div className="section__body">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value" data-trend={trend}>{value}</div>
      {sub && <div className="stat__sub">{sub}</div>}
    </div>
  );
}

export function Banner({
  kind,
  title,
  children,
}: {
  kind: 'sim' | 'err' | 'ok';
  title: string;
  children: ReactNode;
}) {
  const cls = kind === 'sim' ? 'banner--sim' : kind === 'err' ? 'banner--err' : 'banner--ok';
  return (
    <div className={`banner ${cls}`} role="status">
      <div className="banner__title">{title}</div>
      <div>{children}</div>
    </div>
  );
}
