import type { ReactNode } from 'react';

/**
 * Shared case-file vocabulary.
 *
 * Anything that exists once stays local to its page; anything repeated
 * lives here. Class names are owned by components.css.
 */

/* ------------------------------------------------------------------ Stamp */

/** A rubber verdict stamp. `lands` plays the landing animation once. */
export function Stamp({
  verdict,
  size = 'inline',
  lands = false,
}: {
  verdict: 'ALLOW' | 'DENY';
  size?: 'hero' | 'inline';
  lands?: boolean;
}) {
  const cls = `stamp stamp--${size}${lands ? ' stamp--lands' : ''}`;
  return (
    <span className={cls} data-verdict={verdict} role="img" aria-label={`Verdict: ${verdict}`}>
      {verdict}
    </span>
  );
}

/** ALLOW / DENY as an inline word, colored by verdict. */
export function VerdictWord({ verdict }: { verdict: string }) {
  const v = verdict === 'DENY' ? 'DENY' : 'ALLOW';
  return (
    <span className="verdict-word" data-verdict={v}>
      {v}
    </span>
  );
}

/* --------------------------------------------------------------- Sections */

export function Section({
  title,
  note,
  children,
  id,
}: {
  title: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="section" id={id}>
      <div className="section__head">
        <h2 className="section-title">{title}</h2>
        {note && <span className="section__note">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/* ----------------------------------------------------------------- Ledger */

export function Ledger({ children }: { children: ReactNode }) {
  return <div className="ledger">{children}</div>;
}

/* ---------------------------------------------------------------- Figures */

export function Figures({ children }: { children: ReactNode }) {
  return <dl className="figures">{children}</dl>;
}

export function Figure({
  label,
  value,
  note,
  tone,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'deny' | 'allow';
  mono?: boolean;
}) {
  return (
    <div className="figure">
      <dt className="figure__label">{label}</dt>
      <dd
        className={`figure__value${mono ? ' evidence' : ''}`}
        data-tone={tone}
        style={{ margin: 0 }}
      >
        {value}
      </dd>
      {note && <span className="figure__note">{note}</span>}
    </div>
  );
}

/* ----------------------------------------------------------------- Record */

export function Record({ children }: { children: ReactNode }) {
  return <dl className="record">{children}</dl>;
}

export function RecordRow({ k, v, mono = false }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd className={mono ? 'evidence' : undefined}>{v}</dd>
    </div>
  );
}

/* ----------------------------------------------------------------- States */

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <h3 className="state__title">{title}</h3>
      <p className="state__body">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  body,
  technical,
}: {
  title?: string;
  body: ReactNode;
  technical?: string | null;
}) {
  return (
    <div className="state" role="alert">
      <h3 className="state__title">{title}</h3>
      <p className="state__body">{body}</p>
      {technical && <code className="state__tech">{technical}</code>}
    </div>
  );
}

export function Notice({
  title,
  children,
  tone = 'default',
}: {
  title: string;
  children: ReactNode;
  tone?: 'default' | 'warn' | 'allow' | 'deny';
}) {
  return (
    <div className="notice" data-tone={tone} role="note">
      <span className="notice__title">{title}</span>
      <p>{children}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ Misc */

export function PageHead({
  filing,
  title,
  lede,
}: {
  filing: string;
  title: ReactNode;
  lede?: ReactNode;
}) {
  return (
    <header style={{ marginBottom: 8 }}>
      <p className="kicker">
        <span className="filing-no">{filing}</span>
      </p>
      <h1 className="page-title">{title}</h1>
      {lede && <p className="lede">{lede}</p>}
    </header>
  );
}
