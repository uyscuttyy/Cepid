import { Section, Stat } from '@/components/Primitives';
import { getAgentSnapshot, getExperiences, getPatterns, getScars } from '@/lib/data';
import { formatAddress, formatUsdc } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function AgentPage() {
  const [snapshot, experiences, patterns, scars] = await Promise.all([
    getAgentSnapshot(),
    getExperiences(),
    getPatterns(),
    getScars(),
  ]);

  return (
    <div className="page">
      <header className="page__header">
        <span className="page__eyebrow">Agent profile</span>
        <h1 className="page__title">CEPID</h1>
        <p className="page__sub">
          A trading agent with experiential memory. The strategy is deterministic;
          memory informs the decision; the risk engine enforces hard limits.
        </p>
      </header>

      <div className="cols">
        <Section title="Identity">
          <Stat label="Name" value="CEPID" sub="Continuity Experience & Persistent Institutional Decision-memory" />
          <Stat label="Network" value={snapshot.network} sub={snapshot.rpcUrl || 'no RPC configured'} />
          <Stat label="Wallet" value={formatAddress(snapshot.walletAddress, 8, 6)} sub="Local signer (env-only, never logged)" />
        </Section>
        <Section title="Strategy">
          <Stat label="Base strategy" value="Deterministic midpoint" sub="YES when midpoint > 0.5, NO otherwise" />
          <Stat
            label="Memory influence"
            value="Weighted retrieval + scar penalty"
            sub="Aligned LOSS: -0.25 × weight, strong scars: extra -0.15 × similarity"
          />
          <Stat
            label="NO_TRADE threshold"
            value="Final confidence < 50%"
            sub="Vetoed decisions are never executed"
          />
        </Section>
      </div>

      <div className="cols">
        <Section title="Risk limits" hint="from .env (CEPID_*)">
          <Stat label="Per-order cap" value={formatUsdc(snapshot.risk.maxCollateralUsdc)} sub="USDC" />
          <Stat label="Session cap" value={formatUsdc(snapshot.risk.sessionMaxCollateralUsdc)} sub="USDC" />
          <Stat label="Session orders" value={snapshot.risk.sessionMaxOrders.toString()} sub="max orders / session" />
          <Stat label="Max slippage" value={`${snapshot.risk.maxSlippageBps} bps`} sub="0.01% = 1 bps" />
        </Section>
        <Section title="Memory" hint="live counts">
          <Stat label="Experiences" value={snapshot.meta.experienceCount.toLocaleString()} />
          <Stat label="Patterns" value={snapshot.meta.patternCount.toString()} sub={`${patterns.length} active`} />
          <Stat label="Scars" value={snapshot.meta.scarCount.toString()} sub={`${scars.length} active`} />
          <Stat label="Pnl scale" value={`${snapshot.meta.pnlScale.toFixed(3)} USDC`} sub="75th percentile, used to size importance" />
        </Section>
      </div>

      <Section title="Markets supported">
        <ul className="reasoning">
          <li>BTC 15-minute binary markets</li>
          <li>ETH 15-minute binary markets</li>
          <li>BTC 1-hour binary markets</li>
          <li>ETH 1-hour binary markets</li>
        </ul>
      </Section>

      <Section title="Execution states" hint="what the agent reports">
        <ul className="reasoning">
          <li>IDLE — no decision in flight</li>
          <li>ANALYZING — fetching market state and memory</li>
          <li>DECISION_MADE — base strategy + memory influence computed</li>
          <li>RISK_CHECK — risk engine evaluated the intent</li>
          <li>SIGNING — building the order payload</li>
          <li>SUBMITTED — transaction broadcast</li>
          <li>CONFIRMED — receipt received, outcome resolved</li>
          <li>POSITION_OPEN — order submitted, awaiting settlement</li>
          <li>REJECTED — risk or memory vetoed</li>
          <li>FAILED — provider or chain error</li>
        </ul>
      </Section>
    </div>
  );
}
