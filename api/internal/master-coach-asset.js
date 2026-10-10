/**
 * GET /api/internal/master-coach-asset?path=coach-calculator/...
 * Signed server fetch of the existing calculator files. No dossier payload.
 */
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function log(category, requestId) {
  console.error(JSON.stringify({ category, requestId }));
}

module.exports = async function handler(req, res) {
  const requestId = randomUUID();
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end();
    return;
  }
  if (req.headers.origin) {
    log('LEGACY_GATEWAY_AUTH_FAILED', requestId);
    res.statusCode = 401;
    res.end();
    return;
  }
  try {
    const { verifyGatewaySignature, resolveCoachCalculatorAsset } = await import(
      '../../src/coach/server/internal/master-coach-gateway.mjs'
    );
    const url = new URL(req.url, 'https://app.krkinetics.com');
    const assetPath = url.searchParams.get('path') || '';
    const ok = verifyGatewaySignature({
      secret: process.env.MASTER_COACH_GATEWAY_SECRET || '',
      timestamp: req.headers['x-mc-timestamp'] || '',
      signature: req.headers['x-mc-signature'] || '',
      payload: assetPath,
    });
    if (!ok) {
      log('LEGACY_GATEWAY_AUTH_FAILED', requestId);
      res.statusCode = 401;
      res.end();
      return;
    }
    const file = resolveCoachCalculatorAsset(process.cwd(), assetPath);
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const ext = file.slice(file.lastIndexOf('.'));
    res.statusCode = 200;
    res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(file).pipe(res);
  } catch {
    log('LEGACY_GATEWAY_FAILED', requestId);
    res.statusCode = 500;
    res.end();
  }
};
