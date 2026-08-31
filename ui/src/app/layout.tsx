import './tokens.css';
import './globals.css';
import type { ReactNode } from 'react';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Nav } from '@/components/Nav';
import { getAgentSnapshot, getEvents, getShellSummary } from '@/lib/data';
import { deriveAgentState } from '@/lib/view';

export const metadata = {
  title: {
    default: 'CEPID — a trading agent that remembers',
    template: '%s · CEPID',
  },
  description:
    'CEPID remembers the conditions surrounding its previous decisions — not just whether a trade won or lost — and uses those experiences when it trades again.',
};

export const viewport = {
  themeColor: '#100d0b',
  width: 'device-width',
  initialScale: 1,
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The shell shows live agent state, so it reads the same data the pages do.
  // A missing or unreadable data directory is not an error here: the rail falls
  // back to an offline state and every page renders its own empty state.
  const [snapshot, events, summary] = await Promise.all([
    getAgentSnapshot().catch(() => null),
    getEvents().catch(() => []),
    getShellSummary().catch(() => ({ memoryCount: null, tradeCount: null })),
  ]);

  const state = deriveAgentState(events);

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <div className="shell">
          <Nav
            state={state}
            network={snapshot?.network ?? 'unknown'}
            walletAddress={snapshot?.walletAddress ?? null}
            memoryCount={summary.memoryCount}
            tradeCount={summary.tradeCount}
          />
          <div className="content">
            <main className="content__main">{children}</main>
            <footer className="foot">
              <span>CEPID · Continuity Experience &amp; Persistent Institutional Decision-memory</span>
              <span>Experiences, not just results.</span>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
