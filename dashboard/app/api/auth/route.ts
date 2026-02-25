import { NextRequest, NextResponse } from 'next/server';

// Derive a stable session token from the password using SHA-256.
// Must stay in sync with the identical function in middleware.ts.
async function deriveSessionToken(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`whizmob-session:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: NextRequest) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: 'No password configured' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || typeof (body as Record<string, unknown>).password !== 'string') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if ((body as Record<string, unknown>).password !== password) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  // Store a derived token rather than the plaintext password so the raw
  // credential is never visible in browser dev tools or cookie inspection.
  const sessionToken = await deriveSessionToken(password);

  const response = NextResponse.json({ ok: true });
  response.cookies.set('whizmob-demo-auth', sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
  return response;
}
