import { NextResponse } from 'next/server';
import { getMobGraphData } from '@/lib/db';

export async function GET() {
  try {
    const data = await getMobGraphData();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
