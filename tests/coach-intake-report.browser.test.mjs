/**
 * Browser Preview flow: submitted dashboard row opens the report in a new tab.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { intakeReportOpenPath } from '../src/coach/intake-report/intake-report-path.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTAL = path.join(ROOT, 'coach-portal');
const CLIENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REPORT_HREF = intakeReportOpenPath(CLIENT_ID);

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
  })[ext] || 'application/octet-stream';
}

function dashboardHtml() {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Tableau de bord</title>
<link rel="stylesheet" href="/assets/portal.css"></head>
<body>
<table class="clients-table">
  <tr data-id="${CLIENT_ID}" data-service="programming">
    <td><strong>TEST EMAIL INVITE KR</strong></td>
    <td>
      <div class="client-actions">
        <a class="btn-compact btn-secondary btn-intake-report" href="${REPORT_HREF}" target="_blank" rel="noopener">Ouvrir le rapport</a>
        <button type="button" class="btn-compact btn-secondary btn-intake-view">Voir réponses</button>
      </div>
    </td>
  </tr>
</table>
</body></html>`;
}

function reportPageHtml() {
  const source = fs.readFileSync(path.join(PORTAL, 'pre-interview-report.html'), 'utf8');
  return source.replace(
    /<script type="module" src="\.\/assets\/pre-interview-report\.js"><\/script>/,
    `<script type="module">
      import { buildIntakeReportViewModel } from '/src/coach/intake-report/intake-report-view-model.mjs';
      import { buildIntakeReportMarkup } from '/src/coach/intake-report/build-intake-report-html.mjs';
      const params = new URLSearchParams(location.search);
      if (params.get('token')) throw new Error('token must not be read');
      const vm = buildIntakeReportViewModel({
        clientName: 'TEST EMAIL INVITE KR',
        submittedAt: '2026-08-15T16:05:00.000Z',
        answers: {
          email: 'preview.client@example.com',
          phone: '5145550199',
          objective_primary: 'Perdre du poids',
          interview_priority: 'Clarifier le plan de semaine',
          other_info: 'Réponse longue pour le Preview.\\n'.repeat(12),
        },
      });
      document.getElementById('report-root').innerHTML = buildIntakeReportMarkup(vm, {
        logoSrc: './assets/logo-kr-kinetics-horizontal.png',
      });
    </script>`,
  );
}

function startHarness() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = url.pathname;
    if (pathname === '/dashboard.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' });
      res.end(dashboardHtml());
      return;
    }
    if (pathname === '/pre-interview-report.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' });
      res.end(reportPageHtml());
      return;
    }
    let abs = null;
    if (pathname.startsWith('/src/coach/')) {
      abs = path.join(ROOT, pathname.replace(/^\/+/, '').split('/').join(path.sep));
    } else if (pathname.startsWith('/assets/')) {
      abs = path.join(PORTAL, pathname.replace(/^\/+/, '').split('/').join(path.sep));
    }
    if (!abs || !abs.startsWith(ROOT) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(abs), 'Cache-Control': 'private, no-store' });
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

before(async () => {
  ({ server, origin } = await startHarness());
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('submitted row opens the report in a new tab with download action', async () => {
  const page = await browser.newPage();
  await page.goto(`${origin}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  const cta = await page.$eval('.btn-intake-report', (el) => ({
    href: el.getAttribute('href'),
    target: el.getAttribute('target'),
    rel: el.getAttribute('rel'),
    text: el.textContent.trim(),
  }));
  assert.equal(cta.href, REPORT_HREF);
  assert.equal(cta.target, '_blank');
  assert.equal(cta.rel, 'noopener');
  assert.equal(cta.text, 'Ouvrir le rapport');
  assert.equal(await page.$eval('.btn-intake-view', (el) => el.textContent.trim()), 'Voir réponses');

  const popupPromise = new Promise((resolve) => page.once('popup', resolve));
  await page.click('.btn-intake-report');
  const report = await popupPromise;
  await report.waitForSelector('.intake-report');
  const snapshot = await report.evaluate(() => ({
    title: document.querySelector('.intake-report-kicker')?.textContent.trim(),
    client: document.querySelector('.intake-report-client')?.textContent.trim(),
    back: document.querySelector('#back-dashboard')?.textContent.trim(),
    download: document.querySelector('#download-pdf')?.textContent.trim(),
    tokenInUrl: new URL(location.href).searchParams.get('token'),
    clientId: new URL(location.href).searchParams.get('client_id'),
    overflow: getComputedStyle(document.querySelector('.intake-report')).overflow,
    height: getComputedStyle(document.querySelector('.intake-report')).height,
  }));
  assert.equal(snapshot.title, 'RAPPORT DE PRÉ-ENTREVUE');
  assert.equal(snapshot.client, 'TEST EMAIL INVITE KR');
  assert.equal(snapshot.back, 'Retour au tableau de bord');
  assert.equal(snapshot.download, 'Télécharger le PDF');
  assert.equal(snapshot.tokenInUrl, null);
  assert.equal(snapshot.clientId, CLIENT_ID);
  assert.notEqual(snapshot.overflow, 'hidden');
  assert.notEqual(snapshot.height, '1123px');
  await page.close();
  await report.close();
});
