import Link from 'next/link';
import type { DecisionView } from '@/lib/view';
import { Chip } from './Primitives';
import {
  directionLabel,
  formatPctSigned,
  formatPercent,
  formatPrice,
  marketOf,
  titleCase,
} from '@/lib/format';

/**
 * MEMORY → DECISION.
 *
 * CEPID's defining loop, rendered as connected stages:
 *
 *   current conditions → memory retrieval → past outcomes → influence → decision
 *
 * Each stage shows a value the agent actually recorded. Where a stage has no
 * data — no memories retrieved, no influence applied — it says so plainly and
 * its marker goes hollow, rather than being hidden or filled with a placeholder
 * number. The decision stage is the emphasised one because it is the outcome
 * the whole chain exists to produce.
 */
export function MemoryFlow({ decision }: { decision: DecisionView }) {
  const c = decision.conditions;
  const d = decision.decision;
  const retrieved = decision.retrieved;

  const wins = retrieved.filter((r) => r.outcome === 'WIN').length;
  const losses = retrieved.filter((r) => r.outcome === 'LOSS').length;
  const pending = retrieved.filter((r) => r.outcome === 'PENDING').length;
  const settled = wins + losses;

  const influence = d.memoryInfluence;
  const hasInfluence = influence !== null && Math.abs(influence) > 0.0005;
  const influenceDirection =
    influence === null ? null : influence > 0 ? 'raised' : influence < 0 ? 'reduced' : 'unchanged';

  const vetoed = d.direction === 'NO_TRADE' && decision.base.direction !== 'NO_TRADE';

  return (
    <div className="flow">
      {/* 1 — what the agent is looking at right now */}
      <Stage
        label="Current conditions"
        value={
          c ? (
            <>
              {marketOf(c.asset, c.timeframe)}
              {c.yesPrice !== null && (
                <span className="mono" style={{ color: 'var(--text-2)' }}>
                  {' '}
                  @ {formatPrice(c.yesPrice)}
                </span>
              )}
            </>
          ) : (
            'Not recorded'
          )
        }
        empty={!c}
        chips={
          c
            ? [
                c.volatility ? `${titleCase(c.volatility)} volatility` : null,
                c.momentum ? `${titleCase(c.momentum)} momentum` : null,
                c.liquidity ? `${titleCase(c.liquidity)} liquidity` : null,
                c.timeRemainingBucket ? `${c.timeRemainingBucket} left` : null,
              ].filter((x): x is string => x !== null)
            : []
        }
      />

      {/* 2 — the search through experience */}
      <Stage
        label="Memory retrieval"
        value={
          retrieved.length > 0 ? (
            <>
              <span className="mono">{retrieved.length}</span>{' '}
              similar {retrieved.length === 1 ? 'experience' : 'experiences'} retrieved
            </>
          ) : (
            'No similar experiences found'
          )
        }
        note={
          retrieved.length > 0
            ? `Closest match ${formatPercent(retrieved[0]!.similarity)} similar`
            : 'These conditions are new to the agent.'
        }
        empty={retrieved.length === 0}
      />

      {/* 3 — what happened those times */}
      <Stage
        label="Past outcomes"
        value={
          settled > 0 ? (
            <>
              <span className="mono num-pos">{wins}</span> won ·{' '}
              <span className="mono num-neg">{losses}</span> lost
            </>
          ) : retrieved.length > 0 ? (
            'Retrieved experiences have not settled yet'
          ) : (
            'No outcomes to weigh'
          )
        }
        note={
          pending > 0
            ? `${pending} still open, excluded from influence`
            : settled > 0
              ? `${formatPercent(wins / settled)} of similar setups resolved in favour`
              : undefined
        }
        empty={settled === 0}
      />

      {/* 4 — how that experience moved the number */}
      <Stage
        label="Memory influence"
        value={
          influence === null ? (
            'Not recorded'
          ) : hasInfluence ? (
            <>
              Confidence {influenceDirection} by{' '}
              <span className={`mono num-${influence > 0 ? 'pos' : 'neg'}`}>
                {formatPctSigned(influence)}
              </span>
            </>
          ) : (
            'Memory left the decision unchanged'
          )
        }
        note={
          d.baseConfidence !== null && d.finalConfidence !== null
            ? `Base ${formatPercent(d.baseConfidence)} → final ${formatPercent(d.finalConfidence)}`
            : undefined
        }
        empty={!hasInfluence}
      />

      {/* 5 — the call */}
      <Stage
        label="Current decision"
        emphasis
        value={
          <>
            <strong style={{ fontWeight: 500 }}>{directionLabel(d.direction)}</strong>
            {d.finalConfidence !== null && (
              <span className="mono" style={{ color: 'var(--blue)' }}>
                {' '}
                {formatPercent(d.finalConfidence)}
              </span>
            )}
          </>
        }
        note={
          vetoed
            ? `Memory vetoed the base strategy's ${directionLabel(decision.base.direction)} call.`
            : decision.risk.approved === false
              ? 'The risk engine refused this order.'
              : undefined
        }
        after={
          decision.experienceId ? (
            <Link className="link" href={`/memory/${decision.experienceId}`}>
              This decision became a memory →
            </Link>
          ) : null
        }
      />
    </div>
  );
}

function Stage({
  label,
  value,
  note,
  chips = [],
  emphasis = false,
  empty = false,
  after,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  chips?: string[];
  emphasis?: boolean;
  empty?: boolean;
  after?: React.ReactNode;
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
        <span className="flow__value">{value}</span>
        {note && <span className="flow__note">{note}</span>}
        {chips.length > 0 && (
          <div className="flow__chips">
            {chips.map((c) => (
              <Chip key={c} tone="quiet">
                {c}
              </Chip>
            ))}
          </div>
        )}
        {after && <span className="flow__note">{after}</span>}
      </div>
    </div>
  );
}
