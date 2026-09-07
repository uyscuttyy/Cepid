'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface DemoStatus {
  jobId: string;
  status: 'running' | 'done' | 'failed';
  phase: string;
  agentId: string | null;
  error: string | null;
  log: Array<{ at: string; phase: string; message: string }>;
  run2?: {
    gateVerdict: string | null;
    gateReason: string | null;
    blockingMemoryIds: string[];
    intent: string | null;
    txHash: string | null;
  };
}

/**
 * The single control strangers use. One click starts the demo; the page
 * polls the runner for status and refreshes data when the job finishes.
 */
export function DemoRunControl() {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();

  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/demo/status/${jobId}`, { cache: 'no-store' });
        if (!r.ok) {
          setError('runner unreachable');
          return;
        }
        const body = (await r.json()) as DemoStatus;
        if (stopped) return;
        setStatus(body);
        if (body.status === 'done' || body.status === 'failed') {
          if (body.status === 'done') router.refresh();
          return;
        }
        setTimeout(tick, 1500);
      } catch {
        setError('runner poll failed');
      }
    };
    void tick();
    return () => {
      stopped = true;
    };
  }, [jobId, router]);

  function start() {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const r = await fetch('/api/demo/start', { method: 'POST' });
      if (r.status === 409) {
        setError('a demo is already running');
        return;
      }
      if (!r.ok) {
        setError('runner unreachable');
        return;
      }
      const { jobId: id } = (await r.json()) as { jobId: string };
      setJobId(id);
    });
  }

  const running = status?.status === 'running';

  return (
    <div>
      <p className="prose">
        The runner will register a fresh agent, deploy a test market on Base Sepolia, place
        three real trades that resolve as losses (so the scar forms), then trade again on a
        second market — and the constraint gate will return DENY.
      </p>
      <p className="prose" style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-3)' }}>
        Takes about 5 minutes (market expiry is 4 minutes; settlement is instant on Base
        Sepolia after expiry).
      </p>
      <div style={{ marginTop: 20 }}>
        <button
          type="button"
          className="form__submit"
          onClick={start}
          disabled={starting || running}
        >
          {running ? `Running — ${status?.phase ?? 'starting'}…` : starting ? 'Starting…' : 'Run the demo'}
        </button>
      </div>
      {error && (
        <div className="notice" data-tone="deny" style={{ marginTop: 16 }}>
          <span className="notice__title">Could not start</span>
          <p>{error}</p>
        </div>
      )}
      {status?.status === 'done' && status.run2 ? null : null}
    </div>
  );
}
