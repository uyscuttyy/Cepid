import './tokens.css';
import './globals.css';
import './components.css';
import type { ReactNode } from 'react';
import { Fraunces, IBM_Plex_Mono } from 'next/font/google';
import { Masthead } from '@/components/Nav';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-evidence',
  weight: ['400', '600', '700'],
  display: 'swap',
});

export const metadata = {
  title: {
    default: 'CEPID — memory infrastructure for autonomous agents',
    template: '%s · CEPID',
  },
  description:
    'CEPID is the memory layer for autonomous agents. It remembers what happened, ranks what matters, and can stop an agent from repeating a decision it already proved costly.',
};

export const viewport = {
  themeColor: '#f4f2ec',
  width: 'device-width',
  initialScale: 1,
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${plexMono.variable}`}>
      <body>
        <Masthead />
        <div className="shell">
          <main>{children}</main>
        </div>
        <footer className="colophon">
          <span>CEPID · Memory infrastructure for autonomous agents</span>
          <span>Sibyl Memory is the substrate.</span>
          <span className="seal">filed under seal</span>
        </footer>
      </body>
    </html>
  );
}
