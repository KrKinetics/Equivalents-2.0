/**
 * Serve the Coach auth portal (static HTML + @supabase/supabase-js in browser).
 * Injects public Supabase config from gitignored .env.local via /config.js
 *
 * Usage:
 *   npm run coach:portal
 *   node scripts/coach-portal-preview.mjs
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireSupabasePublicEnv } from './load-env-local.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portalDir = path.join(root, 'coach-portal');
const PORT = Number(process.env.COACH_PORTAL_PORT || 4190);
const HOST = process.env.COACH_PORTAL_HOST || '127.0.0.1';

const { url, publishableKey } = requireSupabasePublicEnv(root);

function mime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  })[ext] || 'application/octet-stream';
}

function configJs() {
  // Public values only — never service_role.
  return `window.COACH_SUPABASE = Object.freeze(${JSON.stringify({
    url,
    publishableKey,
  })});\n`;
}

const server = http.createServer((req, res) => {
  try {
    const rawUrl = req.url || '/';
    const urlPath = decodeURIComponent(rawUrl.split('?')[0]);

    if (urlPath === '/config.js') {
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(configJs());
      return;
    }

    let rel = urlPath === '/' ? '/index.html' : urlPath;
    const abs = path.normalize(path.join(portalDir, rel.replace(/^\//, '')));
    if (!abs.startsWith(portalDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime(abs), 'Cache-Control': 'no-store' });
    fs.createReadStream(abs).pipe(res);
  } catch (err) {
    res.writeHead(500);
    res.end('Server error');
    console.error(err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Coach portal: http://${HOST}:${PORT}/`);
  console.log('Public config loaded from .env.local (values not printed).');
});
