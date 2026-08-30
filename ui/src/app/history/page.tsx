import { EmptyState, Section, Stat } from '@/components/Primitives';
import { getEvents } from '@/lib/data';
import { formatRelative, formatUsdc, formatAddress } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function HistoryPage() {
  const events = await getEvents();
  const sorted = [...events].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  const approvals = sorted.filter((e) => e.type === 'approval_submitted');
  const orders = sorted.filter((e) => e.type === 'order_submitted');
  const previews = sorted.filter((e) => e.type === 'preview');

  return (
    <div className="page">
      <header className="page__header">
        <span className="page__eyebrow">Trading history</span>
        <h1 className="page__title">{orders.length} executed {orders.length === 1 ? 'trade' : 'trades'}</h1>
        <p className="page__sub">
          Every recorded transaction. Submitting a transaction is not the same as a
          filled trade — only confirmed orders are counted here.
        </p>
      </header>

      <div className="cols">
        <Section title="Counts">
          <Stat label="Previews" value={previews.length.toString()} />
          <Stat label="Approvals" value={approvals.length.toString()} />
          <Stat label="Orders submitted" value={orders.length.toString()} />
        </Section>
        <Section title="Last activity">
          {sorted.length > 0 ? (
            <Stat
              label="Most recent event"
              value={formatRelative(String(sorted[0]!.at))}
              sub={String(sorted[0]!.type)}
            />
          ) : (
            <EmptyState
              title="No events yet"
              body="The event log is empty. Run the agent to start recording."
            />
          )}
        </Section>
      </div>

      <Section title="Submitted orders">
        {orders.length === 0 ? (
          <EmptyState
            title="No trades yet"
            body="No completed trades yet. The agent is waiting for its first market opportunity."
          />
        ) : (
          orders.map((e) => {
            const txHash = String(e.hash ?? '');
            const marketId = String(e.marketId ?? '');
            const direction = String(e.direction ?? '');
            const collateral = Number(e.collateral ?? 0);
            return (
              <div key={txHash + marketId} className="row">
                <span className="row__id">{formatAddress(txHash, 8, 6)}</span>
                <span className="row__title">
                  <span style={{ marginRight: 'var(--s-2)' }}>{marketId}</span>
                  <span className="tag">{direction}</span>
                </span>
                <span className="row__meta">
                  {collateral > 0 ? formatUsdc(collateral) : '—'} · {formatRelative(String(e.at))}
                </span>
              </div>
            );
          })
        )}
      </Section>
    </div>
  );
}
