import { NextResponse } from 'next/server';
import { runScan } from '@/lib/scanner-bridge';
import { importInventory, getLastScan } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const lastScan = await getLastScan();
    return NextResponse.json(lastScan);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST() {
  if (process.env.VERCEL) {
    return NextResponse.json({ error: 'Read-only demo' }, { status: 403 });
  }

  try {
    const inventory = await runScan();
    const diff = await importInventory(inventory);
    return NextResponse.json(diff);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
