import { EmptyState, Section, Stat } from '@/components/Primitives';
import { getExperiences, getPerformance } from '@/lib/data';
import { formatPercent, formatPctSigned, formatUsdc } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function PerformancePage() {
  const [perf, experiences] = await Promise.all([getPerformance(), getExperiences()]);

  const wins = experiences.filter((e) => e.outcome.outcome === 'WIN');
  const losses = experiences.filter((e) => e.outcome.outcome === 'LOSS');

  return (
    <div className="page">
      <header className="page__header">
        <span className="page__eyebrow">Performance</span>
        <h1 className="page__title">
          {formatUsdc(perf.totalPnl)} <span style={{ color: 'var(--ink-3)', fontSize: '1rem' }}>total PnL</span>
        </h1>
        <p className="page__sub">
          All numbers come from the recorded trade history. A fresh agent will show no
          numbers at all — that is the truthful empty state.
        </p>
      </header>

      {perf.trades === 0 ? (
        <EmptyState
          title="No performance yet"
          body="Run the agent and execute at least one trade. The first numbers will appear here automatically."
        />
      ) : (
        <>
          <div className="cols">
            <Section title="Counts">
              <Stat label="Trades" value={perf.trades.toString()} />
              <Stat label="Wins" value={perf.wins.toString()} sub={formatPercent(perf.wins / perf.trades, 0) + ' of trades'} />
              <Stat label="Losses" value={perf.losses.toString()} sub={formatPercent(perf.losses / perf.trades, 0) + ' of trades'} />
              <Stat label="Pending" value={perf.pending.toString()} sub="awaiting settlement" />
            </Section>
            <Section title="PnL">
              <Stat
                label="Realized"
                value={formatUsdc(perf.realizedPnl)}
                trend={perf.realizedPnl > 0 ? 'up' : perf.realizedPnl < 0 ? 'down' : 'neutral'}
              />
              <Stat label="Average / trade" value={formatUsdc(perf.averagePnl)} />
              <Stat label="Win rate" value={formatPercent(perf.winRate)} />
            </Section>
          </div>

          {(perf.bestTrade || perf.worstTrade) && (
            <Section title="Extremes">
              {perf.bestTrade && (
                <Stat
                  label="Best trade"
                  value={formatUsdc(perf.bestTrade.pnl)}
                  sub={perf.bestTrade.id}
                  trend="up"
                />
              )}
              {perf.worstTrade && perf.worstTrade.id !== perf.bestTrade?.id && (
                <Stat
                  label="Worst trade"
                  value={formatUsdc(perf.worstTrade.pnl)}
                  sub={perf.worstTrade.id}
                  trend="down"
                />
              )}
            </Section>
          )}
        </>
      )}

      {(wins.length > 0 || losses.length > 0) && (
        <Section title="By outcome">
          {wins.slice(0, 10).map((e) => (
            <div key={e.id} className="row">
              <span className="row__id">{e.id.slice(0, 8)}</span>
              <span className="row__title">
                {e.asset} · {e.timeframe} · {e.decision.direction}
              </span>
              <span className="row__meta" style={{ color: 'var(--pos)' }}>
                {formatPctSigned(e.outcome.pnl, 1)}
              </span>
            </div>
          ))}
          {losses.slice(0, 10).map((e) => (
            <div key={e.id} className="row">
              <span className="row__id">{e.id.slice(0, 8)}</span>
              <span className="row__title">
                {e.asset} · {e.timeframe} · {e.decision.direction}
              </span>
              <span className="row__meta" style={{ color: 'var(--neg)' }}>
                {formatPctSigned(e.outcome.pnl, 1)}
              </span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
