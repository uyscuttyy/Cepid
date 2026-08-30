import { NextResponse } from 'next/server';
import { getExperiences } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') ?? '100');
  const since = searchParams.get('since') ?? undefined;
  const tag = searchParams.get('tag') ?? undefined;
  const outcome = searchParams.get('outcome') ?? undefined;
  const asset = searchParams.get('asset') ?? undefined;

  try {
    let all = await getExperiences();
    if (since) all = all.filter((e) => e.createdAt >= since);
    if (tag) all = all.filter((e) => e.tags.includes(tag));
    if (outcome) all = all.filter((e) => e.outcome.outcome === outcome);
    if (asset) all = all.filter((e) => e.asset === asset);
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (Number.isFinite(limit)) all = all.slice(0, limit);
    return NextResponse.json({ experiences: all, total: all.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
