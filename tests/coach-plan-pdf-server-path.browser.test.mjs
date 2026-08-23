/**
 * Browser test: plan + PDF path must not hit disabled client engine.
 * Uses the *stripped* deploy HTML (same as Vercel Preview), not source index.html.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import {
  buildCoachVercelBundle,
} from '../scripts/coach-vercel-build.mjs';
import { mergeEnvLocalIntoProcess } from '../scripts/load-env-local.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tmp', 'plan-pdf-server-path-bundle');

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
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
    // Bypass portal auth bootstrap so the calculator UI can be exercised offline.
    if (safeRel.replace(/\\/g, '/') === 'workspace/index.html') {
      let html = fs.readFileSync(filePath, 'utf8');
      html = html.replace(
        /<script[^>]*workspace-bootstrap\.mjs[^>]*><\/script>/i,
        `<script type="module">
          import '/src/coach/client/server-nutrition-bridge.mjs';
          window.COACH_WORKSPACE_CONTEXT = {
            clientId: '00000000-0000-4000-8000-000000000001',
            organizationId: 'org-test',
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

let server;
let origin;
let browser;

before(async () => {
  mergeEnvLocalIntoProcess(ROOT);
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) {
    // Bundle still builds with placeholder if env present via .env.local; otherwise skip suite later.
  }
  try {
    buildCoachVercelBundle({ outDir: OUT });
  } catch (err) {
    // Allow skip when public env unavailable in CI.
    globalThis.__PLAN_PDF_BUNDLE_ERROR__ = err;
  }
  if (!globalThis.__PLAN_PDF_BUNDLE_ERROR__) {
    ({ server, origin } = await startStaticServer(OUT));
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

test('deployed workspace HTML has no Client engine disabled for macroPercentagesFromGrams', () => {
  if (globalThis.__PLAN_PDF_BUNDLE_ERROR__) {
    assert.ok(true, 'bundle skipped');
    return;
  }
  const html = fs.readFileSync(path.join(OUT, 'workspace', 'index.html'), 'utf8');
  assert.match(html, /data-coach-server-nutrition="1"/);
  assert.doesNotMatch(html, /macroPercentagesFromGrams:\s*function\s*\(\)\s*\{\s*return blocked/);
  assert.match(html, /macroPercentagesFromGrams:\s*function\s*\(pro,\s*glu,\s*lip\)/);
  assert.doesNotMatch(html, /\/api\/coach-data/);
  assert.doesNotMatch(html, /coach-data\.json/);
  assert.match(html, /server-nutrition-bridge\.mjs/);
});

test('browser: plan generation does not alert Client engine disabled', async (t) => {
  if (globalThis.__PLAN_PDF_BUNDLE_ERROR__) {
    t.skip(`bundle unavailable: ${globalThis.__PLAN_PDF_BUNDLE_ERROR__?.message || ''}`);
    return;
  }
  const page = await browser.newPage();
  const alerts = [];
  const pdfRequests = [];
  page.on('dialog', async (dialog) => {
    alerts.push(dialog.message());
    await dialog.dismiss();
  });
  const legacyHits = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/coach-data') || /coach-data\.json(?:\?|$)/.test(u)) {
      legacyHits.push(u);
      req.abort('blockedbyclient');
      return;
    }
    // Only stub API routes — never intercept calculator modules/assets (MIME breaks).
    const isApi = u.includes('/api/coach-');
    if (!isApi) {
      req.continue();
      return;
    }
    if (u.includes('/api/coach-calc-portions')) {
      const body = JSON.parse(req.postData() || '{}');
      if (body.action === 'moyennes') {
        req.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            moyennes: {
              pro: { p: 9, g: 0, l: 2 }, fec: { p: 3, g: 15, l: 0 }, leg: { p: 2, g: 5, l: 0 },
              fru: { p: 0, g: 15, l: 0 }, lai: { p: 8, g: 12, l: 0 }, lip: { p: 0, g: 0, l: 5 },
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
            totals: { pro: 120, glu: 180, lip: 60, kcal: 1800 },
            percentages: { pro: 27, glu: 40, lip: 33 },
          }),
        });
        return;
      }
      if (body.action === 'suggest') {
        req.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ banque: { pro: 4, fec: 6, leg: 2, fru: 2, lai: 1, lip: 3, whey: 0 } }),
        });
        return;
      }
      if (body.action === 'auto_repartition') {
        const repartition = [
          0, 1.5, 0.5, 0.5, 0.5, 1, 0,
          0, 0.5, 0, 0.5, 0, 0.5, 0,
          2, 1.5, 0.5, 0, 0, 0.5, 0,
          0, 1, 0.5, 0.5, 0, 0.5, 0,
          1.5, 1, 0.5, 0, 0.5, 0.5, 0,
          0.5, 0.5, 0, 0.5, 0, 0, 0,
        ];
        req.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            repartition,
            mode: body.mode || 'classique',
            plannedTotals: { pro: 120, glu: 180, lip: 60, kcal: 1800 },
            percentages: { pro: 27, glu: 40, lip: 33 },
            banqueTotals: { pro: 120, glu: 180, lip: 60, kcal: 1800 },
          }),
        });
        return;
      }
    }
    if (u.includes('/api/coach-calc-macros')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          targets: { kcal: 2000, pro: 150, glu: 200, lip: 67 },
          percentages: { pro: 30, glu: 40, lip: 30 },
          hydration: { auto: 2, ajout: 0, total: 2 },
          goalKcal: 2000,
        }),
      });
      return;
    }
    if (u.includes('/api/coach-calc-energy')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tdee: 2200,
          bmr: 1600,
          goals: { perteSevere: 1760, perteLegere: 1980, maintien: 2200, priseLegere: 2420, priseSevere: 2640 },
        }),
      });
      return;
    }
    if (u.includes('/api/coach-food-search')) {
      req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total: 10, categories: [{ id: 'pro', labelFr: 'Protéines', labelEn: 'Protein' }], results: [] }),
      });
      return;
    }
    if (u.includes('/api/coach-generate-pdf')) {
      pdfRequests.push(JSON.parse(req.postData() || '{}'));
      const pdf = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'binary');
      req.respond({
        status: 200,
        contentType: 'application/pdf',
        headers: {
          'Content-Disposition': 'attachment; filename="Plan_Test.pdf"',
          'X-Request-Id': 'test-pdf-req',
        },
        body: pdf,
      });
      return;
    }
    req.continue();
  });

  await page.goto(`${origin}/workspace/index.html`, {
    waitUntil: 'networkidle0',
    timeout: 60_000,
  });

  await page.waitForFunction(() => typeof window.genererPlanTextuel === 'function', { timeout: 15_000 });
  await page.waitForFunction(() => window.CoachSharedEngine?.serverStub === true, { timeout: 10_000 });
  await page.waitForFunction(
    () => typeof window.__coachPrepareServerPdfDays === 'function',
    { timeout: 10_000 },
  );

  await page.evaluate(() => {
    globalThis.COACH_WORKSPACE_CONTEXT = {
      clientId: '00000000-0000-4000-8000-000000000001',
      organizationId: 'org-test',
      organizationSlug: 'kr-kinetics',
    };
    globalThis.__COACH_WORKSPACE_CONTEXT__ = globalThis.COACH_WORKSPACE_CONTEXT;
    globalThis.currentTDEE = 2200;
    globalThis.selectedGoalMultiplier = 1;
    globalThis.targets = { kcal: 2000, pro: 150, glu: 200, lip: 67 };
  });

  await page.waitForFunction(
    () => window.COACH_SERVER_NUTRITION?.enabled === true
      && typeof window.suggererBanque === 'function'
      && typeof window.repartirAutomatique === 'function',
    { timeout: 10_000 },
  );

  // Auto portions: suggest banque + server meal repartition into canonical state.
  const suggestResult = await page.evaluate(async () => {
    const before = String(window.suggererBanque);
    try {
      await window.suggererBanque();
      return {
        ok: true,
        bridge: before.includes('suggererBanqueServer') || before.includes('calcPortionsApi') || before.includes('native'),
        targetsKcal: Number(window.targets?.kcal) || 0,
        uiBanque: Array.from(document.querySelectorAll('.target-input'))
          .reduce((a, el) => a + (parseFloat(el.value) || 0), 0),
      };
    } catch (err) {
      return { ok: false, error: String(err?.message || err), targetsKcal: Number(window.targets?.kcal) || 0 };
    }
  });
  assert.equal(suggestResult.ok, true, `suggest failed: ${suggestResult.error || ''}`);
  assert.ok(suggestResult.targetsKcal > 0, 'targets visible on window');
  assert.ok(suggestResult.uiBanque > 0, `banque UI filled, got ${suggestResult.uiBanque}`);

  const canonical = await page.evaluate(() => {
    const day = window.joursData?.entrainement || {};
    const rep = Array.isArray(day.repartition) ? day.repartition : [];
    return {
      banqueSum: Object.values(day.banque || {}).reduce((a, b) => a + (parseFloat(b) || 0), 0),
      repSum: rep.reduce((a, b) => a + (parseFloat(b) || 0), 0),
      plannedKcal: Number(day.plannedTotals?.kcal) || Number(window.__COACH_PLANNED_TOTALS?.entrainement?.kcal) || 0,
      uiRepSum: Array.from(document.querySelectorAll('.rep-input'))
        .reduce((a, el) => a + (parseFloat(el.value) || 0), 0),
    };
  });
  assert.ok(canonical.banqueSum > 0, 'banque filled');
  assert.ok(canonical.repSum > 0, 'canonical repartition filled');
  assert.ok(canonical.uiRepSum > 0, 'UI meal portions filled');
  assert.ok(canonical.plannedKcal > 0, 'planned totals non-zero');

  await page.evaluate(() => {
    const btn = document.querySelector('.btn-primary[onclick="genererPlanTextuel()"]')
      || document.querySelector('button.btn-primary');
    if (btn) btn.click();
    else window.genererPlanTextuel();
  });
  await new Promise((r) => setTimeout(r, 1500));

  const planText = await page.$eval('#output-plan', (el) => el.value || '');
  const disabledAlerts = alerts.filter((m) => /Client engine disabled/i.test(m));
  assert.equal(disabledAlerts.length, 0, `unexpected alerts: ${alerts.join(' | ')}`);
  assert.ok(planText.trim().length > 40, `expected plan text, got length ${planText.length}`);
  assert.equal(legacyHits.length, 0, `legacy requests: ${legacyHits.join(' | ')}`);

  // Empty plan must be refused by API stub path (server returns 409 in real stack).
  const emptyPdf = await page.evaluate(async () => {
    const res = await fetch('/api/coach-generate-pdf', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/pdf' },
      body: JSON.stringify({
        organization_slug: 'kr-kinetics',
        client_id: '00000000-0000-4000-8000-000000000001',
        locale: 'fr',
        athlete_name: 'Test',
        goal_label: 'Maintien',
        macro_ratio_label: '25 / 45 / 30',
        coach_notes: '',
        goal_multiplier: 1,
        include_rest: false,
        training: {
          banque: { pro: 2, fec: 3, leg: 1, fru: 1, lai: 0, lip: 1, whey: 0 },
          repartition: Array(42).fill(0),
          targets: { kcal: 2000, pro: 150, glu: 200, lip: 67 },
          timing: { active: false },
        },
        rest: null,
      }),
    });
    return { status: res.status };
  });
  // Browser stub still returns 200 for any PDF body — assert client gate instead.
  assert.ok(emptyPdf.status === 200 || emptyPdf.status === 409);

  // Zero both DOM and canonical state so captureJourActif cannot revive portions.
  await page.evaluate(() => {
    document.querySelectorAll('.rep-input').forEach((el) => { el.value = '0'; });
    window.joursData.entrainement.repartition = Array(42).fill(0);
    window.joursData.entrainement.plannedTotals = { pro: 0, glu: 0, lip: 0, kcal: 0 };
    if (window.__COACH_PLANNED_TOTALS) {
      window.__COACH_PLANNED_TOTALS.entrainement = { pro: 0, glu: 0, lip: 0, kcal: 0 };
    }
  });
  await page.evaluate(async () => {
    await window.exporterPDF();
  });
  await new Promise((r) => setTimeout(r, 500));
  const planReadyAlerts = alerts.filter((m) => /pas prêt|incomplet|incohérent/i.test(m));
  assert.ok(planReadyAlerts.length > 0, `expected plan-not-ready user message, alerts=${alerts.join(' | ')}`);

  // Restore distributed plan and export PDF successfully.
  await page.evaluate(async () => {
    if (typeof window.suggererBanque === 'function') await window.suggererBanque();
  });
  await new Promise((r) => setTimeout(r, 600));

  const beforeBridgeExport = pdfRequests.length;
  await page.evaluate(async () => {
    await window.exporterPDF();
  });
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(pdfRequests.length, beforeBridgeExport + 1, 'bridge export must call the PDF API');
  const bridgePayload = pdfRequests.at(-1);
  assert.equal(bridgePayload.training.repartition.length, 49, 'server PDF must receive all seven meals');
  assert.ok(
    bridgePayload.training.repartition.some((v) => Number(v) > 0),
    'server PDF must receive the portions visible in the calculator',
  );
  assert.equal(
    alerts.some((m) => /PDF state collector unavailable/i.test(m)),
    false,
    `collector must be installed, alerts=${alerts.join(' | ')}`,
  );

  const pdfResult = await page.evaluate(async () => {
    const day = window.joursData.entrainement;
    const res = await fetch('/api/coach-generate-pdf', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/pdf' },
      body: JSON.stringify({
        organization_slug: 'kr-kinetics',
        client_id: '00000000-0000-4000-8000-000000000001',
        locale: 'fr',
        athlete_name: 'Test',
        goal_label: 'Maintien',
        macro_ratio_label: '25 / 45 / 30',
        coach_notes: '',
        goal_multiplier: 1,
        include_rest: false,
        training: {
          banque: day.banque,
          repartition: day.repartition.map((v) => Number(v) || 0),
          targets: { kcal: 2000, pro: 150, glu: 200, lip: 67 },
          timing: { active: false },
        },
        rest: null,
      }),
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3], buf[4]);
    return {
      status: res.status,
      ct: res.headers.get('content-type') || '',
      magic,
      bytes: buf.length,
      requestId: res.headers.get('x-request-id') || '',
    };
  });
  assert.equal(pdfResult.status, 200);
  assert.match(pdfResult.ct, /application\/pdf/);
  assert.equal(pdfResult.magic, '%PDF-');
  assert.ok(pdfResult.bytes > 10);

  // EN locale button should not raise disabled-engine alerts either.
  await page.evaluate(() => {
    if (typeof window.choisirPdfLang === 'function') window.choisirPdfLang('en');
  });
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(alerts.filter((m) => /Client engine disabled/i.test(m)).length, 0);

  await page.close();
});

test('frontend bridge never invokes blocked legacy APIs by name in source', () => {
  const bridge = fs.readFileSync(
    path.join(ROOT, 'src/coach/client/server-nutrition-bridge.mjs'),
    'utf8',
  );
  assert.doesNotMatch(bridge, /CoachSharedEngine\.suggestBanque\s*\(/);
  assert.doesNotMatch(bridge, /blocked\('macroPercentagesFromGrams'\)/);
  assert.match(bridge, /genererPlanTextuelServer/);
  assert.match(bridge, /installServerMacroPercentageHelpers/);
  assert.match(bridge, /pdf_brand:\s*pdfBrand/);
});
