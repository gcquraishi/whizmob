import { NextResponse } from 'next/server';
import { getDiscoveredMobs } from '../../../lib/db';

export async function GET() {
  const mobs = await getDiscoveredMobs();
  return NextResponse.json(mobs);
}
