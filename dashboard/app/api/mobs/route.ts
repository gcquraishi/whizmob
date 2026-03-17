import { NextResponse } from 'next/server';
import { getMobs } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const mobs = await getMobs();
    return NextResponse.json(mobs);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
