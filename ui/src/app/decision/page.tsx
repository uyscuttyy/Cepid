import Link from 'next/link';
import {
  Band,
  EmptyState,
  InlineFact,
  KV,
  KVRow,
  Meter,
  Notice,
  PageHead,
  Panel,
  Reasons,
} from '@/components/Primitives';
import { CurrentDecision, NoDecisionYet } from '@/components/CurrentDecision';
import { MemoryFlow } from '@/components/MemoryFlow';
import { MemoryRetrieval } from '@/components/MemoryRetrieval';
import { Conditions } from '@/components/Experience';
import { getEvents, getExperiences } from '@/lib/data';
import { deriveAgentState, deriveLatestDecision } from '@/lib/view';
import {
  DASH,
  directionLabel,
  formatDateTime,
  formatPctSigned,
  formatPercent,
  formatPrice,
  formatRelative,
  formatTimeRemaining,
  formatUsdc,
  marketOf,
} from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = { title: 'Decision' };

/**
 * DECISION — "why did you make this decision?"
 *
 * The full reasoning chain for the most recent recorded decision: the call, the
 * loop that produced it, the experiences retrieved, how much they moved the
 * confidence, and the agent's own decision log verbatim.
 *
 * The influence figures shown are the ones the decision engine recorded
 * (`baseConfidence`, `memoryInfluence`, `finalConfidence`). No influence score
 * is invented for stages the engine does not quantify.
 */
export default async function DecisionPage() {
  const [events, experiences] = await Promise.all([getEvents(), getExperiences()]);
  const state = deriveAgentState(events);
  const decision = deriveLatestDecision(events, experiences);

  if (!decision) {
    return (
      <div className="page">
        <PageHead
          eyebrow="Decision"
          title="No decision has been recorded"
          sub="This is the most important view in CEPID: it shows exactly how memory changed — or did not change — the agent's call."
        />
        <NoDecisionYet />
      </div>
    );
  }

  const d = decision.decision;
  const m = decision.market;
  const vetoed =
    d.direction === 'NO_TRADE' &&
    decision.base.direction !== null &&
    decision.base.direction !== 'NO_TRADE';

  const influence = d.memoryInfluence;
  const collateral =
    decision.base.shares !== null && decision.base.price !== null
      ? decision.base.shares * decision.base.price
      : decision.risk.collateral;

  return (
    <div className="page">
      <PageHead
        eyebrow="Decision"
        aside={<span className="mono">{formatRelative(decision.at)}</span>}
        title="Why CEPID made this decision"
        sub="Every figure below was recorded by the decision engine at the moment of the call. Nothing is recomputed or estimated here."
      />

      {decision.risk.approved === false && (
        <div style={{ marginBottom: 'var(--s-6)' }}>
          <Notice title="Risk refused" tone="neg">
            {decision.risk.reasons.length > 0
              ? decision.risk.reasons.join(' · ')
              : 'The risk engine refused this order. Memory never bypasses risk.'}
          </Notice>
        </div>
      )}

      <Band tight>
        <CurrentDecision decision={decision} state={state} href={null} />
      </Band>

      {/* ------------------------------------------------- the loop, in full */}
      <Band title="The loop" hint="current conditions through to the memory it created">
        <div className="split">
          <MemoryFlow decision={decision} />

          <div className="stack">
            <Panel title="Conditions at decision time">
              {decision.conditions ? (
                <Conditions conditions={decision.conditions} />
              ) : (
                <p className="prose" style={{ fontSize: 'var(--fs-small)' }}>
                  The market context was not recorded with this decision.
                </p>
              )}
            </Panel>

            <Panel title="Market">
              <KV>
                <KVRow k="Market" v={m.title ?? m.id ?? DASH} />
                <KVRow k="Instrument" v={marketOf(m.asset, m.timeframe)} mono />
                <KVRow k="YES price" v={formatPrice(m.yesPrice)} mono />
                <KVRow
                  k="Time left"
                  v={formatTimeRemaining(m.expiresAt)}
                  mono
                />
              </KV>
            </Panel>
          </div>
        </div>
      </Band>

      {/* -------------------------------------------------------- retrieval */}
      <Band
        title="Memory retrieval"
        hint={
          decision.retrieved.length > 0
            ? 'expand a memory to see the lesson the agent recorded'
            : undefined
        }
      >
        <MemoryRetrieval retrieved={decision.retrieved} />
      </Band>

      {/* --------------------------------------------------------- influence */}
      <Band title="How memory changed the call">
        <div className="split">
          <div className="stack stack--loose">
            <Meter
              label="Base confidence"
              value={d.baseConfidence}
              display={formatPercent(d.baseConfidence)}
              tone="muted"
            />
            <Meter
              label="Memory influence"
              value={influence}
              display={influence === null ? DASH : formatPctSigned(influence)}
              tone={influence !== null && influence < 0 ? 'neg' : 'pos'}
              signed
            />
            <Meter
              label="Final confidence"
              value={d.finalConfidence}
              display={formatPercent(d.finalConfidence)}
            />

            <p className="prose" style={{ fontSize: 'var(--fs-small)' }}>
              {influence === null || Math.abs(influence) < 0.0005 ? (
                <>
                  Memory did not move this decision. The final confidence is the base
                  strategy&rsquo;s own reading.
                </>
              ) : influence < 0 ? (
                <>
                  Retrieved experiences pulled confidence <strong>down</strong> by{' '}
                  {formatPctSigned(Math.abs(influence))} — similar setups that ended badly
                  count against the trade.
                </>
              ) : (
                <>
                  Retrieved experiences pushed confidence <strong>up</strong> by{' '}
                  {formatPctSigned(influence)} — similar setups resolved in favour of this
                  direction.
                </>
              )}
            </p>
          </div>

          <div className="stack">
            <Panel title="Outcome of the reconciliation" tone="blue">
              <KV>
                <KVRow k="Base strategy" v={directionLabel(decision.base.direction)} mono />
                <KVRow k="After memory" v={directionLabel(d.direction)} mono />
                <KVRow
                  k="Threshold"
                  v="50% final confidence"
                  mono
                />
                <KVRow
                  k="Result"
                  v={
                    vetoed
                      ? 'Memory veto — no order'
                      : d.direction === 'NO_TRADE'
                        ? 'No edge found — no order'
                        : 'Trade allowed'
                  }
                />
              </KV>
            </Panel>

            <div className="inline-facts">
              <InlineFact
                label="Memories cited"
                value={d.memoryIds.length > 0 ? d.memoryIds.length : DASH}
              />
              <InlineFact
                label="Collateral"
                value={d.direction === 'NO_TRADE' ? DASH : formatUsdc(collateral)}
              />
              <InlineFact
                label="Risk"
                value={
                  decision.risk.approved === null
                    ? DASH
                    : decision.risk.approved
                      ? 'Approved'
                      : 'Refused'
                }
              />
            </div>
          </div>
        </div>
      </Band>

      {/* ------------------------------------------------------- reasoning log */}
      <Band title="Decision log" hint="written by the engine, in order">
        {d.reasoning.length > 0 ? (
          <Reasons items={d.reasoning} />
        ) : (
          <EmptyState
            title="No log recorded"
            body="This decision was written without a reasoning trace."
          />
        )}
      </Band>

      {/* ---------------------------------------------------------- provenance */}
      <Band title="Provenance" tight>
        <KV>
          <KVRow k="Recorded at" v={formatDateTime(decision.at)} mono />
          <KVRow k="Agent state" v={decision.state ?? DASH} mono />
          <KVRow k="Base reason" v={decision.base.reason ?? DASH} />
          <KVRow
            k="Memory created"
            v={
              decision.experienceId ? (
                <Link className="link" href={`/memory/${decision.experienceId}`}>
                  {decision.experienceId}
                </Link>
              ) : (
                'None — no experience was stored for this decision'
              )
            }
            mono
          />
        </KV>
      </Band>
    </div>
  );
}
