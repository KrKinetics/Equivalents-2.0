/**
 * Same-origin Coach portal + calculator workspace preview.
 *
 * - Portal:  http://127.0.0.1:4190/
 * - Workspace: http://127.0.0.1:4190/workspace/?client_id=<uuid>
 * - /config.js: publishable Supabase values only (never service_role)
 * - /api/coach-data: authenticated full bank (Phase 1 temporary)
 * - Protected routes require HttpOnly coach_access_token cookie
 *
 * Usage:
 *   npm run coach:portal
 *   npm run coach:workspace
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireSupabasePublicEnv } from './load-env-local.mjs';
import {
  buildConfigJsSource,
  injectWorkspaceBootstrap,
} from './coach-portal-deploy-lib.mjs';
import {
  buildClearCookie,
  buildSetCookie,
  isProtectedPath,
  readAccessToken,
  requireCoachSession,
} from '../src/coach/security/portal-auth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portalDir = path.join(root, 'coach-portal');
const calcDir = path.join(root, 'coach-calculator');
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
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.pdf': 'application/pdf',
  })[ext] || 'application/octet-stream';
}

function configJs() {
  return buildConfigJsSource({ url, publishableKey });
}

function calculatorReady() {
  return [
    'index.html',
    'coach-data.json',
    'assets/logo-kr-kinetics-horizontal.png',
    'vendor/html2canvas.min.js',
    'vendor/jspdf.umd.min.js',
  ].every((rel) => fs.existsSync(path.join(calcDir, rel)));
}

function ensureCalculatorBuilt() {
  if (calculatorReady()) return;
  const result = spawnSync(process.execPath, ['scripts/coach-calculator-build.mjs'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('coach-calculator-build failed');
}

function sendFile(res, abs, { transformHtml } = {}) {
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  if (transformHtml && abs.endsWith('.html')) {
    let html = fs.readFileSync(abs, 'utf8');
    html = transformHtml(html);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    });
    res.end(html);
    return;
  }
  res.writeHead(200, {
    'Content-Type': mime(abs),
    'Cache-Control': 'private, no-store',
  });
  fs.createReadStream(abs).pipe(res);
}

function resolveUnder(rootDir, urlPath) {
  const rel = urlPath.replace(/^\/+/, '');
  const abs = path.normalize(path.join(rootDir, rel));
  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;
  if (abs !== rootDir && !abs.startsWith(rootWithSep)) return null;
  return abs;
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

async function assertCoachAccess(req) {
  const accessToken = readAccessToken({
    cookieHeader: req.headers.cookie,
    authorization: req.headers.authorization,
  });
  return requireCoachSession({
    accessToken,
    supabaseUrl: url,
    publishableKey,
  });
}

function deny(res, req, urlPath, status = 401) {
  const acceptsHtml = String(req.headers.accept || '').includes('text/html');
  const isDocument = urlPath.endsWith('.html')
    || urlPath === '/workspace'
    || urlPath === '/workspace/'
    || urlPath === '/dashboard.html';
  if (acceptsHtml && isDocument) {
    const next = encodeURIComponent(`${urlPath}`);
    res.writeHead(302, {
      Location: `/login.html?next=${next}`,
      'Cache-Control': 'private, no-store',
    });
    res.end();
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-store',
  });
  res.end(JSON.stringify({ error: 'unauthorized' }));
}

ensureCalculatorBuilt();

const server = http.createServer(async (req, res) => {
  try {
    const rawUrl = req.url || '/';
    const urlPath = decodeURIComponent(rawUrl.split('?')[0]);
    const method = (req.method || 'GET').toUpperCase();

    if (urlPath === '/api/session' && method === 'OPTIONS') {
      res.writeHead(204, { 'Cache-Control': 'private, no-store' });
      res.end();
      return;
    }

    if (urlPath === '/api/session' && method === 'DELETE') {
      res.writeHead(204, {
        'Set-Cookie': buildClearCookie({ secure: false }),
        'Cache-Control': 'private, no-store',
      });
      res.end();
      return;
    }

    if (urlPath === '/api/session' && method === 'POST') {
      const body = await readJsonBody(req);
      const accessToken = readAccessToken({
        cookieHeader: req.headers.cookie,
        authorization: req.headers.authorization,
      }) || body.access_token || null;
      const verified = await requireCoachSession({
        accessToken,
        supabaseUrl: url,
        publishableKey,
      });
      if (!verified.ok) {
        res.writeHead(verified.status, {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, no-store',
        });
        res.end(JSON.stringify({ error: verified.reason }));
        return;
      }
      const maxAgeSec = Number(body.expires_in) > 0 ? Number(body.expires_in) : 3600;
      res.writeHead(204, {
        'Set-Cookie': buildSetCookie(accessToken, { maxAgeSec, secure: false }),
        'Cache-Control': 'private, no-store',
      });
      res.end();
      return;
    }

    if (urlPath === '/api/coach-data' || urlPath === '/workspace/coach-data.json') {
      if (method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'method_not_allowed' }));
        return;
      }
      const verified = await assertCoachAccess(req);
      if (!verified.ok) {
        res.writeHead(verified.status, {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, no-store',
        });
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      const abs = path.join(calcDir, 'coach-data.json');
      if (!fs.existsSync(abs)) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'coach_data_unavailable' }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
      });
      fs.createReadStream(abs).pipe(res);
      return;
    }

    if (urlPath === '/config.js') {
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'private, no-store',
      });
      res.end(configJs());
      return;
    }

    if (isProtectedPath(urlPath)) {
      const verified = await assertCoachAccess(req);
      if (!verified.ok) {
        deny(res, req, urlPath, verified.status === 403 ? 403 : 401);
        return;
      }
    }

    if (
      urlPath.startsWith('/src/coach/workspace/')
      || urlPath.startsWith('/src/coach/services/')
    ) {
      const abs = resolveUnder(path.join(root, 'src', 'coach'), urlPath.slice('/src/coach'.length));
      if (!abs || !abs.endsWith('.mjs')) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      sendFile(res, abs);
      return;
    }

    if (urlPath === '/workspace' || urlPath === '/workspace/') {
      const abs = path.join(calcDir, 'index.html');
      sendFile(res, abs, { transformHtml: injectWorkspaceBootstrap });
      return;
    }

    if (urlPath.startsWith('/workspace/')) {
      const calcRel = urlPath.slice('/workspace'.length);
      if (calcRel === '/coach-data.json') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_found' }));
        return;
      }
      const abs = resolveUnder(calcDir, calcRel === '/' ? '/index.html' : calcRel);
      if (!abs) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const transformHtml = abs.endsWith(`${path.sep}index.html`)
        ? injectWorkspaceBootstrap
        : undefined;
      sendFile(res, abs, { transformHtml });
      return;
    }

    let portalRel = urlPath === '/' ? '/index.html' : urlPath;
    const abs = resolveUnder(portalDir, portalRel);
    if (!abs) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    sendFile(res, abs);
  } catch (err) {
    res.writeHead(500);
    res.end('Server error');
    console.error(err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Coach workspace (same-origin): http://${HOST}:${PORT}/`);
  console.log(`Calculator workspace: http://${HOST}:${PORT}/workspace/`);
  console.log('Public config loaded from .env.local (values not printed).');
  console.log('Protected routes require /api/session cookie (Phase 1 containment).');
});
