/**
 * Server-side Coach portal auth helpers (Node / serverless).
 * Uses the caller's JWT + publishable key only — never service_role.
 *
 * Food bank data is served only via authenticated minimal /api/coach-* routes.
 */

export const COACH_ACCESS_COOKIE = 'coach_access_token';

export const PUBLIC_PATH_PREFIXES = [
  '/login.html',
  '/index.html',
  '/config.js',
  '/assets/login',
  '/assets/auth-',
  '/assets/supabase-client',
  '/assets/portal.css',
  '/assets/public-site',
  '/assets/login-password',
  '/assets/login-otp',
  '/favicon',
  '/motivation.html',
  '/assets/motivation.js',
  '/src/coach/motivation/',
];

/** Paths that must never be served without a valid Coach session. */
export function isProtectedPath(urlPath) {
  if (!urlPath || typeof urlPath !== 'string') return false;
  const p = urlPath.split('?')[0];
  if (p === '/dashboard.html') return true;
  if (p === '/pre-interview-report.html') return true;
  if (p === '/motivation-report.html') return true;
  if (p === '/motivation-qa.html') return true;
  if (p === '/workspace' || p.startsWith('/workspace/')) return true;
  if (p.startsWith('/src/coach/motivation/')) return false;
  if (p.startsWith('/src/coach/')) return true;
  if (p.startsWith('/assets/motivation-qa')) return true;
  if (p.startsWith('/assets/dashboard')) return true;
  if (p.startsWith('/assets/pre-interview-report')) return true;
  if (p.startsWith('/assets/motivation-report')) return true;
  if (p.startsWith('/assets/workspace-bootstrap')) return true;
  return false;
}

export function isPublicPath(urlPath) {
  if (!urlPath || typeof urlPath !== 'string') return false;
  const p = urlPath.split('?')[0];
  if (p === '/' || p === '') return true;
  if (p.startsWith('/api/session')) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix));
}

export function parseCookies(cookieHeader = '') {
  const out = {};
  String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const eq = part.indexOf('=');
      if (eq === -1) return;
      const key = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      out[key] = decodeURIComponent(value);
    });
  return out;
}

export function readAccessToken({ cookieHeader, authorization } = {}) {
  const bearer = String(authorization || '');
  const m = bearer.match(/^Bearer\s+(.+)$/i);
  if (m?.[1]) return m[1].trim();
  const cookies = parseCookies(cookieHeader);
  return cookies[COACH_ACCESS_COOKIE] || null;
}

export function allowedCorsOrigin(origin, { productionHost = 'app.krkinetics.com' } = {}) {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    if (u.hostname === productionHost) return origin;
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return origin;
    if (u.hostname.endsWith('.vercel.app') && u.hostname.includes('krkinetics')) return origin;
    return null;
  } catch {
    return null;
  }
}

/**
 * Validate JWT with Supabase Auth and require at least one organization membership.
 * @returns {{ ok: true, user: object, memberships: object[] } | { ok: false, status: number, reason: string }}
 */
export async function requireCoachSession({
  accessToken,
  supabaseUrl,
  publishableKey,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!accessToken) return { ok: false, status: 401, reason: 'missing_token' };
  if (!supabaseUrl || !publishableKey) return { ok: false, status: 500, reason: 'missing_config' };

  const userRes = await fetchImpl(`${String(supabaseUrl).replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (userRes.status === 401 || userRes.status === 403) {
    return { ok: false, status: 401, reason: 'invalid_or_expired' };
  }
  if (!userRes.ok) {
    return { ok: false, status: 401, reason: 'auth_unavailable' };
  }
  const user = await userRes.json();
  if (!user?.id) return { ok: false, status: 401, reason: 'invalid_user' };

  const memRes = await fetchImpl(
    `${String(supabaseUrl).replace(/\/$/, '')}/rest/v1/memberships?select=id,organization_id,role&limit=10`,
    {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    },
  );
  if (!memRes.ok) {
    return { ok: false, status: 401, reason: 'membership_check_failed' };
  }
  const memberships = await memRes.json();
  if (!Array.isArray(memberships) || memberships.length === 0) {
    return { ok: false, status: 403, reason: 'no_organization' };
  }
  return { ok: true, user, memberships };
}

export function buildSetCookie(accessToken, { maxAgeSec = 3600, secure = true } = {}) {
  const parts = [
    `${COACH_ACCESS_COOKIE}=${encodeURIComponent(accessToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(60, Number(maxAgeSec) || 3600)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearCookie({ secure = true } = {}) {
  const parts = [
    `${COACH_ACCESS_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Uniform Magic Link UI copy — never reveal whether the email exists. */
export const MAGIC_LINK_UNIFORM_MESSAGE =
  'Si ce courriel est autorisé, un lien de connexion a été envoyé. Vérifiez votre boîte de courriel (invitation seulement — aucun compte public).';
