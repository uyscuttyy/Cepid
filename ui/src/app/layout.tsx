import './tokens.css';
import './globals.css';
import type { ReactNode } from 'react';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Nav } from '@/components/Nav';

export const metadata = {
  title: {
    default: 'CEPID — memory infrastructure for autonomous agents',
    template: '%s · CEPID',
  },
  description:
    'CEPID is the memory layer for autonomous agents. It remembers what happened, ranks what matters, and hands back the experience the agent needs before its next decision.',
};

export const viewport = {
  themeColor: '#100d0b',
  width: 'device-width',
  initialScale: 1,
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <div className="shell">
          <Nav />
          <div className="content">
            <main className="content__main">{children}</main>
            <footer className="foot">
              <span>CEPID · Memory infrastructure for autonomous agents</span>
              <span>Sibyl Memory is the substrate.</span>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
