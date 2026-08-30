import { NextResponse } from 'next/server';
import { getEvents } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') ?? undefined;
  const limit = Number(searchParams.get('limit') ?? '200');

  try {
    let all = await getEvents();
    if (type) all = all.filter((e) => e.type === type);
    all.sort((a, b) => b.at.localeCompare(a.at));
    if (Number.isFinite(limit)) all = all.slice(0, limit);
    return NextResponse.json({ events: all });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
