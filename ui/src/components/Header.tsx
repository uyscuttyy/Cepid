'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AgentSnapshot } from '@/lib/types';
import { formatAddress } from '@/lib/format';

const NAV: Array<{ href: string; label: string }> = [
  { href: '/', label: 'Overview' },
  { href: '/market', label: 'Market' },
  { href: '/decision', label: 'Decision' },
  { href: '/memory', label: 'Memory' },
  { href: '/timeline', label: 'Timeline' },
  { href: '/history', label: 'History' },
  { href: '/performance', label: 'Performance' },
  { href: '/agent', label: 'Agent' },
];

export function Header() {
  const pathname = usePathname();
  const [snapshot, setSnapshot] = useState<AgentSnapshot | null>(null);

  useEffect(() => {
    let cancel = false;
    fetch('/api/agent')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancel) setSnapshot(d); })
      .catch(() => { /* agent offline / data dir missing */ });
    return () => { cancel = true; };
  }, []);

  const network = snapshot?.network ?? '—';
  const wallet = snapshot?.walletAddress ?? null;

  return (
    <header className="app__header">
      <div className="app__header-inner">
        <Link href="/" className="brand" aria-label="CEPID home">
          <span className="brand__mark">CEPID</span>
          <span className="brand__tag">trading agent · v0.1</span>
        </Link>

        <nav className="nav" aria-label="Primary">
          {NAV.map((n) => {
            const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className="nav__link"
                data-active={active ? 'true' : 'false'}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="app__status" aria-label="Agent status">
          <span className="status-dot" data-state={snapshot ? 'active' : 'warning'} />
          <span>{network}</span>
          <span aria-hidden="true">·</span>
          <span title={wallet ?? 'no wallet'}>{formatAddress(wallet)}</span>
        </div>
      </div>
    </header>
  );
}
