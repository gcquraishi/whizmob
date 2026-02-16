import { NextResponse } from 'next/server';
import { runScan } from '@/lib/scanner-bridge';
import { importInventory } from '@/lib/db';

export async function POST() {
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
