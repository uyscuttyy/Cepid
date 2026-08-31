import Link from 'next/link';
import type { Experience, MarketContext } from '@/lib/types';
import type { ConditionsView } from '@/lib/view';
import { Chip, OutcomeMark } from './Primitives';
import {
  DASH,
  directionLabel,
  formatPercent,
  formatPrice,
  formatRelative,
  formatUsdcSigned,
  marketOf,
  scaleIndex,
  shortId,
  titleCase,
  trendOf,
} from '@/lib/format';

/**
 * CONDITIONS.
 *
 * The market state surrounding a decision — the thing CEPID remembers that most
 * agents throw away. Qualitative fields (volatility, momentum, liquidity) are
 * ordinal, so they get a three-tick scale alongside the word; the word is always
 * present so the meaning does not depend on reading the ticks.
 */
export function Conditions({
  conditions,
}: {
  conditions: MarketContext | ConditionsView;
}) {
  const c = conditions;
  return (
    <div className="conditions">
      {c.yesPrice !== null && c.yesPrice !== undefined && (
        <Row k="YES price" v={formatPrice(c.yesPrice)} />
      )}
      <Row k="Momentum" v={titleCase(c.momentum)} scale={scaleIndex(c.momentum)} />
      <Row k="Volatility" v={titleCase(c.volatility)} scale={scaleIndex(c.volatility)} />
      <Row k="Liquidity" v={titleCase(c.liquidity)} scale={scaleIndex(c.liquidity)} />
      <Row k="Time remaining" v={c.timeRemainingBucket ?? DASH} />
      {c.midpointDistance !== null && c.midpointDistance !== undefined && (
        <Row k="Midpoint distance" v={c.midpointDistance.toFixed(3)} />
      )}
    </div>
  );
}

function Row({
  k,
  v,
  scale,
}: {
  k: string;
  v: string;
  scale?: number | null;
}) {
  return (
    <div className="conditions__row">
      <span className="conditions__key">{k}</span>
      <span className="conditions__value">{v}</span>
      {scale ? (
        <span className="conditions__scale" aria-hidden="true">
          {[1, 2, 3].map((i) => (
            <span key={i} className="conditions__tick" data-on={i <= scale ? 'true' : 'false'} />
          ))}
        </span>
      ) : (
        <span />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Scan-level memory row                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One experience at scan level: when, what, how it ended. Everything else is
 * behind the link — this row exists to be compared with its neighbours, not to
 * expose every field.
 */
export function MemoryRow({ exp }: { exp: Experience }) {
  const tone = trendOf(exp.outcome.pnl);
  return (
    <Link className="row row--link" href={`/memory/${exp.id}`}>
      <span className="row__lead">{shortId(exp.id)}</span>
      <span className="row__main">
        <span className="row__title">
          {marketOf(exp.asset, exp.timeframe, exp.decision.direction)}
          {exp.surprising && <Chip tone="warn">surprising</Chip>}
          {exp.importance >= 0.6 && <Chip tone="blue">high value</Chip>}
        </span>
        {exp.outcome.lesson && <span className="row__sub">{exp.outcome.lesson}</span>}
      </span>
      <span className="row__trail">
        <OutcomeMark outcome={exp.outcome.outcome} />
        <span className={`num-${tone}`}>
          {exp.outcome.outcome === 'PENDING' ? DASH : formatUsdcSigned(exp.outcome.pnl)}
        </span>
        <span style={{ color: 'var(--text-3)' }}>{formatRelative(exp.createdAt)}</span>
      </span>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* The experience, in full                                                     */
/* -------------------------------------------------------------------------- */

/**
 * TRADE EXPERIENCE — a trade told as the story the agent recorded.
 *
 *   conditions → memories retrieved → decision → execution → outcome → memory
 *
 * The stages are rendered from the stored experience, so the chain is the
 * agent's own account of the trade rather than a reconstruction. Stages with no
 * recorded data (a preview that never executed, a position that has not settled)
 * state that explicitly.
 */
export function ExperienceStory({
  exp,
  /** Retrieval detail lives on the decision page; link there instead of duplicating. */
  decisionHref,
}: {
  exp: Experience;
  decisionHref?: string | null;
}) {
  const d = exp.decision;
  const e = exp.execution;
  const o = exp.outcome;
  const executed = e.entryPrice !== undefined;
  const settled = o.outcome !== 'PENDING';

  return (
    <div className="flow">
      <StoryStage label="Conditions">
        <Conditions conditions={exp.conditions} />
      </StoryStage>

      <StoryStage
        label="Memories retrieved"
        empty={d.memoryIds.length === 0}
        note={
          d.memoryIds.length === 0
            ? 'No similar experience existed when this decision was made.'
            : undefined
        }
      >
        {d.memoryIds.length > 0 && (
          <div className="stack stack--tight">
            <span className="flow__value">
              <span className="mono">{d.memoryIds.length}</span> past{' '}
              {d.memoryIds.length === 1 ? 'experience' : 'experiences'} informed this decision
            </span>
            <div className="flow__chips">
              {d.memoryIds.slice(0, 8).map((id) => (
                <Link key={id} href={`/memory/${id}`} className="chip chip--mono">
                  {shortId(id)}
                </Link>
              ))}
              {d.memoryIds.length > 8 && (
                <Chip tone="quiet">+{d.memoryIds.length - 8} more</Chip>
              )}
            </div>
          </div>
        )}
      </StoryStage>

      <StoryStage label="Decision" emphasis>
        <div className="inline-facts">
          <Fact label="Direction" value={directionLabel(d.direction)} />
          <Fact label="Base confidence" value={formatPercent(d.baseConfidence)} />
          <Fact
            label="Memory influence"
            value={
              <span className={`num-${trendOf(d.memoryInfluence)}`}>
                {d.memoryInfluence === 0 ? 'none' : formatPercent(d.memoryInfluence, 1)}
              </span>
            }
          />
          <Fact label="Final confidence" value={formatPercent(d.finalConfidence)} />
        </div>
        {decisionHref && (
          <span className="flow__note">
            <Link className="link" href={decisionHref}>
              See the retrieval behind this decision →
            </Link>
          </span>
        )}
      </StoryStage>

      <StoryStage
        label="Execution"
        empty={!executed}
        note={
          executed
            ? undefined
            : 'No order was submitted — this experience was recorded in preview mode.'
        }
      >
        {executed && (
          <div className="inline-facts">
            <Fact label="Entry price" value={formatPrice(e.entryPrice)} />
            <Fact label="Shares" value={e.shares ?? DASH} />
            {e.slippageBps !== undefined && (
              <Fact label="Slippage" value={`${e.slippageBps} bps`} />
            )}
            {e.txHash && <Fact label="Transaction" value={shortId(e.txHash)} />}
          </div>
        )}
      </StoryStage>

      <StoryStage
        label="Outcome"
        empty={!settled}
        note={settled ? undefined : 'The market has not resolved yet.'}
      >
        <div className="stack stack--tight">
          <span className="flow__value">
            <OutcomeMark outcome={o.outcome} />
            {settled && (
              <span className={`mono num-${trendOf(o.pnl)}`} style={{ marginLeft: 'var(--s-3)' }}>
                {formatUsdcSigned(o.pnl)}
              </span>
            )}
          </span>
          {o.expectation && <span className="flow__note">{o.expectation}</span>}
        </div>
      </StoryStage>

      <StoryStage label="Memory created" emphasis>
        <div className="stack stack--tight">
          {o.lesson && <span className="flow__value">{o.lesson}</span>}
          <div className="inline-facts">
            <Fact label="Importance" value={formatPercent(exp.importance)} />
            <Fact label="Strength" value={formatPercent(exp.strength)} />
            <Fact label="Surprising" value={exp.surprising ? 'Yes' : 'No'} />
          </div>
          <span className="flow__note">
            This experience is now retrievable: future decisions in comparable conditions
            will weigh it.
          </span>
        </div>
      </StoryStage>
    </div>
  );
}

function StoryStage({
  label,
  children,
  note,
  emphasis = false,
  empty = false,
}: {
  label: string;
  children?: React.ReactNode;
  note?: string;
  emphasis?: boolean;
  empty?: boolean;
}) {
  return (
    <div
      className="flow__stage"
      data-emphasis={emphasis ? 'true' : 'false'}
      data-empty={empty ? 'true' : 'false'}
    >
      <span className="flow__marker" aria-hidden="true" />
      <div className="flow__content">
        <span className="flow__label">{label}</span>
        {children}
        {note && <span className="flow__note">{note}</span>}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="inline-fact">
      <span className="label">{label}</span>
      <span className="inline-fact__value">{value}</span>
    </div>
  );
}
