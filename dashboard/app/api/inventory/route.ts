import { NextRequest, NextResponse } from 'next/server';
import { getPassports } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const type = searchParams.get('type') || undefined;
    const platform = searchParams.get('platform') || undefined;
    const search = searchParams.get('search') || undefined;
    const tag = searchParams.get('tag') || undefined;

    const passports = await getPassports({ type, platform, search, tag });
    return NextResponse.json(passports);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
