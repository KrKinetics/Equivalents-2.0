/**
 * Browser auth session bootstrap for the Coach portal.
 */
import { getSupabase } from './supabase-client.js';
import {
  establishSessionFromUrl,
  withQueryAndHash,
} from './auth-callback.mjs';
import {
  clearServerSessionCookie,
  syncServerSessionCookie,
} from './session-cookie.mjs';

export function getPortalSupabase() {
  return getSupabase();
}

/** Recover session from current location without logging tokens. */
export async function recoverSession(supabase = getSupabase()) {
  const session = await establishSessionFromUrl(supabase, {
    search: window.location.search,
    hash: window.location.hash,
  });
  if (session?.access_token) {
    await syncServerSessionCookie(session);
  }
  return session;
}

/**
 * Keep HttpOnly cookie aligned when Supabase refreshes/clears the browser session.
 * Never navigates — INITIAL_SESSION, TOKEN_REFRESHED, and SIGNED_OUT only touch cookies.
 * Registered at most once per page load.
 */
export function bindServerSessionCookieSync(supabase = getSupabase()) {
  if (!supabase?.auth?.onAuthStateChange || bindServerSessionCookieSync._bound) {
    return bindServerSessionCookieSync._subscription || null;
  }
  bindServerSessionCookieSync._bound = true;
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    // Navigation is owned by login/dashboard boot — never reload from auth events.
    if (event === 'SIGNED_OUT' || !session?.access_token) {
      void clearServerSessionCookie();
      return;
    }
    void syncServerSessionCookie(session);
  });
  bindServerSessionCookieSync._subscription = data?.subscription || null;
  return bindServerSessionCookieSync._subscription;
}

export function redirectPreservingAuthParams(pathname) {
  const target = withQueryAndHash(
    pathname,
    window.location.search,
    window.location.hash,
  );
  window.location.replace(target);
}

export function redirectClean(pathname) {
  window.location.replace(pathname);
}
