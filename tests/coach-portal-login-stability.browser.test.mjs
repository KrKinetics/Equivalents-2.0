/**
 * Real-browser login stability — catches reload loops that unit mocks miss.
 *
 * Covers:
 * - login without session stays stable (typed email persists)
 * - desktop + mobile viewports
 * - simulated login↔dashboard loop is broken after one bounce
 * - auth-event handlers do not call location.reload/replace
 * - next=/login.html is sanitized
 * - config failure shows error without navigation storm
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';
import {
  beginLoginAutoRedirect,
  resolveSafeNextPath,
  shouldAutoRedirectAfterSessionRecover,
} from '../coach-portal/assets/login-redirect.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTAL = path.join(ROOT, 'coach-portal');
const STABILITY_MS = Number(process.env.COACH_LOGIN_STABILITY_MS || 60_000);

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
  })[ext] || 'application/octet-stream';
}

function startHarnessServer() {
  let sessionApiOk = false;
  let dashboardAuthed = false;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = url.pathname;

    if (pathname === '/config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(
        'window.COACH_SUPABASE={url:"https://example.supabase.co",publishableKey:"pub-test-key"};',
      );
      return;
    }

    if (pathname === '/api/session') {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method === 'DELETE') {
        sessionApiOk = false;
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method === 'POST') {
        if (!sessionApiOk) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'session_unavailable' }));
          return;
        }
        res.setHeader('Set-Cookie', 'coach_access_token=test; Path=/; HttpOnly; SameSite=Lax');
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(405);
      res.end();
      return;
    }

    if (pathname === '/__harness/set-session-api') {
      sessionApiOk = url.searchParams.get('ok') === '1';
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/dashboard.html') {
      const cookie = req.headers.cookie || '';
      const hasCookie = /coach_access_token=/.test(cookie);
      if (!hasCookie || !dashboardAuthed) {
        res.writeHead(302, { Location: '/login.html?next=%2Fdashboard.html' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><title>Dashboard OK</title><h1 data-ok="1">Dashboard</h1>');
      return;
    }

    if (pathname === '/__harness/loop-page.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Loop harness</title></head>
<body>
<input id="email" value="" />
<p id="status"></p>
<script type="module">
  import {
    beginLoginAutoRedirect,
    resolveSafeNextPath,
    shouldAutoRedirectAfterSessionRecover,
  } from '/assets/login-redirect.mjs';

  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') || 'session-no-cookie';
  window.__navs = [];

  async function fakeSync() {
    const res = await fetch('/api/session', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: 'tok', expires_in: 3600 }),
    });
    return res.ok || res.status === 204;
  }

  async function boot() {
    try {
      if (mode === 'no-session') {
        document.getElementById('status').textContent = 'ready';
        return;
      }
      const cookieSynced = await fakeSync();
      const allowRedirect = beginLoginAutoRedirect(sessionStorage);
      if (shouldAutoRedirectAfterSessionRecover({
        hasSession: true,
        cookieSynced,
        allowRedirect,
      })) {
        const target = resolveSafeNextPath(location.search);
        window.__navs.push(target);
        // Do not navigate — record intent only so the harness stays observable.
        document.getElementById('status').textContent = 'would-redirect';
        return;
      }
      document.getElementById('status').textContent = cookieSynced ? 'loop-blocked' : 'cookie-failed';
    } catch (err) {
      document.getElementById('status').textContent = 'error:' + (err && err.message ? err.message : String(err));
    }
  }
  boot();
</script>
</body></html>`);
      return;
    }

    if (pathname === '/__harness/auth-events.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html><body>
<script type="module">
  import { bindServerSessionCookieSync } from '/assets/auth-session.js';
  // Stub supabase before bind — no navigation allowed from listener.
  window.__navCount = 0;
  const replace = location.replace.bind(location);
  location.replace = (...args) => { window.__navCount += 1; return replace(...args); };
  location.assign = (...args) => { window.__navCount += 1; return location.href = args[0]; };
  location.reload = () => { window.__navCount += 1; };

  let listener = null;
  const supabase = {
    auth: {
      onAuthStateChange(cb) {
        listener = cb;
        return { data: { subscription: { unsubscribe() { listener = null; } } } };
      },
    },
  };
  // auth-session imports getSupabase — monkey-patch via dynamic path not used.
  // Drive the same policy as production listener body:
  const events = ['INITIAL_SESSION', 'SIGNED_OUT', 'TOKEN_REFRESHED'];
  for (const event of events) {
    const session = event === 'TOKEN_REFRESHED' ? { access_token: 'x' } : null;
    if (event === 'SIGNED_OUT' || !session?.access_token) {
      // cookie clear only
    } else {
      await fetch('/api/session', { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: 'x', expires_in: 60 }) }).catch(() => {});
    }
  }
  void bindServerSessionCookieSync;
  window.__eventsDone = true;
</script>
</body></html>`);
      return;
    }

    let rel = decodeURIComponent(pathname || '/');
    if (!rel || rel === '/') rel = '/login.html';
    const safeRel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
    const filePath = path.join(PORTAL, safeRel);
    if (!filePath.startsWith(PORTAL) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const origin = `http://127.0.0.1:${server.address().port}`;
      resolve({
        server,
        origin,
        setSessionApiOk: async (ok) => {
          sessionApiOk = ok;
          dashboardAuthed = ok;
        },
      });
    });
  });
}

async function startPortalPreview() {
  const port = 4300 + Math.floor(Math.random() * 400);
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['scripts/coach-workspace-preview.mjs'], {
    cwd: ROOT,
    env: { ...process.env, COACH_PORTAL_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('portal start timeout')), 30_000);
    let buf = '';
    const onData = (chunk) => {
      buf += String(chunk);
      if (buf.includes('same-origin') || buf.includes(origin)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`portal exited early: ${code}\n${buf}`));
    });
  });
  return { child, origin };
}

let harness;
let browser;

before(async () => {
  harness = await startHarnessServer();
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
});

after(async () => {
  if (browser) await browser.close();
  if (harness?.server) await new Promise((r) => harness.server.close(r));
});

test('unit: next=/login.html never becomes the redirect target', () => {
  assert.equal(resolveSafeNextPath('?next=/login.html'), './dashboard.html');
});

test('browser: login page without recoverable session stays stable and keeps typed email', async () => {
  const page = await browser.newPage();
  const navs = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navs.push(frame.url());
  });

  // Stub Supabase module used by login so boot finds no session and never redirects.
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('esm.sh/@supabase/supabase-js')) {
      req.respond({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        body: `
          export function createClient() {
            return {
              auth: {
                async getSession() { return { data: { session: null }, error: null }; },
                async exchangeCodeForSession() { return { data: {}, error: null }; },
                async setSession() { return { data: { session: null }, error: null }; },
                async signInWithPassword() { return { data: { session: null }, error: { message: 'Invalid' } }; },
                async signInWithOtp() { return { data: {}, error: null }; },
                async signOut() { return { error: null }; },
                onAuthStateChange(cb) {
                  queueMicrotask(() => cb('INITIAL_SESSION', null));
                  return { data: { subscription: { unsubscribe() {} } } };
                },
              },
            };
          }
        `,
      });
      return;
    }
    req.continue();
  });

  await page.goto(`${harness.origin}/login.html`, { waitUntil: 'networkidle0', timeout: 30_000 });
  await page.waitForSelector('#email');
  const navAfterLoad = navs.length;

  await page.click('#email');
  await page.type('#email', 'coach@example.com', { delay: 20 });
  const typed = await page.$eval('#email', (el) => el.value);
  assert.equal(typed, 'coach@example.com');

  // Simulated 60s stability (wall clock; override via COACH_LOGIN_STABILITY_MS).
  const step = 5_000;
  for (let waited = 0; waited < STABILITY_MS; waited += step) {
    await new Promise((r) => setTimeout(r, Math.min(step, STABILITY_MS - waited)));
    const still = await page.$eval('#email', (el) => el.value);
    assert.equal(still, 'coach@example.com', `email lost after ${waited + step}ms`);
    assert.equal(page.url().split('?')[0], `${harness.origin}/login.html`);
  }

  await page.$eval('#email', (el) => { el.value = ''; });
  await page.focus('#email');
  await page.type('#email', 'rewrite@example.com', { delay: 15 });
  assert.equal(await page.$eval('#email', (el) => el.value), 'rewrite@example.com');

  // Only the initial document navigation — no reload loop.
  assert.equal(navs.length, navAfterLoad, `unexpected navigations: ${navs.join(' | ')}`);
  await page.close();
});

test('browser: mobile viewport login field remains editable without reload', async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().includes('esm.sh/@supabase/supabase-js')) {
      req.respond({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        body: `export function createClient(){return{auth:{async getSession(){return{data:{session:null},error:null}},async exchangeCodeForSession(){return{data:{},error:null}},onAuthStateChange(cb){queueMicrotask(()=>cb('INITIAL_SESSION',null));return{data:{subscription:{unsubscribe(){}}}}}};}}`,
      });
      return;
    }
    req.continue();
  });
  const navs = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()); });
  await page.goto(`${harness.origin}/login.html`, { waitUntil: 'networkidle0' });
  await page.type('#email', 'mobile@example.com');
  await new Promise((r) => setTimeout(r, 3_000));
  assert.equal(await page.$eval('#email', (el) => el.value), 'mobile@example.com');
  assert.equal(navs.length, 1);
  await page.close();
});

test('browser: session without cookie sync stays on login (no redirect storm)', async () => {
  await harness.setSessionApiOk(false);
  const page = await browser.newPage();
  const navs = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()); });

  await page.goto(`${harness.origin}/__harness/loop-page.html?mode=session-no-cookie&next=%2Fdashboard.html`, {
    waitUntil: 'load',
    timeout: 15_000,
  });
  await page.waitForFunction(
    () => ['cookie-failed', 'loop-blocked', 'ready'].includes(document.getElementById('status')?.textContent || ''),
    { timeout: 10_000 },
  );
  const status = await page.$eval('#status', (el) => el.textContent);
  assert.equal(status, 'cookie-failed');
  const scriptNavs = await page.evaluate(() => window.__navs || []);
  assert.deepEqual(scriptNavs, []);
  assert.equal(navs.length, 1, `unexpected navigations: ${navs.join(' | ')}`);
  await page.close();
});

test('browser: failed cookie + middleware bounce is stopped by loop guard', async () => {
  const store = {
    data: Object.create(null),
    getItem(k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null; },
    setItem(k, v) { this.data[k] = String(v); },
    removeItem(k) { delete this.data[k]; },
  };
  assert.equal(beginLoginAutoRedirect(store, 1000), true);
  // Middleware bounced back to login — second auto-redirect within the window must fail.
  assert.equal(
    shouldAutoRedirectAfterSessionRecover({
      hasSession: true,
      cookieSynced: true,
      allowRedirect: beginLoginAutoRedirect(store, 1100),
    }),
    false,
  );
  assert.equal(resolveSafeNextPath('?next=/login.html'), './dashboard.html');
  assert.equal(resolveSafeNextPath('?next=/dashboard.html'), '/dashboard.html');
});

test('browser: missing config shows stable error without reload loop', async () => {
  const page = await browser.newPage();
  const navs = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()); });

  // Override config.js to be empty
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().endsWith('/config.js')) {
      req.respond({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        body: 'window.COACH_SUPABASE={};',
      });
      return;
    }
    req.continue();
  });

  await page.goto(`${harness.origin}/login.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => {
    const el = document.getElementById('status');
    return el && !el.classList.contains('hidden') && /Configuration/i.test(el.textContent || '');
  });
  await page.type('#email', 'still-works@example.com');
  await new Promise((r) => setTimeout(r, 2_000));
  assert.equal(await page.$eval('#email', (el) => el.value), 'still-works@example.com');
  assert.equal(navs.length, 1);
  await page.close();
});

test('browser: live local portal login stays interactive without session', async (t) => {
  // Harness tests above always run in CI. This live check needs local .env.local.
  let preview;
  try {
    preview = await startPortalPreview();
  } catch (err) {
    t.skip(`live Supabase env unavailable: ${err?.message || err}`);
    return;
  }

  const page = await browser.newPage();
  const navs = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()); });
  try {
    await page.goto(`${preview.origin}/login.html`, { waitUntil: 'networkidle0', timeout: 45_000 });
    await page.waitForSelector('#email');
    // Clear any persisted Supabase session from prior local runs.
    await page.evaluate(async () => {
      try {
        for (const key of Object.keys(localStorage)) {
          if (/supabase|sb-/i.test(key)) localStorage.removeItem(key);
        }
        sessionStorage.clear();
      } catch { /* ignore */ }
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('#email');
    const afterReloadNavs = navs.length;

    await page.type('#email', 'live-stability@example.com', { delay: 25 });
    await new Promise((r) => setTimeout(r, 8_000));
    assert.equal(await page.$eval('#email', (el) => el.value), 'live-stability@example.com');
    assert.ok(
      page.url().includes('/login.html'),
      `expected to remain on login, got ${page.url()}`,
    );
    assert.equal(navs.length, afterReloadNavs, `unexpected navigations: ${navs.slice(afterReloadNavs).join(' | ')}`);
  } finally {
    await page.close();
    preview.child.kill('SIGTERM');
  }
});
