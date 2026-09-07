/**
 * Server-side proxy for the demo runner.
 *
 * Strangers click "Run the demo" in the UI; this route forwards to the
 * localhost-only demo runner (CEPID_DEMO_RUNNER_URL, default
 * 127.0.0.1:8798). The runner never binds to a public interface; the UI
 * is the only way to reach it.
 *
 * The runner returns the demo agent id, which the UI stores as
 * CEPID_API_KEY for the rest of the session (cookie), so all dashboard
 * pages immediately read that agent's memory/activity/influence.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RUNNER = process.env.CEPID_DEMO_RUNNER_URL ?? 'http://127.0.0.1:8798';

export async function POST() {
  let res: Response;
  try {
    res = await fetch(`${RUNNER}/jobs`, { method: 'POST', cache: 'no-store' });
  } catch {
    return NextResponse.json(
      { error: 'DEMO_RUNNER_DOWN', message: 'the demo runner is not running on the server' },
      { status: 503 },
    );
  }
  if (res.status === 409) {
    return NextResponse.json(
      { error: 'DEMO_RUNNING', message: 'a demo is already in progress' },
      { status: 409 },
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: 'DEMO_RUNNER_ERROR', message: `runner returned ${res.status}` },
      { status: 502 },
    );
  }
  const { jobId } = (await res.json()) as { jobId: string };
  return NextResponse.json({ jobId, status: 'running' });
}
