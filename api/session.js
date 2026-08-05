/**
 * Set / clear HttpOnly session cookie for Coach portal server gates.
 * Body/Bearer carries the user JWT already issued by Supabase Auth.
 * Never accepts or returns service_role. Never returns internal auth reasons.
 */

async function loadModules() {
  const [auth, rate, errors, parse] = await Promise.all([
    import('../src/coach/security/portal-auth.mjs'),
    import('../src/coach/server/http/rate-limit.mjs'),
    import('../src/coach/server/http/errors.mjs'),
    import('../src/coach/server/http/parse-json-body.mjs'),
  ]);
  return { auth, rate, errors, parse };
}

function corsHeaders(auth, req) {
  const origin = auth.allowedCorsOrigin(req.headers.origin || '');
  const headers = {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
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
  const { auth, rate, errors, parse } = await loadModules();
  const headers = corsHeaders(auth, req);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const identityKey = rate.buildRateIdentityKey({ req });
  const limited = await rate.checkDistributedRateLimit({
    routeName: 'session',
    identityKey,
    supabaseUrl: process.env.SUPABASE_URL || '',
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
    accessToken: auth.readAccessToken({
      cookieHeader: req.headers.cookie,
      authorization: req.headers.authorization,
    }),
  });
  if (!limited.ok) {
    const { randomUUID } = await import('node:crypto');
    const requestId = randomUUID();
    res.setHeader('Retry-After', String(limited.retryAfterSec || 60));
    res.setHeader('X-Request-Id', requestId);
    res.statusCode = limited.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: limited.error, requestId }));
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
    res.statusCode = errors.PUBLIC_ERROR.method_not_allowed.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(errors.publicErrorBody(errors.PUBLIC_ERROR.method_not_allowed)));
    return;
  }

  const parsed = await parse.parseJsonBody(req, { requireJsonContentType: false });
  if (!parsed.ok) {
    res.statusCode = parsed.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(errors.publicErrorBody(parsed)));
    return;
  }
  const body = parsed.body || {};

  const accessToken = auth.readAccessToken({
    cookieHeader: req.headers.cookie,
    authorization: req.headers.authorization,
  }) || (typeof body.access_token === 'string' ? body.access_token : null);

  const verified = await auth.requireCoachSession({
    accessToken,
    supabaseUrl,
    publishableKey,
  });
  if (!verified.ok) {
    // Anti-enumeration: never echo verified.reason to the browser.
    const status = verified.status === 403
      ? errors.PUBLIC_ERROR.forbidden.status
      : errors.PUBLIC_ERROR.unauthorized.status;
    const code = verified.status === 403
      ? errors.PUBLIC_ERROR.forbidden
      : errors.PUBLIC_ERROR.unauthorized;
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(errors.publicErrorBody(code)));
    return;
  }

  const maxAgeSec = Number(body.expires_in) > 0 && Number(body.expires_in) <= 86400
    ? Number(body.expires_in)
    : 3600;
  res.setHeader('Set-Cookie', auth.buildSetCookie(accessToken, { maxAgeSec, secure }));
  res.statusCode = 204;
  res.end();
};
