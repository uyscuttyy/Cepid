import Link from 'next/link';
import type { AgentState, DecisionView } from '@/lib/view';
import { AgentStatus } from './AgentStatus';
import { Chip } from './Primitives';
import {
  DASH,
  directionLabel,
  formatPercent,
  formatPrice,
  formatRelative,
  formatTimeRemaining,
  formatUsdc,
  marketOf,
} from '@/lib/format';

/**
 * CURRENT DECISION.
 *
 * The loudest element in the product: the direction at display scale with
 * confidence beside it, then the facts that produced it. Everything shown is a
 * value the agent recorded for this decision — the memory count links into the
 * retrieval that generated it rather than asserting a number on its own.
 */
export function CurrentDecision({
  decision,
  state,
  /** Links to the full reasoning view. Omitted when already on that page. */
  href = '/decision',
}: {
  decision: DecisionView;
  state: AgentState;
  href?: string | null;
}) {
  const d = decision.decision;
  const market = decision.market;
  const memoryCount = decision.retrieved.length;
  const collateral =
    decision.base.shares !== null && decision.base.price !== null
      ? decision.base.shares * decision.base.price
      : decision.risk.collateral;

  const isNoTrade = d.direction === 'NO_TRADE';
  const vetoed = isNoTrade && decision.base.direction !== null && decision.base.direction !== 'NO_TRADE';

  return (
    <div className="decision">
      <div className="decision__inner">
        <div className="decision__head">
          <span className="label">Current decision</span>
          <AgentStatus state={state} />
        </div>

        <div className="decision__body">
          <div className="decision__call">
            <span className="decision__direction" data-direction={d.direction ?? 'NO_TRADE'}>
              {directionLabel(d.direction)}
            </span>
            <span className="decision__market">
              {market.title ?? marketOf(market.asset, market.timeframe) ?? DASH}
            </span>
          </div>

          {d.finalConfidence !== null && (
            <div className="decision__confidence">
              <span className="decision__confidence-value">
                {formatPercent(d.finalConfidence)}
              </span>
              <span className="label">Confidence</span>
            </div>
          )}
        </div>

        {(vetoed || decision.risk.approved === false) && (
          <div style={{ marginTop: 'var(--s-5)' }}>
            {vetoed && (
              <p className="prose" style={{ fontSize: 'var(--fs-small)' }}>
                Memory vetoed the base strategy&rsquo;s{' '}
                <strong style={{ color: 'var(--text)', fontWeight: 500 }}>
                  {directionLabel(decision.base.direction)}
                </strong>{' '}
                call: similar past experiences pulled confidence below the trade threshold.
              </p>
            )}
            {decision.risk.approved === false && decision.risk.reasons.length > 0 && (
              <p className="prose" style={{ fontSize: 'var(--fs-small)' }}>
                Risk refused this order — {decision.risk.reasons[0]!.toLowerCase()}.
              </p>
            )}
          </div>
        )}

        <div className="decision__foot">
          <Fact
            label="Memory"
            value={
              memoryCount > 0 ? (
                <>
                  {memoryCount} similar {memoryCount === 1 ? 'experience' : 'experiences'}
                </>
              ) : (
                'No similar experience'
              )
            }
          />
          {market.yesPrice !== null && (
            <Fact label="YES price" value={formatPrice(market.yesPrice)} />
          )}
          {market.expiresAt !== null && (
            <Fact label="Time left" value={formatTimeRemaining(market.expiresAt)} />
          )}
          {!isNoTrade && collateral !== null && (
            <Fact label="Collateral" value={formatUsdc(collateral)} />
          )}
          <Fact label="Recorded" value={formatRelative(decision.at)} />

          {href && (
            <Link
              className="btn btn--secondary btn--sm"
              href={href}
              style={{ marginLeft: 'auto' }}
            >
              Why this decision
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="decision__fact">
      <span className="label">{label}</span>
      <span className="decision__fact-value">{value}</span>
    </div>
  );
}

/**
 * Shown in place of the decision surface when the agent has never run.
 * A truthful empty state, not a zeroed-out version of the real component.
 */
export function NoDecisionYet() {
  return (
    <div className="decision">
      <div className="decision__inner">
        <div className="decision__head">
          <span className="label">Current decision</span>
          <Chip tone="quiet">Awaiting first session</Chip>
        </div>
        <div className="decision__body">
          <div className="decision__call">
            <span className="decision__direction" data-direction="NO_TRADE">
              No decision yet
            </span>
            <span className="decision__market">
              The agent has not observed a market in this data directory.
            </span>
          </div>
        </div>
        <div className="decision__foot">
          <p className="prose" style={{ fontSize: 'var(--fs-small)', margin: 0 }}>
            Run a session with <code>npm run agent:preview</code> from the project root.
            The decision, the experiences it retrieved, and the memory it creates will
            appear here.
          </p>
        </div>
      </div>
    </div>
  );
}
