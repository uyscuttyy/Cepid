'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/memories', label: 'Memories' },
  { href: '/agents', label: 'Agents' },
  { href: '/activity', label: 'Activity' },
  { href: '/demo', label: 'Demo' },
  { href: '/developers', label: 'Developers' },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="masthead__nav" aria-label="Primary">
      {LINKS.map((n) => {
        const active =
          n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
