import Link from 'next/link';
import {
  Band,
  Chip,
  EmptyState,
  KV,
  KVRow,
  Metric,
  Metrics,
  Notice,
  PageHead,
  Panel,
} from '@/components/Primitives';
import { Conditions } from '@/components/Experience';
import { AgentStatus } from '@/components/AgentStatus';
import { getAgentSnapshot, getEvents, getExperiences } from '@/lib/data';
import { deriveAgentState, deriveDecisionHistory, deriveLatestDecision } from '@/lib/view';
import {
  DASH,
  directionLabel,
  formatDateTime,
  formatPercent,
  formatPrice,
  formatRelative,
  formatTimeRemaining,
  marketOf,
  networkLabel,
} from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = { title: 'Market' };

/**
 * MARKET — what CEPID sees.
 *
 * An observation environment, not a trading terminal. The question this page
 * answers is "what is in front of the agent, and how does it read it?" — so the
 * market identity and the derived conditions lead, and the order-book numbers
 * are supporting detail.
 *
 * Only fields the provider actually returned are rendered. The mock and Base
 * Sepolia providers report different subsets, so absent values show as an em
 * dash instead of a plausible-looking zero.
 */
export default async function MarketPage() {
  const [snapshot, events, experiences] = await Promise.all([
    getAgentSnapshot(),
    getEvents(),
    getExperiences(),
  ]);

  const state = deriveAgentState(events);
  const decision = deriveLatestDecision(events, experiences);
  const history = deriveDecisionHistory(events, experiences, 40);

  // Distinct markets the agent has observed, newest observation first.
  const observed = new Map<string, { title: string | null; at: string; asset: string | null; timeframe: string | null }>();
  for (const h of history) {
    const id = h.market.id;
    if (!id || observed.has(id)) continue;
    observed.set(id, {
      title: h.market.title,
      at: h.at,
      asset: h.market.asset,
      timeframe: h.market.timeframe,
    });
  }

  if (!decision) {
    return (
      <div className="page">
        <PageHead
          eyebrow="Market"
          title="No market observed yet"
          sub="CEPID records a snapshot of every market it observes. Run a session and the most recent observation will appear here."
        />
        <EmptyState
          title="Nothing observed"
          body="The agent has not read a market in this data directory. Run npm run agent:preview from the project root."
        />
      </div>
    );
  }

  const m = decision.market;
  const c = decision.conditions;
  const isSimulated = snapshot.network === 'mock';
  const expired = m.expiresAt !== null && m.expiresAt * 1000 < Date.now();

  return (
    <div className="page">
      <PageHead
        eyebrow="Market"
        aside={<AgentStatus state={state} />}
        title={m.title ?? m.id ?? 'Market'}
        sub="The most recent market CEPID observed, with the conditions it derived from it. These derived conditions — not the raw price — are what memory is matched against."
      />

      {isSimulated && (
        <div style={{ marginBottom: 'var(--s-6)' }}>
          <Notice title="Simulated" tone="warn">
            Prices, order books, and settlements come from the local mock provider. Set{' '}
            <code>CEPID_NETWORK=base-sepolia</code> for on-chain market data.
          </Notice>
        </div>
      )}

      {/* -------------------------------------------------------- the reading */}
      <Band tight>
        <Metrics>
          <Metric
            label="YES price"
            value={formatPrice(m.yesPrice)}
            tone="blue"
            sub="implied probability"
          />
          <Metric
            label="Time remaining"
            value={formatTimeRemaining(m.expiresAt)}
            tone={expired ? 'muted' : undefined}
            sub={
              m.expiresAt !== null
                ? formatDateTime(new Date(m.expiresAt * 1000).toISOString())
                : 'expiry not reported'
            }
          />
          <Metric
            label="Instrument"
            value={marketOf(m.asset, m.timeframe)}
            sub="binary market"
          />
          <Metric
            label="Observed"
            value={formatRelative(decision.at)}
            tone="muted"
            sub={decision.state ?? undefined}
          />
        </Metrics>
      </Band>

      {/* ------------------------------------------- conditions + agent's read */}
      <Band title="What CEPID sees">
        <div className="split">
          <div className="stack">
            <div>
              <div className="band__head">
                <h3 className="band__title">Derived conditions</h3>
                <span className="band__hint">the fingerprint memory matches on</span>
              </div>
              {c ? (
                <Conditions conditions={c} />
              ) : (
                <EmptyState
                  title="No conditions recorded"
                  body="This observation did not include a derived market context."
                />
              )}
            </div>

            <p className="prose" style={{ fontSize: 'var(--fs-small)' }}>
              CEPID does not remember prices. It remembers this shape — asset, timeframe,
              volatility, momentum, liquidity, and time remaining — because that is what
              makes two market moments comparable.
            </p>
          </div>

          <div className="stack">
            <Panel title="The agent's read" tone="blue">
              <KV>
                <KVRow
                  k="Base call"
                  v={directionLabel(decision.base.direction)}
                  mono
                />
                <KVRow
                  k="Base confidence"
                  v={formatPercent(decision.base.confidence)}
                  mono
                />
                <KVRow k="Reason" v={decision.base.reason ?? DASH} />
                <KVRow
                  k="Hypothetical order"
                  v={
                    decision.base.direction === 'NO_TRADE' || decision.base.shares === null
                      ? 'No order'
                      : `${decision.base.shares} @ ${formatPrice(decision.base.price)} USDC`
                  }
                  mono
                />
              </KV>
              <p style={{ marginTop: 'var(--s-4)' }}>
                <Link className="link" href="/decision">
                  See how memory adjusted this →
                </Link>
              </p>
            </Panel>

            <Panel title="Connection">
              <KV>
                <KVRow k="Network" v={networkLabel(snapshot.network)} />
                <KVRow k="RPC" v={snapshot.rpcUrl || 'not configured'} mono />
                <KVRow k="Market id" v={m.id ?? DASH} mono />
              </KV>
            </Panel>
          </div>
        </div>
      </Band>

      {/* ------------------------------------------------- observation history */}
      <Band
        title="Markets observed"
        hint={`${observed.size} distinct ${observed.size === 1 ? 'market' : 'markets'} in the event log`}
      >
        {observed.size === 0 ? (
          <EmptyState
            title="No observation history"
            body="Only the current observation is recorded."
          />
        ) : (
          <div className="rows rows--events">
            {Array.from(observed.entries()).map(([id, o]) => (
              <div className="row" key={id}>
                <span className="row__lead">{marketOf(o.asset, o.timeframe)}</span>
                <span className="row__main">
                  <span className="row__title">
                    {o.title ?? id}
                    {id === m.id && <Chip tone="blue">current</Chip>}
                  </span>
                  <span className="row__sub mono">{id}</span>
                </span>
                <span className="row__trail">{formatRelative(o.at)}</span>
              </div>
            ))}
          </div>
        )}
      </Band>
    </div>
  );
}
