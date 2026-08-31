'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AgentState } from '@/lib/view';
import { AgentStatus } from './AgentStatus';
import { MemoryGlyph } from './Primitives';
import { formatAddress, networkLabel } from '@/lib/format';

/**
 * The identity rail.
 *
 * On desktop this is a fixed column: the mark, the navigation, and the agent's
 * live state. It is deliberately not a generic sidebar — "what is the agent
 * doing" is always on screen, because that is the product's whole proposition.
 *
 * Below 900px the same content becomes a sticky header with a scrollable nav
 * strip. Both renders share this component so the nav can never drift apart.
 *
 * Nav entries map only to routes that exist. Counts come from the agent's own
 * memory metadata; when the data directory is unreadable they are simply absent
 * rather than shown as zero.
 */

interface NavItem {
  href: string;
  label: string;
  /** Real count from agent data, or null when unknown. */
  count?: number | null;
}

export function Nav({
  state,
  network,
  walletAddress,
  memoryCount,
  tradeCount,
}: {
  state: AgentState;
  network: string;
  walletAddress: string | null;
  memoryCount: number | null;
  tradeCount: number | null;
}) {
  const pathname = usePathname();

  const primary: NavItem[] = [
    { href: '/', label: 'Overview' },
    { href: '/market', label: 'Market' },
    { href: '/decision', label: 'Decision' },
    { href: '/memory', label: 'Memory', count: memoryCount },
    { href: '/trades', label: 'Trades', count: tradeCount },
    { href: '/performance', label: 'Performance' },
  ];

  const secondary: NavItem[] = [
    { href: '/timeline', label: 'Timeline' },
    { href: '/agent', label: 'Agent' },
    { href: '/wallet', label: 'Wallet' },
  ];

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* ------------------------------------------------------- desktop rail */}
      <aside className="rail">
        <div className="brand">
          <Link href="/" className="brand__row" aria-label="CEPID — overview">
            <MemoryGlyph />
            <span className="brand__name">CEPID</span>
          </Link>
          <span className="brand__tag">A trading agent that remembers</span>
        </div>

        <nav className="nav" aria-label="Primary">
          <div className="nav__group">
            {primary.map((n) => (
              <NavLink key={n.href} item={n} active={isActive(n.href)} />
            ))}
          </div>
          <div className="nav__group">
            <span className="nav__group-label">System</span>
            {secondary.map((n) => (
              <NavLink key={n.href} item={n} active={isActive(n.href)} />
            ))}
          </div>
        </nav>

        <div className="rail__foot">
          <AgentStatus state={state} />
          <div className="rail__meta">
            <div className="rail__meta-row">
              <span className="rail__meta-key">Network</span>
              <span className="rail__meta-val">{networkLabel(network)}</span>
            </div>
            <div className="rail__meta-row">
              <span className="rail__meta-key">Signer</span>
              <span className="rail__meta-val" title={walletAddress ?? 'No signer configured'}>
                {formatAddress(walletAddress, 5, 4)}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* --------------------------------------------------- mobile top bar */}
      <header className="topbar">
        <div className="topbar__row">
          <Link href="/" className="brand__row" aria-label="CEPID — overview">
            <MemoryGlyph size={18} />
            <span className="brand__name" style={{ fontSize: '0.9375rem' }}>
              CEPID
            </span>
          </Link>
          <AgentStatus state={state} />
        </div>
        <nav className="topbar__nav" aria-label="Primary">
          {[...primary, ...secondary].map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="nav__link"
              data-active={isActive(n.href) ? 'true' : 'false'}
              aria-current={isActive(n.href) ? 'page' : undefined}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className="nav__link"
      data-active={active ? 'true' : 'false'}
      aria-current={active ? 'page' : undefined}
    >
      <span>{item.label}</span>
      {item.count !== null && item.count !== undefined && item.count > 0 && (
        <span className="nav__count">{item.count}</span>
      )}
    </Link>
  );
}
