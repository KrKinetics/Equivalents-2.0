/**
 * Vercel Edge Middleware — server gate for Coach portal protected resources.
 * Validates HttpOnly coach_access_token against Supabase Auth + memberships.
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

const MASTER_USER_ID = '143f2b15-5d24-4992-b648-42c43bd1e802';

export const config = {
  matcher: [
    '/',
    '/index.html',
    '/login.html',
    '/intake.html',
    '/dashboard.html',
    '/reviews.html',
    '/workspace',
    '/workspace/:path*',
    '/src/coach/:path*',
    '/assets/dashboard.js',
    '/assets/intake.js',
    '/assets/reviews-admin.js',
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
  if (!accessToken || !supabaseUrl || !publishableKey) return null;
  const base = supabaseUrl.replace(/\/$/, '');
  const headers = { apikey: publishableKey, Authorization: `Bearer ${accessToken}` };

  const userRes = await fetch(`${base}/auth/v1/user`, { headers });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;

  const memRes = await fetch(
    `${base}/rest/v1/memberships?select=id,organization_id,role,organizations(slug)&limit=10`,
    { headers: { ...headers, Accept: 'application/json' } },
  );
  if (!memRes.ok) return null;
  const memberships = await memRes.json();
  if (!Array.isArray(memberships) || memberships.length === 0) return null;
  return { user, memberships };
}

function isReviewMaster(session) {
  return session?.user?.id === MASTER_USER_ID
    && session.memberships.some((membership) =>
      membership.role === 'platform_owner'
      && membership.organizations?.slug === 'kr-kinetics'
    );
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const sec = securityHeadersFor(pathname);

  if (pathname === '/workspace/coach-data.json') {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', ...sec },
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
  if (!isProtectedPath(pathname) && pathname !== '/reviews.html' && pathname !== '/assets/reviews-admin.js') {
    return next({ headers: sec });
  }

  const cookies = parseCookies(request.headers.get('cookie') || '');
  const session = await verifyToken(cookies[COACH_ACCESS_COOKIE] || '');
  const isReviewsPath = pathname === '/reviews.html' || pathname === '/assets/reviews-admin.js';
  if (session && (!isReviewsPath || isReviewMaster(session))) {
    return next({ headers: sec });
  }

  if (isReviewsPath && session) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', ...sec },
    });
  }

  const looksLikeAsset = pathname.startsWith('/workspace/')
    && pathname !== '/workspace/'
    && pathname !== '/workspace'
    && !pathname.endsWith('.html');
  if (looksLikeAsset || pathname.startsWith('/src/coach/') || pathname.startsWith('/assets/')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', ...sec },
    });
  }

  const login = new URL('/login.html', url.origin);
  login.searchParams.set('next', `${pathname}${url.search}`);
  return new Response(null, { status: 302, headers: { Location: login.toString(), ...securityHeadersFor('/login.html') } });
}
