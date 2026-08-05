/**
 * Canonical Content-Security-Policy for the Coach portal.
 * Portal pages: strict script-src (no unsafe-inline / unsafe-eval / CDN).
 * Workspace calculator: temporary script unsafe-inline residual for legacy
 * onclick=/inline handlers until event-delegation migration (documented).
 */

/**
 * Strict CSP for login / dashboard / portal shell (no calculator HTML).
 */
export function buildPortalCspPolicy() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self'",
    "script-src 'self'",
    "connect-src 'self' https://*.supabase.co",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/**
 * Workspace calculator CSP. Scripts still include a temporary unsafe-inline
 * residual for onclick/onchange attributes in the legacy calculator HTML.
 * Externalized script files are preferred; no unsafe-eval; no CDN.
 */
export function buildWorkspaceCspPolicy() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // style="" attributes remain on calculator chrome.
    "style-src 'self' 'unsafe-inline'",
    // Residual: inline event handlers on calculator controls (Bloc 3 follow-up).
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self' https://*.supabase.co",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/** Default enforced policy for static header fallback (portal-strict). */
export function buildCoachCspPolicy() {
  return buildPortalCspPolicy();
}

export const CSP_ORIGIN_JUSTIFICATION = Object.freeze({
  "'self'": 'Portal HTML, CSS, JS, API same-origin',
  'https://*.supabase.co': 'Auth + REST (memberships/clients/dossiers)',
  "portal script-src 'self'": 'Vendored Supabase + portal modules; no esm.sh; no unsafe-inline',
  "workspace script-src residual unsafe-inline": 'Legacy calculator onclick/onchange until delegation migration',
  "workspace style-src unsafe-inline": 'Legacy style="" attributes on calculator chrome',
  "frame-src/worker-src 'none'": 'No iframes/workers required for server PDF path',
});
