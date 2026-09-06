import Link from 'next/link';
import { NavLinks } from './NavLinks';
import { getClient } from '@/lib/data';

/**
 * The masthead: nameplate, live platform status, and the docket index.
 *
 * Everything shown here is read from the live /v1/* API through the typed
 * client — no local file reads, no agent-private knowledge. It answers
 * "what is the platform doing, right now" for any viewer.
 */
export async function Masthead() {
  const client = getClient();
  const readiness = await client.getReadiness().catch(() => null);

  const platformUp = readiness?.ok === true;
  const substrateUp = readiness?.substrate === 'ok';
  const tone = platformUp ? (substrateUp ? 'live' : 'held') : 'fault';
  const label = platformUp ? (substrateUp ? 'Live' : 'Degraded') : 'Offline';

  return (
    <header className="masthead">
      <div className="masthead__row">
        <Link href="/" className="masthead__brand">
          CEPID
        </Link>
        <span className="masthead__tag">Memory infrastructure for autonomous agents</span>
        <span className="masthead__status">
          <span>
            <span className="status-dot" data-tone={tone} aria-hidden="true" />
            {label}
          </span>
          <span>Sibyl {platformUp ? (substrateUp ? 'connected' : 'disconnected') : '—'}</span>
        </span>
      </div>
      <NavLinks />
    </header>
  );
}
