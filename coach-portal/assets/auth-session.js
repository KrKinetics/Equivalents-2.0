/**
 * Browser auth session bootstrap for the Coach portal.
 */
import { getSupabase } from './supabase-client.js';
import {
  establishSessionFromUrl,
  withQueryAndHash,
} from './auth-callback.mjs';

export function getPortalSupabase() {
  return getSupabase();
}

/** Recover session from current location without logging tokens. */
export async function recoverSession(supabase = getSupabase()) {
  return establishSessionFromUrl(supabase, {
    search: window.location.search,
    hash: window.location.hash,
  });
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
