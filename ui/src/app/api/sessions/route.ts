import { NextResponse } from 'next/server';
import { getSessions } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const sessions = await getSessions();
    sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return NextResponse.json({ sessions });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
