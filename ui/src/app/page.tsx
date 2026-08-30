import { Banner, EmptyState, Section, Stat } from '@/components/Primitives';
import { ExperienceRow } from '@/components/Experience';
import { getAgentSnapshot, getExperiences, getPerformance, getScars } from '@/lib/data';
import { formatPctSigned, formatUsdc, formatRelative } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function OverviewPage() {
  const [snapshot, experiences, perf, scars] = await Promise.all([
    getAgentSnapshot(),
    getExperiences(),
    getPerformance(),
    getScars(),
  ]);

  const network = snapshot.network;
  const isSimulated = network === 'mock';
  const isTestnet = network === 'base-sepolia';
  const recent = experiences.slice(0, 5);
  const latestExperience = recent[0];

  return (
    <div className="page">
      <header className="page__header">
        <span className="page__eyebrow">Overview</span>
        <h1 className="page__title">CEPID</h1>
        <p className="page__sub">
          A trading agent that remembers the conditions behind its previous decisions and
          uses those memories to influence the next decision.
        </p>
      </header>

      {isSimulated && (
        <div style={{ marginBottom: 'var(--s-5)' }}>
          <Banner kind="sim" title="Development mode">
            The agent is running with <code>CEPID_NETWORK=mock</code>. Markets, order
            books, fills, and outcomes are simulated locally. No network or chain
            interaction occurs. Switch to <code>base-sepolia</code> or <code>base</code>{' '}
            in <code>.env</code> to enable real markets.
          </Banner>
        </div>
      )}

      {isTestnet && (
        <div style={{ marginBottom: 'var(--s-5)' }}>
          <Banner kind="ok" title="Connected to Base Sepolia">
            Real on-chain interactions with the self-hosted test market contract. USDC
            is the official Base Sepolia testnet token.
          </Banner>
        </div>
      )}

      <div className="cols">
        <Section title="Agent">
          <Stat
            label="Status"
            value={snapshot.walletAddress ? 'Active' : 'No wallet'}
            sub={snapshot.walletAddress ? 'Local signer loaded' : 'Set AGENT_PRIVATE_KEY in .env'}
          />
          <Stat label="Network" value={network} sub={snapshot.rpcUrl || '—'} />
          <Stat
            label="Memory"
            value={`${snapshot.meta.experienceCount.toLocaleString()} experiences`}
            sub={`${snapshot.meta.patternCount} patterns · ${snapshot.meta.scarCount} scars`}
          />
        </Section>

        <Section title="Last decision">
          {latestExperience ? (
            <>
              <Stat
                label="Direction"
                value={latestExperience.decision.direction}
                trend={latestExperience.decision.direction === 'YES' ? 'up' : latestExperience.decision.direction === 'NO' ? 'down' : 'neutral'}
              />
              <Stat
                label="Final confidence"
                value={`${(latestExperience.decision.finalConfidence * 100).toFixed(0)}%`}
                sub={`Base ${(latestExperience.decision.baseConfidence * 100).toFixed(0)}% · memory ${formatPctSigned(latestExperience.decision.memoryInfluence, 0)}`}
              />
              <Stat
                label="Last activity"
                value={formatRelative(latestExperience.createdAt)}
                sub={latestExperience.outcome.outcome === 'PENDING' ? 'Open position' : `${latestExperience.outcome.outcome} · ${formatUsdc(latestExperience.outcome.pnl)}`}
              />
            </>
          ) : (
            <EmptyState
              title="No decisions yet"
              body="CEPID hasn't traded yet. Its first decisions and memories will appear here."
            />
          )}
        </Section>
      </div>

      <div className="cols">
        <Section title="Performance">
          <Stat label="Trades" value={perf.trades.toString()} />
          <Stat
            label="Win rate"
            value={perf.wins + perf.losses > 0 ? `${(perf.winRate * 100).toFixed(0)}%` : '—'}
            sub={`${perf.wins}W · ${perf.losses}L · ${perf.pending} pending`}
          />
          <Stat
            label="Realized PnL"
            value={formatUsdc(perf.realizedPnl)}
            trend={perf.realizedPnl > 0 ? 'up' : perf.realizedPnl < 0 ? 'down' : 'neutral'}
            sub={perf.averagePnl !== 0 ? `avg ${formatUsdc(perf.averagePnl)} / trade` : undefined}
          />
        </Section>

        <Section title="Risk limits" hint="from .env">
          <Stat label="Per-order cap" value={formatUsdc(snapshot.risk.maxCollateralUsdc)} sub="USDC" />
          <Stat label="Session cap" value={formatUsdc(snapshot.risk.sessionMaxCollateralUsdc)} sub="USDC" />
          <Stat label="Session orders" value={snapshot.risk.sessionMaxOrders.toString()} sub="per session" />
        </Section>
      </div>

      <Section
        title="Recent memories"
        hint={
          <a href="/memory" style={{ textDecoration: 'underline' }}>
            View all →
          </a>
        }
      >
        {recent.length === 0 ? (
          <EmptyState
            title="No memories yet"
            body="CEPID hasn't recorded any experiences. Run the agent to begin building memory."
          />
        ) : (
          recent.map((e) => <ExperienceRow key={e.id} exp={e} href={`/memory/${e.id}`} />)
        )}
      </Section>

      {scars.length > 0 && (
        <Section title="Active scars" hint="strong negative memories">
          {scars.slice(0, 3).map((s) => (
            <div key={s.id} className="row">
              <span className="row__id">{s.id.slice(0, 8)}</span>
              <span className="row__title">
                <span className="tag" data-kind="scar" style={{ marginRight: 'var(--s-2)' }}>scar</span>
                {s.description}
              </span>
              <span className="row__meta">strength {(s.strength * 100).toFixed(0)}%</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
