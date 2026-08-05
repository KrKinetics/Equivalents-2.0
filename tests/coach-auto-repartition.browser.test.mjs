/**
 * Browser: Classique / Équilibré auto-repartition + 429 UX (stripped deploy HTML).
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { buildCoachVercelBundle } from '../scripts/coach-vercel-build.mjs';
import { mergeEnvLocalIntoProcess } from '../scripts/load-env-local.mjs';
import { calculatePortions } from '../src/coach/server/calc/portions.mjs';
import { SERVER_NUTRITION_RATE_LIMIT_ERROR } from '../src/coach/client/server-nutrition-api.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tmp', 'auto-repartition-browser-bundle');

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

function startStaticServer(rootDir) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname || '/');
    if (!rel || rel === '/') rel = '/workspace/index.html';
    const safeRel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
    const filePath = path.join(rootDir, safeRel);
    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    if (safeRel.replace(/\\/g, '/') === 'workspace/index.html') {
      let html = fs.readFileSync(filePath, 'utf8');
      html = html.replace(
        /<script[^>]*workspace-bootstrap\.mjs[^>]*><\/script>/i,
        `<script type="module">
          import '/src/coach/client/server-nutrition-bridge.mjs';
          window.COACH_FEATURES = { serverNutritionEngine: true };
          window.COACH_WORKSPACE_CONTEXT = {
            clientId: '00000000-0000-4000-8000-000000000099',
            organizationId: '11111111-1111-4111-8111-111111111111',
            organizationSlug: 'kr-kinetics',
          };
          window.__COACH_WORKSPACE_CONTEXT__ = window.COACH_WORKSPACE_CONTEXT;
        </script>`,
      );
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function chromePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const SAMPLE_BANQUE = { pro: 4, fec: 6, leg: 4, fru: 3, lai: 2, lip: 3, whey: 1 };

let server;
let origin;
let browser;
let classicPayload;
let balancedPayload;

before(async () => {
  mergeEnvLocalIntoProcess(ROOT);
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'pub-test';
  classicPayload = calculatePortions({
    action: 'auto_repartition', banque: SAMPLE_BANQUE, mode: 'classique',
  });
  balancedPayload = calculatePortions({
    action: 'auto_repartition', banque: SAMPLE_BANQUE, mode: 'equilibre',
  });
  fs.rmSync(OUT, { recursive: true, force: true });
  buildCoachVercelBundle({ outDir: OUT });
  ({ server, origin } = await startStaticServer(OUT));
  browser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath(),
    args: ['--no-sandbox'],
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

async function attachApiMock(page, { failPortionsAfter = Infinity } = {}) {
  const calls = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/coach-calc-energy')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          bmr: 1600, tdee: 2400,
          goals: {
            perteSevere: 1920, perteLegere: 2160, maintien: 2400, priseLegere: 2640, priseSevere: 2880,
          },
        }),
      });
      return;
    }
    if (u.includes('/api/coach-calc-macros')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          targets: { kcal: 2400, pro: 180, glu: 240, lip: 70 },
          percentages: { pro: 30, glu: 40, lip: 30 },
        }),
      });
      return;
    }
    if (u.includes('/api/coach-food-search')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [], total: 0, categories: [] }),
      });
      return;
    }
    if (u.includes('/api/coach-calc-portions')) {
      let body = {};
      try { body = JSON.parse(req.postData() || '{}'); } catch { /* ignore */ }
      calls.push({ action: body.action, mode: body.mode || null });
      if (calls.length > failPortionsAfter) {
        req.respond({
          status: 429,
          contentType: 'application/json',
          headers: { 'Retry-After': '12', 'X-Request-Id': 'req-test-429' },
          body: JSON.stringify({ error: 'rate_limited' }),
        });
        return;
      }
      if (body.action === 'auto_repartition') {
        const payload = body.mode === 'equilibre' ? balancedPayload : classicPayload;
        req.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(payload),
        });
        return;
      }
      if (body.action === 'moyennes') {
        req.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            moyennes: {
              pro: { p: 25, g: 0, l: 5 }, fec: { p: 3, g: 20, l: 1 }, leg: { p: 2, g: 5, l: 0 },
              fru: { p: 1, g: 15, l: 0 }, lai: { p: 8, g: 12, l: 4 }, lip: { p: 0, g: 0, l: 14 },
              whey: { p: 24, g: 2, l: 1 },
            },
          }),
        });
        return;
      }
      if (body.action === 'banque_totals' || body.action === 'planned_totals') {
        req.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            totals: { pro: 100, glu: 200, lip: 50, kcal: 1650 },
            percentages: { pro: 24, glu: 48, lip: 28 },
          }),
        });
        return;
      }
      req.respond({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'bad_request' }),
      });
      return;
    }
    req.continue();
  });
  return calls;
}

async function readyPage(page) {
  await page.goto(`${origin}/workspace/index.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForFunction(
    () => window.COACH_SERVER_NUTRITION?.enabled === true
      && typeof window.repartirAutomatique === 'function',
    { timeout: 20_000 },
  );
  await page.evaluate((banque) => {
    window.currentTDEE = 2400;
    window.targets = { kcal: 2400, pro: 180, glu: 240, lip: 70 };
    Object.entries(banque).forEach(([cat, val]) => {
      const el = document.querySelector(`.target-input[data-cat="${cat}"]`);
      if (el) el.value = String(val);
    });
    if (!window.joursData) {
      window.joursData = {
        entrainement: { banque: { ...banque }, repartition: Array(42).fill(0) },
        repos: { banque: { ...banque }, repartition: Array(42).fill(0) },
      };
    } else {
      window.joursData.entrainement.banque = { ...banque };
      window.joursData.repos.banque = { ...banque };
    }
  }, SAMPLE_BANQUE);
}

test('Classique then Équilibré succeed with one auto_repartition request each', async () => {
  const page = await browser.newPage();
  const calls = await attachApiMock(page);
  await readyPage(page);

  const before = calls.length;
  await page.evaluate(async () => { await window.repartirAutomatique('classique'); });
  const classicCalls = calls.slice(before);
  const classicAutos = classicCalls.filter((c) => c.action === 'auto_repartition');
  assert.equal(classicAutos.length, 1);
  assert.equal(classicAutos[0].mode, 'classique');

  const status1 = await page.evaluate(
    () => document.getElementById('workspace-persist-status')?.textContent || '',
  );
  assert.doesNotMatch(status1, /service nutritionnel est temporairement indisponible/i);
  assert.doesNotMatch(status1, /Trop de demandes/i);

  const repSum = await page.evaluate(() => [...document.querySelectorAll('.rep-input')]
    .reduce((s, el) => s + (parseFloat(el.value) || 0), 0));
  assert.ok(repSum > 0, 'repartition UI filled');

  const mid = calls.length;
  await page.evaluate(async () => { await window.repartirAutomatique('equilibre'); });
  const balAutos = calls.slice(mid).filter((c) => c.action === 'auto_repartition');
  assert.equal(balAutos.length, 1);
  assert.equal(balAutos[0].mode, 'equilibre');

  // Double-click neutralization.
  const d0 = calls.length;
  await page.evaluate(async () => {
    const a = window.repartirAutomatique('classique');
    const b = window.repartirAutomatique('classique');
    await Promise.all([a, b]);
  });
  assert.equal(calls.slice(d0).filter((c) => c.action === 'auto_repartition').length, 1);

  await page.close();
});

test('429 rate_limited shows dedicated message, not generic unavailable', async () => {
  const page = await browser.newPage();
  const dialogs = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });
  await attachApiMock(page, { failPortionsAfter: 0 });
  await readyPage(page);
  // Ensure status chrome exists (deploy injects it; keep explicit for offline mock).
  await page.evaluate(() => {
    if (!document.getElementById('workspace-persist-status')) {
      const el = document.createElement('div');
      el.id = 'workspace-persist-status';
      document.body.appendChild(el);
    }
  });
  await page.evaluate(async () => { await window.repartirAutomatique('classique'); });
  const status = await page.evaluate(
    () => document.getElementById('workspace-persist-status')?.textContent || '',
  );
  const shown = status || dialogs[0] || '';
  assert.equal(shown, SERVER_NUTRITION_RATE_LIMIT_ERROR);
  assert.doesNotMatch(shown, /temporairement indisponible/i);
  await page.close();
});
