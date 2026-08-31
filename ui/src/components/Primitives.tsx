import type { ReactNode } from 'react';

/**
 * Shared interface vocabulary.
 *
 * These are the pieces that repeat across pages. Anything that exists once
 * stays local to its page; anything that carries the product's identity lives
 * in its own file (AgentStatus, CurrentDecision, MemoryRetrieval, MemoryFlow,
 * TradeExperience).
 */

/* -------------------------------------------------------------------------- */
/* Page scaffolding                                                            */
/* -------------------------------------------------------------------------- */

export function PageHead({
  eyebrow,
  title,
  sub,
  aside,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head__eyebrow">
        <span>{eyebrow}</span>
        {aside && (
          <>
            <span aria-hidden="true" style={{ color: 'var(--line-strong)' }}>
              /
            </span>
            {aside}
          </>
        )}
      </div>
      <h1 className="page-head__title">{title}</h1>
      {sub && <p className="page-head__sub">{sub}</p>}
    </header>
  );
}

/**
 * A full-width horizontal division of a page. Bands carry page structure so
 * that content does not have to live inside a card to look intentional.
 */
export function Band({
  title,
  hint,
  children,
  tight = false,
  id,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  tight?: boolean;
  id?: string;
}) {
  return (
    <section className={tight ? 'band band--tight' : 'band'} id={id}>
      {(title || hint) && (
        <div className="band__head">
          {title && <h2 className="band__title">{title}</h2>}
          {hint && <div className="band__hint">{hint}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Panel({
  title,
  hint,
  children,
  tone = 'default',
}: {
  title?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'thin' | 'blue';
}) {
  const cls =
    tone === 'blue' ? 'panel panel--blue' : tone === 'thin' ? 'panel panel--thin' : 'panel';
  return (
    <div className={cls}>
      {(title || hint) && (
        <div className="panel__head">
          {title && <h3 className="panel__title">{title}</h3>}
          {hint && <span className="band__hint">{hint}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Numbers                                                                     */
/* -------------------------------------------------------------------------- */

export function Metrics({ children }: { children: ReactNode }) {
  return <div className="metrics">{children}</div>;
}

export function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'pos' | 'neg' | 'blue' | 'muted';
}) {
  return (
    <div className="metric">
      <span className="label">{label}</span>
      <span className="metric__value" data-tone={tone}>
        {value}
      </span>
      {sub && <span className="metric__sub">{sub}</span>}
    </div>
  );
}

/** A single labelled number for inline groups. */
export function InlineFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="inline-fact">
      <span className="label">{label}</span>
      <span className="inline-fact__value">{value}</span>
    </div>
  );
}

/**
 * A proportional bar.
 *
 * `value` is 0..1 for an unsigned meter. When `signed` is set, `value` is
 * -1..1 and the fill grows out from a centre origin.
 */
export function Meter({
  label,
  value,
  display,
  tone,
  signed = false,
}: {
  label: string;
  value: number | null;
  display: string;
  tone?: 'pos' | 'neg' | 'muted';
  signed?: boolean;
}) {
  const v = value === null || !Number.isFinite(value) ? 0 : value;
  const magnitude = Math.min(1, Math.abs(v));
  const width = signed ? magnitude * 50 : magnitude * 100;
  const left = signed ? (v < 0 ? 50 - width : 50) : 0;

  return (
    <div className="meter">
      <div className="meter__head">
        <span className="label">{label}</span>
        <span className="meter__value">{display}</span>
      </div>
      <div
        className="meter__track"
        role="meter"
        aria-label={label}
        aria-valuenow={value === null ? undefined : Number((v * 100).toFixed(1))}
        aria-valuemin={signed ? -100 : 0}
        aria-valuemax={100}
        aria-valuetext={display}
      >
        {signed && <span className="meter__origin" aria-hidden="true" />}
        {value !== null && (
          <span
            className="meter__fill"
            data-tone={tone}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

export function Chip({
  children,
  tone = 'default',
  mono = false,
}: {
  children: ReactNode;
  tone?: 'default' | 'blue' | 'pos' | 'neg' | 'warn' | 'quiet';
  mono?: boolean;
}) {
  const toneCls = tone === 'default' ? '' : ` chip--${tone}`;
  return <span className={`chip${toneCls}${mono ? ' chip--mono' : ''}`}>{children}</span>;
}

/**
 * WIN / LOSS / PENDING.
 *
 * Carries a distinct shape per state as well as color, so the outcome is still
 * legible in monochrome or to a color-blind reader.
 */
export function OutcomeMark({ outcome }: { outcome: 'WIN' | 'LOSS' | 'PENDING' }) {
  const kind = outcome === 'WIN' ? 'win' : outcome === 'LOSS' ? 'loss' : 'pending';
  return (
    <span className="outcome" data-kind={kind}>
      {outcome}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Key / value ladders                                                         */
/* -------------------------------------------------------------------------- */

export function KV({ children }: { children: ReactNode }) {
  return <dl className="kv">{children}</dl>;
}

export function KVRow({
  k,
  v,
  mono = false,
}: {
  k: string;
  v: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="kv__row">
      <dt className="kv__key">{k}</dt>
      <dd className={mono ? 'kv__val kv__val--mono' : 'kv__val'}>{v}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * An empty state is a designed part of the product, not a fallback. It says
 * what is missing, why, and what will make it appear.
 */
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
      <MemoryGlyph />
      <h3 className="state__title">{title}</h3>
      <p className="state__body">{body}</p>
      {action}
    </div>
  );
}

/**
 * Something the UI could not read. Keeps the technical detail available without
 * making it the headline.
 */
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
    <div className="state state--error" role="alert">
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
  tone?: 'default' | 'warn' | 'blue' | 'neg';
}) {
  const cls = tone === 'default' ? 'notice' : `notice notice--${tone}`;
  return (
    <div className={cls} role="note">
      <span className="notice__title">{title}</span>
      <span>{children}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

export function Skeleton({
  variant = 'line',
  width,
}: {
  variant?: 'line' | 'title' | 'block';
  width?: string;
}) {
  return (
    <span
      className={`skeleton skeleton--${variant}`}
      style={width ? { width } : undefined}
      aria-hidden="true"
    />
  );
}

/** Skeleton arrangement used by route-level loading files. */
export function LoadingPage({ label }: { label: string }) {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <p className="visually-hidden">{label}</p>
      <div className="page-head">
        <Skeleton variant="line" width="9ch" />
        <Skeleton variant="title" width="24ch" />
        <Skeleton variant="line" width="52ch" />
      </div>
      <div className="stack stack--loose">
        <Skeleton variant="block" />
        <div className="split">
          <Skeleton variant="block" />
          <Skeleton variant="block" />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Reasoning                                                                   */
/* -------------------------------------------------------------------------- */

/** The agent's own decision log, numbered in the order it was written. */
export function Reasons({ items }: { items: string[] }) {
  return (
    <ol className="reasons">
      {items.map((r, i) => (
        <li className="reasons__item" key={`${i}-${r.slice(0, 24)}`}>
          <span className="reasons__index mono">{String(i + 1).padStart(2, '0')}</span>
          <span>{r}</span>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/* Marks                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The CEPID mark: three memory nodes on a descending trail. Used in the rail,
 * in empty states, and on the landing hero.
 */
export function MemoryGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg
      className="glyph state__glyph"
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden="true"
    >
      <path className="glyph__trail" d="M3 4.5 L10 11 L8 17.5" />
      <path className="glyph__trail" d="M10 11 L19 8" />
      <circle className="glyph__node" cx="10" cy="11" r="2.1" />
      <circle className="glyph__node--dim" cx="3" cy="4.5" r="1.5" />
      <circle className="glyph__node--dim" cx="19" cy="8" r="1.5" />
      <circle className="glyph__node--dim" cx="8" cy="17.5" r="1.5" />
    </svg>
  );
}
