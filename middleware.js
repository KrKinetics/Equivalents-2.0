/**
 * Vercel Edge Middleware — server gate for Coach portal protected resources.
 * Validates HttpOnly coach_access_token against Supabase Auth + memberships.
 * Applies path-scoped Content-Security-Policy (enforced).
 * Does not use service_role. Does not log tokens.
 */

import { next } from '@vercel/edge';
import {
  COACH_ACCESS_COOKIE,
  isProtectedPath,
  parseCookies,
} from './src/coach/security/portal-auth.mjs';
import {
  buildPortalCspPolicy,
  buildWorkspaceCspPolicy,
} from './src/coach/server/http/csp-policy.mjs';

export const config = {
  matcher: [
    '/',
    '/index.html',
    '/login.html',
    '/intake.html',
    '/dashboard.html',
    '/workspace',
    '/workspace/:path*',
    '/src/coach/:path*',
    '/assets/dashboard.js',
    '/assets/intake.js',
    '/assets/workspace-bootstrap.mjs',
  ],
};

function securityHeadersFor(pathname) {
  const csp = pathname.startsWith('/workspace')
    ? buildWorkspaceCspPolicy()
    : buildPortalCspPolicy();
  return {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  };
}

async function verifyToken(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!accessToken || !supabaseUrl || !publishableKey) return false;

  const base = supabaseUrl.replace(/\/$/, '');
  const userRes = await fetch(`${base}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!userRes.ok) return false;

  const memRes = await fetch(`${base}/rest/v1/memberships?select=id&limit=1`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!memRes.ok) return false;
  const memberships = await memRes.json();
  return Array.isArray(memberships) && memberships.length > 0;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const sec = securityHeadersFor(pathname);

  // Hard-block static coach-data even if a file leaked into the deploy tree.
  if (pathname === '/workspace/coach-data.json') {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
        ...sec,
      },
    });
  }

  // Public portal pages: attach CSP, no coach authentication gate.
  if (
    pathname === '/login.html'
    || pathname === '/index.html'
    || pathname === '/intake.html'
    || pathname === '/assets/intake.js'
    || pathname === '/'
  ) {
    return next({ headers: sec });
  }

  if (!isProtectedPath(pathname)) {
    return next({ headers: sec });
  }

  const cookies = parseCookies(request.headers.get('cookie') || '');
  const token = cookies[COACH_ACCESS_COOKIE] || '';
  const ok = await verifyToken(token);
  if (ok) return next({ headers: sec });

  const looksLikeAsset = pathname.startsWith('/workspace/')
    && pathname !== '/workspace/'
    && pathname !== '/workspace'
    && !pathname.endsWith('.html');
  if (looksLikeAsset || pathname.startsWith('/src/coach/') || pathname.startsWith('/assets/')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
        ...sec,
      },
    });
  }

  const login = new URL('/login.html', url.origin);
  login.searchParams.set('next', `${pathname}${url.search}`);
  return new Response(null, {
    status: 302,
    headers: {
      Location: login.toString(),
      ...securityHeadersFor('/login.html'),
    },
  });
}
