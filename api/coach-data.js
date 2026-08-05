/**
 * Authenticated Coach food-bank payload (PHASE 1 temporary).
 *
 * Still returns the FULL banque to authenticated org members so the existing
 * calculator can run unchanged. Phase 2 must replace this with minimal
 * calculation / search endpoints — do not treat this as final IP protection
 * against an authorized coach session.
 *
 * Never uses service_role. Never logs payload contents.
 */

const fs = require('node:fs');
const path = require('node:path');

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
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
  }
  return headers;
}

function resolveCoachDataPath() {
  const candidates = [
    path.join(process.cwd(), 'coach-calculator', 'coach-data.json'),
    path.join(__dirname, '..', 'coach-calculator', 'coach-data.json'),
  ];
  for (const abs of candidates) {
    if (fs.existsSync(abs)) return abs;
  }
  return null;
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

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }

  const accessToken = auth.readAccessToken({
    cookieHeader: req.headers.cookie,
    authorization: req.headers.authorization,
  });
  const verified = await auth.requireCoachSession({
    accessToken,
    supabaseUrl: process.env.SUPABASE_URL || '',
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
  });
  if (!verified.ok) {
    res.statusCode = verified.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  const dataPath = resolveCoachDataPath();
  if (!dataPath) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'coach_data_unavailable' }));
    return;
  }

  // Stream file without logging contents.
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  fs.createReadStream(dataPath).pipe(res);
};
