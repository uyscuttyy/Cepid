import { Banner, EmptyState, Section, Stat } from '@/components/Primitives';
import { getAgentSnapshot, getEvents } from '@/lib/data';
import { formatPrice, formatRelative, formatAddress } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function MarketPage() {
  const [snapshot, events] = await Promise.all([getAgentSnapshot(), getEvents()]);

  // Pull the most recent preview event, which contains the market snapshot.
  const previews = events
    .filter((e) => e.type === 'preview')
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const lastPreview = previews[0];
  const market = lastPreview ? (lastPreview as Record<string, unknown>).market as Record<string, unknown> | undefined : null;
  const intent = lastPreview ? (lastPreview as Record<string, unknown>).intent as Record<string, unknown> | undefined : null;
  const network = snapshot.network;
  const isSimulated = network === 'mock';

  return (
    <div className="page">
      <header className="page__header">
        <span className="page__eyebrow">Live market</span>
        <h1 className="page__title">{market ? String(market.title ?? market.id) : 'No market data'}</h1>
        <p className="page__sub">
          The most recent market observed by CEPID. In development mode the market is
          deterministic. On a live network this reflects the current state of the
          configured provider.
        </p>
      </header>

      {isSimulated && (
        <div style={{ marginBottom: 'var(--s-5)' }}>
          <Banner kind="sim" title="Development mode">
            Markets, order books, and fills come from the local mock provider. Switch
            CEPID_NETWORK to <code>base-sepolia</code> or <code>base</code> in{' '}
            <code>.env</code> for real data.
          </Banner>
        </div>
      )}

      {!market && (
        <EmptyState
          title="No market observed yet"
          body="Run the agent (preview or execute) and the most recent market snapshot will appear here."
        />
      )}

      {market && (
        <>
          <div className="cols">
            <Section title="Market">
              <Stat label="Asset" value={String(market.asset ?? '—')} />
              <Stat label="Timeframe" value={String(market.timeframe ?? '—')} />
              <Stat
                label="YES price"
                value={typeof market.yesPrice === 'number' ? formatPrice(market.yesPrice) : '—'}
                sub="implied probability"
              />
              <Stat
                label="Expires"
                value={
                  market.expiresAt
                    ? new Date(Number(market.expiresAt) * 1000).toLocaleTimeString()
                    : '—'
                }
                sub={
                  market.expiresAt
                    ? formatRelative(new Date(Number(market.expiresAt) * 1000).toISOString())
                    : '—'
                }
              />
            </Section>

            <Section title="Order book" hint={market.id ? String(market.id) : ''}>
              <Stat
                label="Best bid"
                value={String(market.bestBid ?? '—')}
                sub={market.yesBidSize ? `${market.yesBidSize} shares` : '—'}
              />
              <Stat
                label="Best ask"
                value={String(market.bestAsk ?? '—')}
                sub={market.yesAskSize ? `${market.yesAskSize} shares` : '—'}
              />
              <Stat
                label="Midpoint"
                value={typeof market.yesPrice === 'number' ? formatPrice(market.yesPrice) : '—'}
              />
            </Section>
          </div>

          {intent && (
            <Section title="CEPID's read of this market">
              <Stat
                label="Base decision"
                value={String(intent.direction ?? '—')}
                sub={String(intent.reason ?? '')}
              />
              <Stat
                label="Base confidence"
                value={`${(((intent.baseConfidence as number) ?? 0) * 100).toFixed(0)}%`}
              />
              <Stat
                label="Hypothetical order"
                value={
                  intent.direction === 'NO_TRADE'
                    ? 'No order'
                    : `${(intent.shares as number)} @ ${formatPrice((intent.price as number))} USDC`
                }
              />
            </Section>
          )}

          <Section title="Connection">
            <Stat label="Network" value={network} />
            <Stat label="RPC" value={snapshot.rpcUrl || '—'} />
            <Stat
              label="Agent wallet"
              value={formatAddress(snapshot.walletAddress)}
              sub={snapshot.walletAddress ?? 'no signer configured'}
            />
          </Section>
        </>
      )}

      <Section title="Observability" hint="from the event log">
        <Stat label="Preview events" value={previews.length.toString()} />
        <Stat
          label="Last preview"
          value={lastPreview ? formatRelative(String(lastPreview.at)) : '—'}
        />
      </Section>
    </div>
  );
}
