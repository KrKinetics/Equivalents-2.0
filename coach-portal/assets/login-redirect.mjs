/**
 * Safe post-login destinations and anti-loop guards for the Coach login page.
 * Pure helpers — safe to unit-test without a browser session.
 */

export const LOGIN_REDIRECT_AT_KEY = 'coach_portal_login_redirect_at';
export const LOGIN_REDIRECT_COUNT_KEY = 'coach_portal_login_redirect_count';

const DEFAULT_NEXT = './dashboard.html';

/**
 * Same-origin relative next path only (workspace or dashboard).
 * Never returns /login.html (or equivalent) — that would form a redirect loop.
 */
export function resolveSafeNextPath(search = '', { defaultPath = DEFAULT_NEXT } = {}) {
  const raw = String(search || '');
  const query = raw.startsWith('?') ? raw.slice(1) : raw;
  const next = new URLSearchParams(query).get('next');
  if (!next || !next.startsWith('/')) return defaultPath;
  if (next.startsWith('//') || next.includes('://')) return defaultPath;

  const pathOnly = next.split('?')[0].split('#')[0];
  if (
    pathOnly === '/login.html'
    || pathOnly.endsWith('/login.html')
    || pathOnly === '/'
    || pathOnly === '/index.html'
  ) {
    return defaultPath;
  }

  if (
    next.startsWith('/workspace/')
    || next === '/dashboard.html'
    || next.startsWith('/dashboard.html?')
  ) {
    return next;
  }
  return defaultPath;
}

export function clearLoginAutoRedirectGuard(storage) {
  if (!storage?.removeItem) return;
  storage.removeItem(LOGIN_REDIRECT_AT_KEY);
  storage.removeItem(LOGIN_REDIRECT_COUNT_KEY);
}

/**
 * Allow a single automatic post-session redirect from login within windowMs.
 * A second attempt in the same window is treated as a loop and blocked.
 */
export function beginLoginAutoRedirect(
  storage,
  now = Date.now(),
  { windowMs = 15_000, maxAttempts = 1 } = {},
) {
  if (!storage?.getItem || !storage?.setItem) return true;
  const last = Number(storage.getItem(LOGIN_REDIRECT_AT_KEY) || '0');
  const count = Number(storage.getItem(LOGIN_REDIRECT_COUNT_KEY) || '0');
  if (last && now - last < windowMs && count >= maxAttempts) {
    clearLoginAutoRedirectGuard(storage);
    return false;
  }
  const nextCount = last && now - last < windowMs ? count + 1 : 1;
  storage.setItem(LOGIN_REDIRECT_COUNT_KEY, String(nextCount));
  storage.setItem(LOGIN_REDIRECT_AT_KEY, String(now));
  return true;
}

/** Gate used by login boot / password success before location.replace. */
export function shouldAutoRedirectAfterSessionRecover({
  hasSession = false,
  cookieSynced = false,
  allowRedirect = false,
} = {}) {
  return Boolean(hasSession && cookieSynced && allowRedirect);
}
