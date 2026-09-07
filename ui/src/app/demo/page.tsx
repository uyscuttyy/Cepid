import Link from 'next/link';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { PageHead, Section } from '@/components/Primitives';
import { DemoRunControl } from './DemoRunControl';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = { title: 'Demo' };

interface DemoPhase {
  at: string;
  phase: string;
  message: string;
}

interface Leg {
  leg: number;
  gateVerdict: string;
  intent: string;
  txHash: string | null;
  memoryId: string | null;
  retrievalId: string | null;
}

interface Run2 {
  gateVerdict: string | null;
  gateReason: string | null;
  blockingMemoryIds: string[];
  intent: string | null;
  txHash: string | null;
  retrievalId: string | null;
}

interface DemoStatus {
  jobId: string;
  status: 'running' | 'done' | 'failed';
  phase: string;
  log: DemoPhase[];
  agentId: string | null;
  market1: string | null;
  market2: string | null;
  legs: Leg[];
  settleTx: string | null;
  run2: Run2 | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/**
 * DEMO — the two-run reference demonstration. The page now doubles as the
 * product's "Prove the gate" entry point: one click runs the entire proof
 * (market 1 → run 1 trade → loss → scar → market 2 → run 2 DENY) and the
 * rest of the dashboard is automatically scoped to the demo agent.
 */
export default async function DemoPage() {
  const jar = await cookies();
  const demoKey = jar.get('cepid_demo_key')?.value;
  const inDemo = Boolean(demoKey);

  let result: DemoStatus | null = null;
  if (inDemo) {
    // When in a demo session, the runner process holds the latest job
    // (single-flight). The UI process can't enumerate it, so we just
    // read /healthz to confirm the runner is reachable.
    const runnerUrl = process.env.CEPID_DEMO_RUNNER_URL ?? 'http://127.0.0.1:8798';
    const probe = await fetch(`${runnerUrl}/healthz`, { cache: 'no-store' }).catch(() => null);
    if (probe?.ok) {
      const body = (await probe.json()) as { activeJobId: string | null };
      if (body.activeJobId) {
        const r = await fetch(`${runnerUrl}/jobs/${body.activeJobId}`, { cache: 'no-store' });
        if (r.ok) result = (await r.json()) as DemoStatus;
      }
    }
  }

  return (
    <div>
      <PageHead
        filing="CEPID-005"
        title="Prove the gate"
        lede="One click runs the full two-run proof against the live platform and Base Sepolia. The agent trades on a real market, loses, forms a scar, and is then stopped by its own memory."
      />

      <Section title="Run the demo">
        <DemoRunControl />
      </Section>

      {result && result.status === 'running' && (
        <Section title="In progress" note={result.phase}>
          <DemoLog log={result.log} />
        </Section>
      )}

      {result && result.status === 'done' && (
        <>
          <Section title="Result" note={`agent ${result.agentId?.slice(0, 12)}…`}>
            <ResultSummary result={result} />
            <p className="prose" style={{ marginTop: 16 }}>
              <Link href="/activity">Open Activity</Link> · <Link href="/memories">Open Memories</Link> ·{' '}
              <Link href="/agents">Open Agents</Link>
            </p>
          </Section>
          <Section title="Log">
            <DemoLog log={result.log} />
          </Section>
        </>
      )}

      {result && result.status === 'failed' && (
        <Section title="Failed">
          <p className="prose">The demo run failed: {result.error}</p>
          <DemoLog log={result.log} />
        </Section>
      )}
    </div>
  );
}

function ResultSummary({ result }: { result: DemoStatus }): ReactNode {
  return (
    <div className="exhibit-box">
      <p className="prose">
        <strong>Run 1.</strong> {result.legs.length} trades placed (gate ALLOW ×
        {result.legs.filter((l) => l.gateVerdict === 'ALLOW').length}). On-chain evidence:
      </p>
      <ul>
        {result.legs.map((l) => (
          <li key={l.leg} className="evidence" style={{ fontSize: 'var(--fs-small)' }}>
            leg {l.leg} — {l.intent} — {l.txHash ? l.txHash.slice(0, 12) + '…' : 'no tx'}
          </li>
        ))}
      </ul>
      <p className="prose">
        <strong>Resolve.</strong> Market 1 resolved NO. Tx:{' '}
        <span className="evidence">{result.settleTx?.slice(0, 12)}…</span>
      </p>
      <p className="prose">
        <strong>Run 2.</strong> Gate {result.run2?.gateVerdict}: {result.run2?.gateReason}.
        Intent {result.run2?.intent}.{' '}
        {result.run2?.txHash ? (
          <span style={{ color: 'var(--deny)' }}>A transaction was submitted — this is a failure.</span>
        ) : (
          <span style={{ color: 'var(--allow)' }}>No transaction — the agent was stopped.</span>
        )}
      </p>
      {result.run2?.blockingMemoryIds && result.run2.blockingMemoryIds.length > 0 && (
        <p className="prose">
          Blocking memories:{' '}
          {result.run2.blockingMemoryIds.map((id, i) => (
            <span key={id}>
              {i > 0 && ', '}
              <Link className="evidence" href={`/memories/${id}`}>
                {id.slice(0, 12)}…
              </Link>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function DemoLog({ log }: { log: DemoPhase[] }): ReactNode {
  return (
    <ol className="docket">
      {log.map((entry, i) => (
        <li className="docket__item" key={`${entry.at}-${i}`}>
          <div>
            <p>
              <span className="evidence" style={{ color: 'var(--ink-3)', marginRight: 12 }}>
                {entry.phase}
              </span>
              {entry.message}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
