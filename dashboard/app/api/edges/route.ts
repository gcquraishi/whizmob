import { NextResponse } from 'next/server';
import { getEdges, getEdgeStats } from '../../../lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statsOnly = searchParams.get('stats') === 'true';

  if (statsOnly) {
    const stats = await getEdgeStats();
    return NextResponse.json(stats);
  }

  const edges = await getEdges();
  return NextResponse.json(edges);
}
