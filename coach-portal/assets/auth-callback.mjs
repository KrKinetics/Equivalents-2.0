/**
 * Pure auth-callback helpers (no tokens logged; Node-testable).
 */

export function withQueryAndHash(pathname, search = '', hash = '') {
  const path = pathname || './';
  let q = search || '';
  if (q && !q.startsWith('?')) q = `?${q}`;
  let h = hash || '';
  if (h && !h.startsWith('#')) h = `#${h}`;
  return `${path}${q}${h}`;
}

export function getAuthCodeFromSearch(search = '') {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw) return null;
  return new URLSearchParams(raw).get('code');
}

export function hasImplicitAuthHash(hash = '') {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return false;
  const params = new URLSearchParams(raw);
  return (
    params.has('access_token')
    || params.has('refresh_token')
    || params.has('error')
    || params.has('error_description')
    || ['invite', 'magiclink', 'signup', 'recovery', 'email'].includes(params.get('type') || '')
  );
}

function tokensFromHash(hash = '') {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

/**
 * Establish session from URL (PKCE code and/or implicit hash), then getSession.
 * Never logs URL fragments or tokens.
 */
export async function establishSessionFromUrl(supabase, locationParts = {}) {
  const search = locationParts.search ?? '';
  const hash = locationParts.hash ?? '';
  const code = getAuthCodeFromSearch(search);

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      void error;
    }
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session) return data.session;

  const tokens = tokensFromHash(hash);
  if (tokens) {
    const result = await supabase.auth.setSession(tokens);
    if (result.error) throw result.error;
    return result.data.session ?? null;
  }

  return null;
}
