import Link from 'next/link';
import { MemoryGlyph } from './Primitives';
import { formatAddress } from '@/lib/format';
import { getClient } from '@/lib/data';
import { CepidClientError } from '@/lib/cepid';

/**
 * The identity rail.
 *
 * On desktop this is a fixed column: the mark, the navigation, and live
 * platform state (agents connected, substrate health, key prefix). On
 * mobile it becomes a sticky header with a scrollable nav strip.
 *
 * Everything shown here is read from the live /v1/* API through the typed
 * client — no local file reads, no agent-private knowledge. The rail
 * answers "what is the platform doing, right now" for any viewer.
 */
export async function Nav() {
  const client = getClient();
  const [agents, readiness] = await Promise.all([
    client.listAgents().catch((e: unknown) => {
      // API down — show empty rail rather than failing the whole layout.
      if (e instanceof CepidClientError && e.code === 'UNAUTHORIZED') return [];
      return null;
    }),
    client.getReadiness().catch(() => null),
  ]);

  const agentCount = agents?.length ?? null;
  const platformUp = readiness?.ok === true;
  const substrateUp = readiness?.substrate === 'ok';

  return (
    <>
      <aside className="rail">
        <div className="brand">
          <Link href="/" className="brand__row" aria-label="CEPID — overview">
            <MemoryGlyph />
            <span className="brand__name">CEPID</span>
          </Link>
          <span className="brand__tag">Memory infrastructure for autonomous agents</span>
        </div>

        <nav className="nav" aria-label="Primary">
          <div className="nav__group">
            <NavLink href="/" label="Overview" />
            <NavLink href="/memories" label="Memories" />
            <NavLink href="/agents" label="Agents" count={agentCount} />
            <NavLink href="/activity" label="Activity" />
          </div>
          <div className="nav__group">
            <span className="nav__group-label">Reference</span>
            <NavLink href="/demo" label="Demo" />
            <NavLink href="/developers" label="Developers" />
          </div>
        </nav>

        <div className="rail__foot">
          <Substrate status={platformUp ? (substrateUp ? 'live' : 'degraded') : 'down'} />
          <div className="rail__meta">
            <div className="rail__meta-row">
              <span className="rail__meta-key">API</span>
              <span className="rail__meta-val">
                {platformUp ? 'reachable' : 'unreachable'}
              </span>
            </div>
            <div className="rail__meta-row">
              <span className="rail__meta-key">Sibyl</span>
              <span className="rail__meta-val">
                {platformUp ? (substrateUp ? 'connected' : 'disconnected') : '—'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <div className="topbar__row">
          <Link href="/" className="brand__row" aria-label="CEPID — overview">
            <MemoryGlyph size={18} />
            <span className="brand__name" style={{ fontSize: '0.9375rem' }}>CEPID</span>
          </Link>
          <Substrate status={platformUp ? (substrateUp ? 'live' : 'degraded') : 'down'} />
        </div>
        <nav className="topbar__nav" aria-label="Primary">
          {[
            { href: '/', label: 'Overview' },
            { href: '/memories', label: 'Memories' },
            { href: '/agents', label: 'Agents' },
            { href: '/activity', label: 'Activity' },
            { href: '/demo', label: 'Demo' },
            { href: '/developers', label: 'Developers' },
          ].map((n) => (
            <Link key={n.href} href={n.href} className="nav__link">{n.label}</Link>
          ))}
        </nav>
      </header>
    </>
  );
}

function NavLink({ href, label, count }: { href: string; label: string; count?: number | null }) {
  return (
    <Link href={href} className="nav__link">
      <span>{label}</span>
      {count !== null && count !== undefined && count > 0 ? (
        <span className="nav__count">{count}</span>
      ) : null}
    </Link>
  );
}

function Substrate({ status }: { status: 'live' | 'degraded' | 'down' }) {
  const tone = status === 'live' ? 'live' : status === 'degraded' ? 'held' : 'fault';
  const label = status === 'live' ? 'Live' : status === 'degraded' ? 'Degraded' : 'Offline';
  return (
    <span className="agent-state" data-tone={tone}>
      <span className="agent-state__dot" aria-hidden="true" />
      <span className="agent-state__label">{label}</span>
    </span>
  );
}
