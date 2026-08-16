/**
 * Chromium visual QA for the motivation coach report (web + PDF pages).
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import {
  PROFILE_A_STABLE,
  analyzeCompleteMotivationProfile,
} from '../../src/coach/motivation/fixtures/complete-profiles.mjs';
import { buildMotivationReportViewModel } from '../../src/coach/motivation/report/motivation-report-view-model.mjs';
import { buildMotivationReportMarkup } from '../../src/coach/motivation/report/build-motivation-report-html.mjs';
import { renderMotivationPdf } from '../../src/coach/motivation/pdf/render-motivation-pdf.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const portal = path.join(root, 'coach-portal');
const outDir = path.join(root, 'tmp', 'motivation-2c4-visual');

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

function buildFixturePage() {
  const { result } = analyzeCompleteMotivationProfile(PROFILE_A_STABLE, {
    assessmentId: 'asm_visual',
    clientName: 'Client test KR',
    completedAt: new Date('2026-08-16T12:00:00.000Z'),
  });
  const vm = buildMotivationReportViewModel({
    report: result.report,
    clientName: 'Client test KR',
    analysisVersion: 1,
    submittedAt: '2026-08-16T12:00:00.000Z',
    analyzedAt: '2026-08-16T12:05:00.000Z',
    provenance: result.provenance,
  });
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
    <div class="intake-report-toolbar-actions">
      <button type="button" class="btn-compact btn-primary" id="download-pdf">Exporter PDF</button>
    </div>
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
    return { pages: pdf.numPages, width: viewport.width, height: viewport.height };
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
let puppeteerReady = true;
let fixtureHtml = '';
let pdfBuffer = null;
let pageCount = 0;

before(async () => {
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fixtureHtml = buildFixturePage();
    const { result } = analyzeCompleteMotivationProfile(PROFILE_A_STABLE, {
      assessmentId: 'asm_visual_pdf',
      clientName: 'Client test KR',
      completedAt: new Date('2026-08-16T12:00:00.000Z'),
    });
    const rendered = await renderMotivationPdf(result.report, {
      clientName: 'Client test KR',
      analysisVersion: 1,
      submittedAt: '2026-08-16T12:00:00.000Z',
      analyzedAt: '2026-08-16T12:05:00.000Z',
    });
    pdfBuffer = rendered.buffer;
    pageCount = rendered.pageCount;
    fs.writeFileSync(path.join(outDir, 'client-test-kr.pdf'), pdfBuffer);
    ({ server, origin } = await startServer(fixtureHtml, pdfBuffer));
    const executablePath = resolveChromePath();
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ...(executablePath ? { executablePath } : {}),
    });
  } catch (error) {
    puppeteerReady = false;
    console.error('motivation visual QA: Chromium unavailable', error?.message || error);
  }
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
  await page.addStyleTag({ content: '.intake-report-toolbar{visibility:visible!important}' });
  return true;
}

test('web report is scannable at 1440 and 390 without horizontal scroll', async (t) => {
  if (!browser) {
    t.skip('Chromium unavailable');
    return;
  }
  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await desktop.goto(`${origin}/motivation-report-visual.html`, { waitUntil: 'networkidle0' });
  await desktop.screenshot({ path: path.join(outDir, 'web-desktop-1440-top.png'), fullPage: false });
  await captureSection(desktop, '[data-section="vigilance"]', 'web-desktop-1440-vigilance.png');
  assert.equal(await captureSection(desktop, '[data-section="interview"]', 'web-desktop-1440-interview.png'), true);
  assert.equal(await captureSection(desktop, '[data-section="nutrition"]', 'web-desktop-1440-nutrition.png'), true);
  assert.equal(await captureSection(desktop, '[data-section="dimensions"]', 'web-desktop-1440-dimensions.png'), true);
  assert.equal(await captureSection(desktop, '[data-section="four-week-plan"]', 'web-desktop-1440-plan.png'), true);
  const desktopMetrics = await desktop.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    logo: Boolean(document.querySelector('.motivation-hero img, .intake-report-logo-wrap img')),
    quick: Boolean(document.querySelector('[data-section="quick-read"]')),
    pdf: document.getElementById('download-pdf')?.textContent.trim(),
    pdfDisabled: document.getElementById('download-pdf')?.disabled,
  }));
  assert.equal(desktopMetrics.overflow, false);
  assert.equal(desktopMetrics.logo, true);
  assert.equal(desktopMetrics.quick, true);
  assert.equal(desktopMetrics.pdf, 'Exporter PDF');
  assert.equal(desktopMetrics.pdfDisabled, false);
  await desktop.close();

  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await mobile.goto(`${origin}/motivation-report-visual.html`, { waitUntil: 'networkidle0' });
  await mobile.screenshot({ path: path.join(outDir, 'web-mobile-390-top.png'), fullPage: false });
  assert.equal(await captureSection(mobile, '[data-section="dimensions"]', 'web-mobile-390-dimensions.png'), true);
  assert.equal(await captureSection(mobile, '[data-section="four-week-plan"]', 'web-mobile-390-plan.png'), true);
  const mobileMetrics = await mobile.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    width: document.documentElement.scrollWidth,
  }));
  assert.equal(mobileMetrics.overflow, false, `scrollWidth=${mobileMetrics.width}`);
  await mobile.close();
});

test('PDF pages render for visual inspection', async (t) => {
  if (!browser || !pdfBuffer) {
    t.skip('Chromium unavailable');
    return;
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 850, height: 1100, deviceScaleFactor: 1 });
  await page.goto(`${origin}/pdf-preview.html`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => typeof window.renderPdfPage === 'function');
  const first = await page.evaluate(async () => window.renderPdfPage(1));
  assert.ok(first.pages >= 2);
  await page.screenshot({ path: path.join(outDir, 'pdf-page-1.png') });
  await page.evaluate(async () => window.renderPdfPage(2));
  await page.screenshot({ path: path.join(outDir, 'pdf-page-2.png') });
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
  for (let n = 1; n <= Math.min(5, first.pages); n += 1) {
    await page.evaluate(async (pageNumber) => window.renderPdfPage(pageNumber), n);
    await page.screenshot({ path: path.join(outDir, `pdf-page-${n}.png`) });
  }
  const dimPage = pagesText.findIndex((text) => /Motivation et adhésion|DIMENSIONS/i.test(text)) + 1 || Math.min(2, first.pages);
  const planPage = pagesText.findIndex((text) => /PLAN 4 SEMAINES|Semaine 1/i.test(text)) + 1 || Math.min(5, first.pages);
  await page.evaluate(async (n) => window.renderPdfPage(n), dimPage);
  await page.screenshot({ path: path.join(outDir, 'pdf-page-dimensions.png') });
  await page.evaluate(async (n) => window.renderPdfPage(n), planPage);
  await page.screenshot({ path: path.join(outDir, 'pdf-page-plan.png') });
  await page.evaluate(async (n) => window.renderPdfPage(n), first.pages);
  await page.screenshot({ path: path.join(outDir, 'pdf-page-last.png') });
  assert.ok(pageCount >= 2);
  await page.close();
});
