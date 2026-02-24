import { NextResponse } from 'next/server';
import { getConstellations } from '@/lib/db';

export async function GET() {
  try {
    const constellations = await getConstellations();
    return NextResponse.json(constellations);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
