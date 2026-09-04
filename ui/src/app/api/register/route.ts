/**
 * Server-side proxy for agent registration.
 *
 * The form posts here; we forward to the platform so the key never needs to
 * pass through the dashboard as a query parameter or in URL state. The
 * dashboard holds no state — refreshing the page after registration does
 * not reveal the key again.
 */
import { NextResponse } from 'next/server';
import { getClient } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'VALIDATION', message: 'invalid JSON' }, { status: 400 });
  }
  const { name, description } = (body ?? {}) as { name?: unknown; description?: unknown };
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 128) {
    return NextResponse.json({ error: 'VALIDATION', message: 'name is required (1–128 chars)' }, { status: 400 });
  }
  const desc = typeof description === 'string' ? description.slice(0, 512) : '';

  const client = getClient();
  try {
    const result = await client.register({ name, description: desc });
    return NextResponse.json({
      agent: result.agent,
      apiKey: result.apiKey,
      keyPrefix: result.keyPrefix,
      keyLast4: result.keyLast4,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'REGISTRATION_FAILED', message }, { status: 502 });
  }
}
