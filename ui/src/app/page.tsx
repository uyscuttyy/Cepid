import Link from 'next/link';
import { Band, EmptyState, InlineFact, Metric, Metrics, Notice, PageHead } from '@/components/Primitives';
import { CurrentDecision, NoDecisionYet } from '@/components/CurrentDecision';
import { MemoryFlow } from '@/components/MemoryFlow';
import { MemoryRetrieval } from '@/components/MemoryRetrieval';
import { MemoryRow } from '@/components/Experience';
import { AgentStatus } from '@/components/AgentStatus';
import {
  getAgentSnapshot,
  getEvents,
  getExperiences,
  getPatterns,
  getPerformance,
  getScars,
} from '@/lib/data';
import {
  deriveActivity,
  deriveAgentState,
  deriveLatestDecision,
  deriveMaxDrawdown,
  derivePnlTrail,
} from '@/lib/view';
import {
  DASH,
  formatClock,
  formatCount,
  formatPercent,
  formatUsdc,
  formatUsdcSigned,
  networkLabel,
  pnlTone,
} from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * OVERVIEW — the answer to "what is CEPID doing right now?"
 *
 * Order of the page is the order of the question: state, the decision, why it
 * made that decision, what it retrieved, how it is doing, what just happened.
 * Every value is read from the agent's own data directory; where there is none,
 * the section says so.
 */
export default async function OverviewPage() {
  const [snapshot, events, experiences, perf, patterns, scars] = await Promise.all([
    getAgentSnapshot(),
    getEvents(),
    getExperiences(),
    getPerformance(),
    getPatterns(),
    getScars(),
  ]);

  const state = deriveAgentState(events);
  const decision = deriveLatestDecision(events, experiences);
  const activity = deriveActivity(events, 8);
  const trail = derivePnlTrail(experiences);
  const drawdown = deriveMaxDrawdown(trail);
  const recent = [...experiences]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const settled = perf.wins + perf.losses;
  const isSimulated = snapshot.network === 'mock';

  return (
    <div className="page">
      {/* ---------------------------------------------------------------- hero */}
      <div className="hero">
        <div className="hero__top">
          <AgentStatus state={state} showTime />
          <span className="hero__divider" aria-hidden="true" />
          <span className="label" style={{ letterSpacing: '0.14em' }}>
            {networkLabel(snapshot.network)}
          </span>
        </div>

        <h1 className="hero__title">A trading agent that remembers.</h1>
        <p className="hero__lede">
          CEPID doesn&rsquo;t just remember whether a trade won or lost. It remembers the{' '}
          <strong>conditions that surrounded the decision</strong> — and weighs those
          experiences the next time it trades.
        </p>
      </div>

      {isSimulated && (
        <div style={{ marginBottom: 'var(--s-6)' }}>
          <Notice title="Simulated" tone="warn">
            The agent is configured with <code>CEPID_NETWORK=mock</code>. Markets, fills,
            and settlements are generated locally — no network or chain interaction occurs.
            Everything shown below is real recorded agent output against that simulation.
          </Notice>
        </div>
      )}

      {/* ------------------------------------------------------ the decision */}
      <Band tight>
        {decision ? (
          <CurrentDecision decision={decision} state={state} />
        ) : (
          <NoDecisionYet />
        )}
      </Band>

      {/* --------------------------------------------- why, and what it recalled */}
      {decision && (
        <Band
          title="Why CEPID made this decision"
          hint={
            <Link className="link" href="/decision">
              Full reasoning →
            </Link>
          }
        >
          <div className="split">
            <MemoryFlow decision={decision} />

            <div className="stack">
              <div>
                <div className="band__head">
                  <h3 className="band__title">Memory retrieval</h3>
                  {decision.retrieved.length > 0 && (
                    <span className="band__hint">ranked by retrieval score</span>
                  )}
                </div>
                <MemoryRetrieval retrieved={decision.retrieved.slice(0, 5)} />
                {decision.retrieved.length > 5 && (
                  <p style={{ marginTop: 'var(--s-4)' }}>
                    <Link className="link" href="/decision">
                      {decision.retrieved.length - 5} more retrieved →
                    </Link>
                  </p>
                )}
              </div>
            </div>
          </div>
        </Band>
      )}

      {/* ------------------------------------------------------- performance */}
      <Band
        title="Performance"
        hint={
          <Link className="link" href="/performance">
            Detail →
          </Link>
        }
      >
        {perf.trades === 0 ? (
          <EmptyState
            title="No trades yet"
            body="CEPID has not submitted an order in this data directory. Once it trades, realized PnL, win rate, and drawdown appear here — computed from settled outcomes only."
          />
        ) : (
          <Metrics>
            <Metric
              label="Realized PnL"
              value={formatUsdcSigned(perf.realizedPnl)}
              tone={pnlTone(perf.realizedPnl)}
              sub={settled > 0 ? `across ${settled} settled` : 'nothing settled yet'}
            />
            <Metric
              label="Win rate"
              value={settled > 0 ? formatPercent(perf.winRate) : DASH}
              tone={settled > 0 ? 'blue' : 'muted'}
              sub={settled > 0 ? `${perf.wins}W · ${perf.losses}L` : 'awaiting settlement'}
            />
            <Metric
              label="Trades"
              value={formatCount(perf.trades)}
              sub={perf.pending > 0 ? `${perf.pending} open` : 'all settled'}
            />
            <Metric
              label="Max drawdown"
              value={drawdown === null ? DASH : formatUsdc(drawdown)}
              tone={drawdown === null ? 'muted' : 'neg'}
              sub={drawdown === null ? 'needs more history' : 'peak to trough'}
            />
          </Metrics>
        )}
      </Band>

      {/* ------------------------------------------------------------ memory */}
      <Band
        title="Memory"
        hint={
          <Link className="link" href="/memory">
            All experiences →
          </Link>
        }
      >
        <div className="split">
          <div>
            {recent.length === 0 ? (
              <EmptyState
                title="No experiences yet"
                body="CEPID hasn't created its first trading memory. Once the agent begins trading, its experiences will appear here — each one holding the conditions, the decision, the outcome, and the lesson."
              />
            ) : (
              <div className="rows rows--memories">
                {recent.map((e) => (
                  <MemoryRow key={e.id} exp={e} />
                ))}
              </div>
            )}
          </div>

          <div className="stack">
            <div className="inline-facts">
              <InlineFact
                label="Experiences"
                value={formatCount(snapshot.meta.experienceCount)}
              />
              <InlineFact label="Patterns" value={formatCount(patterns.length)} />
              <InlineFact label="Scars" value={formatCount(scars.length)} />
            </div>

            {patterns.length > 0 && (
              <div>
                <span className="label">Strongest pattern</span>
                <p className="prose" style={{ fontSize: 'var(--fs-small)', marginTop: 'var(--s-2)' }}>
                  {[...patterns].sort((a, b) => b.strength - a.strength)[0]!.description}
                </p>
              </div>
            )}

            {scars.length > 0 && (
              <div>
                <span className="label">Active scars</span>
                <p className="prose" style={{ fontSize: 'var(--fs-small)', marginTop: 'var(--s-2)' }}>
                  {[...scars].sort((a, b) => b.strength - a.strength)[0]!.description}
                </p>
              </div>
            )}

            {patterns.length === 0 && scars.length === 0 && experiences.length > 0 && (
              <p className="prose" style={{ fontSize: 'var(--fs-small)' }}>
                No patterns have formed yet. A pattern needs at least three experiences
                sharing the same market conditions.
              </p>
            )}
          </div>
        </div>
      </Band>

      {/* ---------------------------------------------------------- activity */}
      <Band
        title="Activity"
        hint={
          activity.length > 0 ? (
            <Link className="link" href="/timeline">
              Full timeline →
            </Link>
          ) : undefined
        }
      >
        {activity.length === 0 ? (
          <EmptyState
            title="No recorded activity"
            body="The agent's event log is empty. Every market it observes, memory it retrieves, decision it generates, and order it submits is appended there and shown here."
          />
        ) : (
          <div className="activity">
            {activity.map((item, i) => (
              <div
                className="activity__item"
                key={`${item.at}-${i}`}
                data-latest={i === 0 ? 'true' : 'false'}
              >
                <span className="activity__time">{formatClock(item.at)}</span>
                <span className="activity__body">
                  <span className="activity__what">
                    {item.href ? (
                      <Link className="link" href={item.href}>
                        {item.what}
                      </Link>
                    ) : (
                      item.what
                    )}
                  </span>
                  {item.detail && <span className="activity__detail">{item.detail}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </Band>
    </div>
  );
}
