/**
 * Historical PDF visual QA — Danny-like report-model-v4.3 snapshot.
 * Presentation only. Does not mutate or reanalyze a stored client.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import {
  analyzeCompleteMotivationProfileV42,
  V42_DANNY_LIKE,
} from '../../src/coach/motivation/fixtures/complete-profiles-v42.mjs';
import { buildCanonicalClientIdentity } from '../../src/coach/motivation/identity/canonical-client-identity.mjs';
import { buildMotivationReportViewModel } from '../../src/coach/motivation/report/motivation-report-view-model.mjs';
import { buildMotivationReportMarkup } from '../../src/coach/motivation/report/build-motivation-report-html.mjs';
import { renderMotivationPdf } from '../../src/coach/motivation/pdf/render-motivation-pdf.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const portal = path.join(root, 'coach-portal');
const outDir = path.join(root, 'reports', 'motivation-2e1-visual');

const DANNY = {
  id: '5a94561a-1111-4111-8111-aaaaaaaaaaaa',
  full_name: 'Danny R',
  email: 'danny@example.com',
  phone: '5145550100',
  service_type: 'complete',
};

function resolveChromePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
  })[ext] || 'application/octet-stream';
}

function buildDannyBundle() {
  const { result } = analyzeCompleteMotivationProfileV42(V42_DANNY_LIKE, {
    assessmentId: 'asm_danny_visual',
    clientId: DANNY.id,
    clientName: DANNY.full_name,
    completedAt: new Date('2026-08-16T12:00:00.000Z'),
  });
  const identity = buildCanonicalClientIdentity(DANNY).identity;
  const vm = buildMotivationReportViewModel({
    report: result.report,
    identity,
    clientId: DANNY.id,
    clientName: DANNY.full_name,
    analysisVersion: 1,
    submittedAt: '2026-08-16T12:00:00.000Z',
    analyzedAt: '2026-08-16T12:05:00.000Z',
    provenance: result.provenance,
  });
  return { result, identity, vm };
}

function buildFixturePage(vm) {
  const body = buildMotivationReportMarkup(vm, {
    logoSrc: './assets/logo-kr-kinetics-horizontal.png',
  });
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="./assets/portal.css">
  <link rel="stylesheet" href="./assets/intake-report-document.css">
  <link rel="stylesheet" href="./assets/pre-interview-report-chrome.css">
  <link rel="stylesheet" href="./assets/motivation-report.css">
</head>
<body class="intake-report-page motivation-report-page">
  <div class="intake-report-toolbar" data-screen-only="true">
    <a class="btn-compact btn-ghost" href="./dashboard.html">Retour au tableau de bord</a>
  </div>
  <div id="report-root">${body}</div>
</body>
</html>`;
}

function startServer(html, pdfBuffer) {
  const pdfjsRoot = path.join(root, 'node_modules', 'pdfjs-dist');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/' || url.pathname === '/motivation-report-visual.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    if (url.pathname === '/report.pdf') {
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end(pdfBuffer);
      return;
    }
    if (url.pathname === '/pdf-preview.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html><body style="margin:0;background:#f4f7fb">
<canvas id="c" width="850" height="1100"></canvas>
<script type="module">
  import * as pdfjs from '/pdfjs/legacy/build/pdf.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/legacy/build/pdf.worker.mjs';
  window.renderPdfPage = async (pageNumber) => {
    const res = await fetch('/report.pdf');
    const data = new Uint8Array(await res.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data }).promise;
    const pdfPage = await pdf.getPage(pageNumber);
    const viewport = pdfPage.getViewport({ scale: 1.2 });
    const canvas = document.getElementById('c');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return {
      pages: pdf.numPages,
      width: viewport.width,
      height: viewport.height,
      dataUrl: canvas.toDataURL('image/png'),
    };
  };
</script>
</body></html>`);
      return;
    }
    if (url.pathname.startsWith('/pdfjs/')) {
      const abs = path.normalize(path.join(pdfjsRoot, url.pathname.replace(/^\/pdfjs\//, '')));
      if (!abs.startsWith(pdfjsRoot) || !fs.existsSync(abs)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType(abs) });
      fs.createReadStream(abs).pipe(res);
      return;
    }
    const rel = url.pathname.replace(/^\//, '');
    const abs = path.normalize(path.join(portal, rel));
    if (!abs.startsWith(portal) || !fs.existsSync(abs)) {
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
let pdfBuffer = null;
let pageCount = 0;
let schemaVersion = '';
let reportModelVersion = '';

before(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const bundle = buildDannyBundle();
  schemaVersion = bundle.result.report.schemaVersion;
  reportModelVersion = bundle.result.report.metadata.reportModelVersion;
  const html = buildFixturePage(bundle.vm);
  const rendered = await renderMotivationPdf(bundle.result.report, {
    identity: bundle.identity,
    analysisVersion: 1,
    submittedAt: '2026-08-16T12:00:00.000Z',
    analyzedAt: '2026-08-16T12:05:00.000Z',
  });
  pdfBuffer = rendered.buffer;
  pageCount = rendered.pageCount;
  fs.writeFileSync(path.join(outDir, 'danny-historique.pdf'), pdfBuffer);
  ({ server, origin } = await startServer(html, pdfBuffer));
  const executablePath = resolveChromePath();
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ...(executablePath ? { executablePath } : {}),
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function captureSection(page, selector, filename) {
  await page.addStyleTag({ content: '.intake-report-toolbar{visibility:hidden!important}' });
  const handle = await page.$(selector);
  if (!handle) return false;
  await handle.screenshot({ path: path.join(outDir, filename) });
  return true;
}

test('historical Danny snapshot stays on report-model-v4.3', () => {
  assert.equal(schemaVersion, 'report-model-v4.3');
  assert.equal(reportModelVersion, 'v4.3');
});

test('historical Danny web captures identity, factors and nutrition', async (t) => {
  if (!browser) {
    t.skip('Chromium unavailable');
    return;
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${origin}/motivation-report-visual.html`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(outDir, 'web-danny-top.png'), fullPage: false });
  assert.equal(await captureSection(page, '[data-section="dimensions"]', 'web-danny-facteurs.png'), true);
  assert.equal(await captureSection(page, '[data-section="nutrition"]', 'web-danny-nutrition.png'), true);
  const text = await page.evaluate(() => document.body.innerText);
  assert.match(text, /Danny R/);
  assert.match(text, /Nutrition/i);
  assert.doesNotMatch(text, /\b(low|moderate|high)\b/);
  await page.close();
});

test('historical Danny PDF pages render without lost nutrition or empty pages', async (t) => {
  if (!browser || !pdfBuffer) {
    t.skip('Chromium unavailable');
    return;
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 850, height: 1100, deviceScaleFactor: 1 });
  await page.goto(`${origin}/pdf-preview.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => typeof window.renderPdfPage === 'function');
  const first = await page.evaluate(async () => window.renderPdfPage(1));
  assert.ok(Number.isInteger(first.pages) && first.pages >= 1);
  assert.equal(pageCount, first.pages);
  const pagesText = await page.evaluate(async () => {
    const res = await fetch('/report.pdf');
    const data = new Uint8Array(await res.arrayBuffer());
    const pdfjs = await import('/pdfjs/legacy/build/pdf.mjs');
    const pdf = await pdfjs.getDocument({ data }).promise;
    const out = [];
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const pdfPage = await pdf.getPage(i);
      const content = await pdfPage.getTextContent();
      out.push(content.items.map((item) => item.str).join(' '));
    }
    return out;
  });
  const all = pagesText.join('\n');
  assert.ok(pagesText.every((text) => text.trim().length > 0), 'historical PDF must not contain empty pages');
  assert.match(pagesText[0] || '', /Danny R/);
  assert.match(all, /Nutrition/i);
  assert.match(all, /report-model-v4\.3/);
  assert.match(all, /Plan issu de l'analyse historique/);
  assert.doesNotMatch(all, /\b(low|moderate|high)\b/);
  assert.doesNotMatch(all, /high\s*·\s*Mixte/i);
  for (let n = 1; n <= first.pages; n += 1) {
    await page.evaluate(async (pageNumber) => window.renderPdfPage(pageNumber), n);
    await page.screenshot({ path: path.join(outDir, `pdf-page-${n}.png`) });
  }
  const factorsPage = pagesText.findIndex((text) => /Facteurs de décision|Nutrition/i.test(text)) + 1 || 2;
  const planPage = pagesText.findIndex((text) => /PLAN 4 SEMAINES|SEMAINE 1/i.test(text)) + 1 || first.pages;
  await page.evaluate(async (n) => window.renderPdfPage(n), 1);
  await page.screenshot({ path: path.join(outDir, 'pdf-page-1.png') });
  await page.evaluate(async (n) => window.renderPdfPage(n), factorsPage);
  await page.screenshot({ path: path.join(outDir, 'pdf-page-facteurs-nutrition.png') });
  await page.evaluate(async (n) => window.renderPdfPage(n), planPage);
  await page.screenshot({ path: path.join(outDir, 'pdf-page-plan.png') });
  const montage = await page.evaluate(async (count) => {
    const shots = [];
    for (let n = 1; n <= count; n += 1) {
      const data = await window.renderPdfPage(n);
      shots.push(data.dataUrl);
    }
    const w = 420;
    const h = 544;
    const canvas = document.createElement('canvas');
    canvas.width = w * Math.min(4, count);
    canvas.height = h * Math.ceil(count / 4);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4f7fb';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < shots.length; i += 1) {
      const img = new Image();
      img.src = shots[i];
      await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
      ctx.drawImage(img, (i % 4) * w, Math.floor(i / 4) * h, w, h);
    }
    return canvas.toDataURL('image/png');
  }, first.pages);
  if (montage?.startsWith('data:image')) {
    const raw = montage.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(path.join(outDir, 'pdf-montage.png'), Buffer.from(raw, 'base64'));
  }
  await page.close();
});
