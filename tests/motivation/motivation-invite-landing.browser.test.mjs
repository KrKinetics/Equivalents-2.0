/**
 * Browser landing contract for /motivation.html?token=…
 * Does not call a live database. Stubs get_client_motivation to capture the token.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { readMotivationInviteToken } from '../../src/coach/motivation/client/motivation-invite-token.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const portal = path.join(root, 'coach-portal');
const COMPLEX_TOKEN = 'Tok+en/with=equals&ampersand?x';

function resolveChromePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  try {
    const bundled = puppeteer.executablePath();
    if (bundled) candidates.push(bundled);
  } catch {
    /* ignore */
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
  })[ext] || 'application/octet-stream';
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/go-preserve') {
      res.writeHead(302, { Location: '/motivation.html?token=TEST_TOKEN' });
      res.end();
      return;
    }
    if (url.pathname === '/go-drop') {
      res.writeHead(302, { Location: '/motivation.html' });
      res.end();
      return;
    }
    if (url.pathname === '/config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end('globalThis.__COACH_CONFIG = { url: "https://example.supabase.co", publishableKey: "sb_test" };');
      return;
    }
    if (url.pathname === '/assets/auth-session.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(`export function getPortalSupabase() {
        return {
          rpc(name, args) {
            globalThis.__motivationRpcCalls = globalThis.__motivationRpcCalls || [];
            globalThis.__motivationRpcCalls.push({ name, args });
            return Promise.resolve({ data: null, error: { message: 'stub-rpc' } });
          }
        };
      }`);
      return;
    }
    let abs;
    if (url.pathname.startsWith('/src/')) {
      abs = path.normalize(path.join(root, url.pathname.replace(/^\//, '')));
      if (!abs.startsWith(root)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
    } else {
      const rel = url.pathname.replace(/^\//, '');
      abs = path.normalize(path.join(portal, rel));
      if (!abs.startsWith(portal)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
    }
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(abs) });
    fs.createReadStream(abs).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

let server;
let origin;
let browser;
let puppeteerReady = true;

before(async () => {
  try {
    ({ server, origin } = await startServer());
    const executablePath = resolveChromePath();
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ...(executablePath ? { executablePath } : {}),
    });
  } catch (error) {
    puppeteerReady = false;
    console.error('motivation landing contract: Chromium unavailable', error?.message || error);
  }
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function openMotivation(search) {
  const page = await browser.newPage();
  await page.goto(`${origin}/motivation.html${search}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => {
    const errorVisible = !document.getElementById('error-card')?.classList.contains('hidden');
    const rpcReady = Array.isArray(globalThis.__motivationRpcCalls);
    return errorVisible || rpcReady;
  }, { timeout: 8000 });
  return page;
}

test('landing without token shows the diagnostic missing-token message', async (t) => {
  if (!puppeteerReady || !browser) {
    t.skip('puppeteer unavailable');
    return;
  }
  const page = await openMotivation('');
  const state = await page.evaluate(() => ({
    error: document.getElementById('error-message')?.textContent || '',
    errorVisible: !document.getElementById('error-card')?.classList.contains('hidden'),
    rpc: globalThis.__motivationRpcCalls || [],
    href: window.location.href,
  }));
  assert.match(state.error, /ne contient pas de jeton valide/);
  assert.equal(state.errorVisible, true);
  assert.equal(state.rpc.length, 0);
  assert.equal(readMotivationInviteToken(state.href), '');
  await page.close();
});

test('landing with token reads TEST_TOKEN and calls get_client_motivation with it', async (t) => {
  if (!puppeteerReady || !browser) {
    t.skip('puppeteer unavailable');
    return;
  }
  const page = await openMotivation('?token=TEST_TOKEN');
  const state = await page.evaluate(() => ({
    rpc: globalThis.__motivationRpcCalls || [],
    href: window.location.href,
    search: window.location.search,
  }));
  assert.equal(readMotivationInviteToken(state.search), 'TEST_TOKEN');
  assert.equal(state.rpc.length, 1);
  assert.equal(state.rpc[0].name, 'get_client_motivation');
  assert.equal(state.rpc[0].args.p_token, 'TEST_TOKEN');
  await page.close();
});

test('encoded complex token round-trips through URLSearchParams', async (t) => {
  if (!puppeteerReady || !browser) {
    t.skip('puppeteer unavailable');
    return;
  }
  const page = await openMotivation(`?token=${encodeURIComponent(COMPLEX_TOKEN)}`);
  const state = await page.evaluate(() => ({
    rpc: globalThis.__motivationRpcCalls || [],
    search: window.location.search,
  }));
  assert.equal(readMotivationInviteToken(state.search), COMPLEX_TOKEN);
  assert.equal(state.rpc[0].args.p_token, COMPLEX_TOKEN);
  await page.close();
});

test('a preserve-query redirect keeps the token; a dropped query does not', async (t) => {
  if (!puppeteerReady || !browser) {
    t.skip('puppeteer unavailable');
    return;
  }
  const kept = await browser.newPage();
  await kept.goto(`${origin}/go-preserve`, { waitUntil: 'networkidle0' });
  const keptState = await kept.evaluate(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
    rpc: globalThis.__motivationRpcCalls || [],
  }));
  assert.equal(keptState.pathname, '/motivation.html');
  assert.equal(readMotivationInviteToken(keptState.search), 'TEST_TOKEN');
  assert.equal(keptState.rpc[0].args.p_token, 'TEST_TOKEN');
  await kept.close();

  const dropped = await browser.newPage();
  await dropped.goto(`${origin}/go-drop`, { waitUntil: 'networkidle0' });
  const droppedState = await dropped.evaluate(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
    error: document.getElementById('error-message')?.textContent || '',
    rpc: globalThis.__motivationRpcCalls || [],
  }));
  assert.equal(droppedState.pathname, '/motivation.html');
  assert.equal(droppedState.search, '');
  assert.match(droppedState.error, /ne contient pas de jeton valide/);
  assert.equal(droppedState.rpc.length, 0);
  await dropped.close();
});
