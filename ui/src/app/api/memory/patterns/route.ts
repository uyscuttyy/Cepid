import { NextResponse } from 'next/server';
import { getPatterns, getScars } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const [patterns, scars] = await Promise.all([getPatterns(), getScars()]);
    return NextResponse.json({ patterns, scars });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
