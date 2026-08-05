/**
 * Root portal session boot (extracted from inline script for CSP script-src 'self').
 */
import {
  getPortalSupabase,
  recoverSession,
  redirectPreservingAuthParams,
  redirectClean,
} from './auth-session.js';
import { syncServerSessionCookie } from './session-cookie.mjs';
import {
  beginLoginAutoRedirect,
  shouldAutoRedirectAfterSessionRecover,
} from './login-redirect.mjs';

const supabase = getPortalSupabase();
// Never redirect to login before asking Supabase for a session from the URL.
const session = await recoverSession(supabase);
if (session) {
  const cookieSynced = await syncServerSessionCookie(session);
  const allowRedirect = beginLoginAutoRedirect(sessionStorage);
  if (shouldAutoRedirectAfterSessionRecover({
    hasSession: true,
    cookieSynced,
    allowRedirect,
  })) {
    redirectClean('./dashboard.html');
  } else {
    // Stay out of login↔dashboard loops when cookie sync fails.
    redirectPreservingAuthParams('./login.html');
  }
} else {
  redirectPreservingAuthParams('./login.html');
}
