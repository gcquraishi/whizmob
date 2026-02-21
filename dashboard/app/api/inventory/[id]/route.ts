import { NextRequest, NextResponse } from 'next/server';
import { getPassport, updateTags } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const passport = await getPassport(decodeURIComponent(id));
    if (!passport) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(passport);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.VERCEL) {
    return NextResponse.json({ error: 'Read-only demo' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    if (body.tags && Array.isArray(body.tags)) {
      await updateTags(decodeURIComponent(id), body.tags);
    }

    const passport = await getPassport(decodeURIComponent(id));
    return NextResponse.json(passport);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
