/**
 * Set / clear HttpOnly session cookie for Coach portal server gates.
 * Body/Bearer carries the user JWT already issued by Supabase Auth.
 * Never accepts or returns service_role.
 */

async function loadAuth() {
  return import('../src/coach/security/portal-auth.mjs');
}

function corsHeaders(auth, req) {
  const origin = auth.allowedCorsOrigin(req.headers.origin || '');
  const headers = {
    'Cache-Control': 'private, no-store',
    Vary: 'Origin',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    headers['Access-Control-Allow-Methods'] = 'POST, DELETE, OPTIONS';
  }
  return headers;
}

function isSecureRequest(req) {
  const proto = req.headers['x-forwarded-proto'] || '';
  return String(proto).includes('https') || process.env.VERCEL === '1';
}

module.exports = async function handler(req, res) {
  const auth = await loadAuth();
  const headers = corsHeaders(auth, req);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  const secure = isSecureRequest(req);

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', auth.buildClearCookie({ secure }));
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      body = {};
    }
  }
  body = body && typeof body === 'object' ? body : {};

  const accessToken = auth.readAccessToken({
    cookieHeader: req.headers.cookie,
    authorization: req.headers.authorization,
  }) || body.access_token || null;

  const verified = await auth.requireCoachSession({
    accessToken,
    supabaseUrl,
    publishableKey,
  });
  if (!verified.ok) {
    res.statusCode = verified.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: verified.reason }));
    return;
  }

  const maxAgeSec = Number(body.expires_in) > 0 ? Number(body.expires_in) : 3600;
  res.setHeader('Set-Cookie', auth.buildSetCookie(accessToken, { maxAgeSec, secure }));
  res.statusCode = 204;
  res.end();
};
