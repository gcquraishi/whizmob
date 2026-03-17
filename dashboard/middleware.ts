import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'whizmob-demo-auth';

// Derive a stable session token from the password using SHA-256.
// This is computed identically in both middleware and the auth route so no
// shared state (e.g. a database or KV store) is required.
async function deriveSessionToken(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`whizmob-session:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function middleware(request: NextRequest) {
  // Only gate access on Vercel
  if (!process.env.VERCEL) return NextResponse.next();

  const password = process.env.DEMO_PASSWORD?.trim();
  if (!password) return NextResponse.next();

  // Allow the public landing page through (exact match only)
  if (request.nextUrl.pathname === '/') return NextResponse.next();

  // Allow the login endpoint through
  if (request.nextUrl.pathname === '/api/auth') return NextResponse.next();

  // Allow static assets through
  if (
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/translation-test-images') ||
    request.nextUrl.pathname === '/favicon.ico' ||
    request.nextUrl.pathname === '/inspector-preview.svg'
  ) {
    return NextResponse.next();
  }

  const expectedToken = await deriveSessionToken(password);

  // Check auth cookie
  const authCookie = request.cookies.get(COOKIE_NAME);
  if (authCookie?.value === expectedToken) {
    return NextResponse.next();
  }

  // Check basic auth header (for API clients)
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = atob(encoded);
      const [, pwd] = decoded.split(':');
      if (pwd === password) return NextResponse.next();
    }
  }

  // Show login page
  return new NextResponse(loginPage(request.nextUrl.pathname), {
    status: 401,
    headers: { 'Content-Type': 'text/html' },
  });
}

// Only allow relative paths that start with '/'. Anything else (javascript:,
// data:, external URLs, or an empty string) falls back to '/'.
function sanitizeReturnTo(returnTo: string): string {
  if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    return returnTo;
  }
  return '/';
}

function loginPage(rawReturnTo: string) {
  // Validate before use so the value is safe to embed in a JS string literal.
  const safeReturnTo = encodeURIComponent(sanitizeReturnTo(rawReturnTo));
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Whizmob — Demo Access</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fafafa; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; border: 1px solid #e5e5e5; border-radius: 12px; padding: 32px; width: 100%; max-width: 360px; }
    h1 { font-size: 18px; font-weight: 600; color: #111; margin-bottom: 4px; }
    p { font-size: 13px; color: #888; margin-bottom: 20px; }
    input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; outline: none; }
    input:focus { border-color: #111; }
    button { width: 100%; padding: 10px; background: #111; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; margin-top: 12px; }
    button:hover { background: #333; }
    .error { color: #dc2626; font-size: 12px; margin-top: 8px; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Whizmob</h1>
    <p>Enter the demo password to continue.</p>
    <form id="form">
      <input type="password" id="pw" placeholder="Password" autofocus />
      <button type="submit">Enter</button>
      <div class="error" id="err">Incorrect password</div>
    </form>
  </div>
  <script>
    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = document.getElementById('pw').value;
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        window.location.href = decodeURIComponent('${safeReturnTo}');
      } else {
        document.getElementById('err').style.display = 'block';
      }
    });
  </script>
</body>
</html>`;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
