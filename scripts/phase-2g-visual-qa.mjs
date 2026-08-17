/**
 * Phase 2G visual captures. Local only. Does not push or reanalyze stored clients.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import {
  analyzeCompleteMotivationProfileV42,
  V42_DANNY_LIKE,
} from '../src/coach/motivation/fixtures/complete-profiles-v42.mjs';
import { buildCanonicalClientIdentity } from '../src/coach/motivation/identity/canonical-client-identity.mjs';
import { buildMotivationReportViewModel } from '../src/coach/motivation/report/motivation-report-view-model.mjs';
import { buildMotivationReportMarkup } from '../src/coach/motivation/report/build-motivation-report-html.mjs';
import { renderMotivationPdf } from '../src/coach/motivation/pdf/render-motivation-pdf.mjs';
import { buildIntakeReportViewModel } from '../src/coach/intake-report/intake-report-view-model.mjs';
import { buildIntakeReportDocumentHtml } from '../src/coach/intake-report/build-intake-report-html.mjs';
import {
  buildWorkspaceIntakeLandmarksHtml,
  describeWorkspaceIntakeLandmarks,
} from '../src/coach/workspace/workspace-intake-landmarks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portal = path.join(root, 'coach-portal');
const outDir = path.join(root, 'reports', 'motivation-2g-visual');

const DANNY = {
  id: '5a94561a-1111-4111-8111-aaaaaaaaaaaa',
  full_name: 'Danny R',
  email: 'danny@example.com',
  phone: '5145550100',
  service_type: 'complete',
};

const INTAKE_ANSWERS = {
  email: 'client.test@example.com',
  phone: '5145550199',
  age_years: '34',
  height_unit: 'imperial',
  height_feet: '5',
  height_inches: '10',
  weight_lb: '185',
  objective_primary: 'Perte de masse adipeuse',
  objective_detail: 'Retrouver une routine réaliste.',
  activity_level: 'Modérément actif',
  work_type: 'Assis ou peu actif',
  schedule: 'Régulier',
  medications_status: 'Non',
  allergies_status: 'Non',
  restriction_status: 'Non',
  challenges: ['Manque de temps'],
  interview_priority: 'Plan de semaine réaliste',
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
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
  })[ext] || 'application/octet-stream';
}

function startServer(extraPages = {}, pdfFiles = {}) {
  const pdfjsRoot = path.join(root, 'node_modules', 'pdfjs-dist');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (extraPages[url.pathname]) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(extraPages[url.pathname]);
      return;
    }
    if (pdfFiles[url.pathname]) {
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end(pdfFiles[url.pathname]);
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
    if (url.pathname.startsWith('/src/coach/')) {
      const abs = path.normalize(path.join(root, url.pathname.replace(/^\//, '')));
      if (!abs.startsWith(path.join(root, 'src', 'coach')) || !fs.existsSync(abs)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType(abs) });
      fs.createReadStream(abs).pipe(res);
      return;
    }
    const rel = url.pathname.replace(/^\//, '') || 'intake.html';
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

function saveDataUrl(dataUrl, filename) {
  const raw = String(dataUrl || '').replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(outDir, filename), Buffer.from(raw, 'base64'));
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const { result } = analyzeCompleteMotivationProfileV42(V42_DANNY_LIKE, {
    assessmentId: 'asm_danny_2g',
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
  const intakeVm = buildIntakeReportViewModel({
    clientName: 'Client Test KR',
    submittedAt: '2026-08-15T16:05:00.000Z',
    answers: INTAKE_ANSWERS,
  });
  const intakeHtml = buildIntakeReportDocumentHtml({
    viewModel: intakeVm,
    mode: 'screen',
    logoSrc: './assets/logo-kr-kinetics-horizontal.png',
  });
  const landmarks = describeWorkspaceIntakeLandmarks(INTAKE_ANSWERS, '2026-08-15T16:05:00.000Z');
  const landmarksPage = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Repères client</title>
<style>body{margin:24px;background:#f8fafc;font-family:system-ui,sans-serif}</style></head>
<body>${buildWorkspaceIntakeLandmarksHtml(landmarks, (v) => String(v).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])))}</body></html>`;

  const rendered = await renderMotivationPdf(result.report, {
    identity,
    analysisVersion: 1,
    submittedAt: '2026-08-16T12:00:00.000Z',
    analyzedAt: '2026-08-16T12:05:00.000Z',
  });
  fs.writeFileSync(path.join(outDir, '08-danny-motivation.pdf'), rendered.buffer);

  const { server, origin } = await startServer({
    '/pre-interview-visual.html': intakeHtml,
    '/workspace-landmarks.html': landmarksPage,
    '/motivation-report-visual.html': `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><link rel="stylesheet" href="./assets/portal.css"><link rel="stylesheet" href="./assets/motivation-report.css"></head><body class="intake-report-page motivation-report-page"><div id="report-root">${buildMotivationReportMarkup(vm, { logoSrc: './assets/logo-kr-kinetics-horizontal.png' })}</div></body></html>`,
    '/pdf-preview.html': `<!DOCTYPE html><html><body style="margin:0;background:#f4f7fb">
<canvas id="c"></canvas>
<script type="module">
  import * as pdfjs from '/pdfjs/legacy/build/pdf.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/legacy/build/pdf.worker.mjs';
  window.renderPdf = async (url, pageNumber) => {
    const res = await fetch(url);
    const data = new Uint8Array(await res.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data }).promise;
    const pdfPage = await pdf.getPage(pageNumber);
    const viewport = pdfPage.getViewport({ scale: 1.25 });
    const canvas = document.getElementById('c');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const items = await pdfPage.getTextContent();
    return {
      pages: pdf.numPages,
      text: items.items.map((item) => item.str).join(' '),
      dataUrl: canvas.toDataURL('image/png'),
    };
  };
</script>
</body></html>`,
  }, {
    '/danny.pdf': rendered.buffer,
  });
  const executablePath = resolveChromePath();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ...(executablePath ? { executablePath } : {}),
  });

  const intakePage = await browser.newPage();
  await intakePage.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  await intakePage.goto(`${origin}/intake.html`, { waitUntil: 'networkidle0' });
  await intakePage.evaluate(() => {
    document.getElementById('loading-card')?.classList.add('hidden');
    document.getElementById('error-card')?.classList.add('hidden');
    document.getElementById('intake-form')?.classList.remove('hidden');
    const name = document.getElementById('client-name');
    if (name) name.textContent = 'Client Test,';
  });
  await intakePage.screenshot({ path: path.join(outDir, '01-intake-step1-desktop.png') });
  await intakePage.screenshot({ path: path.join(outDir, '03-height-imperial.png') });
  await intakePage.click('input[name="height_unit"][value="metric"]');
  await intakePage.waitForSelector('#height-metric:not(.hidden)');
  await intakePage.screenshot({ path: path.join(outDir, '04-height-metric.png') });
  await intakePage.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await intakePage.click('input[name="height_unit"][value="imperial"]');
  await intakePage.screenshot({ path: path.join(outDir, '02-intake-step1-mobile.png') });
  await intakePage.close();

  const reportPage = await browser.newPage();
  await reportPage.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  await reportPage.goto(`${origin}/pre-interview-visual.html`, { waitUntil: 'networkidle0' });
  await reportPage.screenshot({ path: path.join(outDir, '05-preinterview-web-top.png') });
  const pdf = await reportPage.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0mm', right: '0mm', bottom: '12mm', left: '0mm' },
  });
  fs.writeFileSync(path.join(outDir, 'pre-interview-client-test.pdf'), pdf);
  await reportPage.close();

  const landPage = await browser.newPage();
  await landPage.setViewport({ width: 1100, height: 400, deviceScaleFactor: 1 });
  await landPage.goto(`${origin}/workspace-landmarks.html`, { waitUntil: 'networkidle0' });
  await landPage.screenshot({ path: path.join(outDir, '07-nutrition-reperes-client.png') });
  await landPage.close();

  const preview = await browser.newPage();
  await preview.setViewport({ width: 850, height: 1100, deviceScaleFactor: 1 });
  await preview.goto(`${origin}/pdf-preview.html`, { waitUntil: 'networkidle0' });
  await preview.waitForFunction(() => typeof window.renderPdf === 'function');

  const intakeShot = await preview.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    return window.renderPdf(url, 1);
  }, Buffer.from(pdf).toString('base64'));
  saveDataUrl(intakeShot.dataUrl, '06-preinterview-pdf-page1.png');

  const dannyTexts = [];
  for (let n = 1; n <= rendered.pageCount; n += 1) {
    const shot = await preview.evaluate(async (pageNumber) => window.renderPdf('/danny.pdf', pageNumber), n);
    saveDataUrl(shot.dataUrl, `danny-pdf-page-${n}.png`);
    dannyTexts.push(shot.text || '');
  }
  fs.writeFileSync(path.join(outDir, 'danny-extracted.txt'), dannyTexts.join('\n\n----- PAGE -----\n\n'));
  fs.writeFileSync(path.join(outDir, 'danny-page-count.txt'), String(rendered.pageCount));
  await preview.close();

  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log(`2G visual captures written to ${outDir} (${rendered.pageCount} Danny pages)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
