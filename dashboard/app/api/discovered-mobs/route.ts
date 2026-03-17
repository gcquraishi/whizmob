import { NextResponse } from 'next/server';
import { getDiscoveredMobs } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const mobs = await getDiscoveredMobs();
  return NextResponse.json(mobs);
}
