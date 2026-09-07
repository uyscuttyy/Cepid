/**
 * Demo runner status — polled by the UI while a job is running.
 * Forwards the runner's full DemoResult. When the job has finished and
 * produced an agent id, stores CEPID_API_KEY in a session cookie so the
 * rest of the dashboard reads the demo agent's memory without a
 * redirect. The cookie is HttpOnly + SameSite=Lax.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RUNNER = process.env.CEPID_DEMO_RUNNER_URL ?? 'http://127.0.0.1:8798';

export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  const res = await fetch(`${RUNNER}/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
  if (res.status === 404) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (!res.ok) return NextResponse.json({ error: 'RUNNER_ERROR' }, { status: 502 });
  const result = (await res.json()) as {
    status: string;
    phase: string;
    agentId: string | null;
    run2: { gateVerdict: string | null } | null;
    error: string | null;
  };

  if (result.status === 'done' && result.agentId) {
    // The runner persisted the demo key to a maintainer-side keystore. The
    // UI is on a different host (the public surface) and cannot read that
    // file directly; the runner must return the key in a controlled
    // channel. For now, we ask the runner to also return the key when
    // status === done (added below).
    const key = await readDemoKeyFromRunner(jobId);
    if (key) {
      const jar = await cookies();
      jar.set('cepid_demo_key', key, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 4,
      });
    }
  }

  return NextResponse.json(result);
}

async function readDemoKeyFromRunner(jobId: string): Promise<string | null> {
  // The runner writes the demo identity to a known path. The UI process
  // may not be able to read it across users; fall back to an env var
  // the maintainer can set on the UI process.
  const path = process.env.DEMO_KEYSTORE ?? join(process.cwd(), '..', 'demo-runner', 'data', 'demo-agent.json');
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as { apiKey: string };
    return data.apiKey;
  } catch {
    return null;
  }
}
