/**
 * Browser flow: submitted row opens the real report page, with no server/pdf
 * module dependency, and the PDF button posts to the dedicated API.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { intakeReportOpenPath } from '../src/coach/intake-report/intake-report-path.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTAL = path.join(ROOT, 'coach-portal');
const CLIENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_ID = '11111111-1111-1111-1111-111111111111';
const REPORT_HREF = intakeReportOpenPath(CLIENT_ID);
const LONG_ANSWER = 'Réponse longue pour le Preview.\n'.repeat(12).trim();

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

function authSessionStub() {
  return `export function getPortalSupabase() {
  const resultFor = (table) => {
    if (table === 'memberships') {
      return {
        data: {
          role: 'coach',
          organization_id: '${ORG_ID}',
          organizations: { id: '${ORG_ID}', slug: 'kr-kinetics', name: 'KR Kinetics' },
        },
        error: null,
      };
    }
    if (table === 'clients') {
      return {
        data: {
          id: '${CLIENT_ID}',
          full_name: 'Client test KR',
          organization_id: '${ORG_ID}',
          is_fictional: false,
          service_type: 'programming',
        },
        error: null,
      };
    }
    if (table === 'client_intake_responses') {
      return {
        data: {
          status: 'submitted',
          submitted_at: '2026-08-15T16:05:00.000Z',
          answers: {
            email: 'preview.client@example.com',
            phone: '5145550199',
            objective_primary: 'Perdre du poids',
            interview_priority: 'Clarifier le plan de semaine',
            other_info: ${JSON.stringify(LONG_ANSWER)},
          },
        },
        error: null,
      };
    }
    return { data: null, error: null };
  };
  const chain = (table) => {
    const q = {
      select() { return q; },
      eq() { return q; },
      order() { return q; },
      limit() { return q; },
      maybeSingle: async () => resultFor(table),
    };
    return q;
  };
  return { from: (table) => chain(table) };
}
export function bindServerSessionCookieSync() { return null; }
export async function recoverSession() {
  return { user: { id: 'user-1' }, access_token: 'tok' };
}
export function redirectPreservingAuthParams() {}
export function redirectClean() {}
`;
}

function dashboardHtml() {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Tableau de bord</title>
<link rel="stylesheet" href="/assets/portal.css"></head>
<body>
<table class="clients-table">
  <tr data-id="${CLIENT_ID}" data-service="programming">
    <td><strong>Client test KR</strong></td>
    <td>
      <div class="client-action-groups">
        <section class="client-action-group" data-group="intake">
          <h4 class="client-action-group-title">Questionnaire d’entrevue</h4>
          <div class="client-action-group-controls">
            <button type="button" class="btn-compact btn-primary btn-intake">Renvoyer un nouveau lien</button>
            <a class="btn-compact btn-secondary btn-intake-report" href="${REPORT_HREF}" target="_blank" rel="noopener">Ouvrir le rapport</a>
          </div>
        </section>
        <section class="client-action-group" data-group="motivation">
          <h4 class="client-action-group-title">Profil motivationnel</h4>
          <span class="status-chip">Aucun lien</span>
          <button type="button" class="btn-compact btn-primary btn-motivation">Envoyer le lien</button>
        </section>
        <div class="client-management-actions">
          <button type="button" class="btn-compact btn-ghost btn-edit">Modifier</button>
          <button type="button" class="btn-compact btn-danger-ghost btn-delete">Supprimer</button>
        </div>
      </div>
    </td>
  </tr>
</table>
</body></html>`;
}

function isAllowedBrowserModule(urlPath) {
  if (urlPath.startsWith('/src/coach/server/')) return false;
  return urlPath.startsWith('/src/coach/intake-report/')
    || urlPath.startsWith('/src/coach/intake/')
    || urlPath.startsWith('/src/coach/motivation/lib/')
    || urlPath.startsWith('/src/coach/workspace/')
    || urlPath.startsWith('/src/coach/domain/')
    || urlPath.startsWith('/src/coach/services/')
    || urlPath.startsWith('/src/coach/client/')
    || urlPath.startsWith('/assets/');
}

function resolveUnder(base, urlPath) {
  const rel = urlPath.replace(/^\/+/, '').split('/').join(path.sep);
  const abs = path.resolve(urlPath.startsWith('/assets/') ? PORTAL : ROOT, rel);
  const root = path.resolve(urlPath.startsWith('/assets/') ? PORTAL : ROOT);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

function startHarness() {
  const state = { pdfMode: 'ok', pdfPosts: 0 };
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
      res.end(fs.readFileSync(path.join(PORTAL, 'pre-interview-report.html')));
      return;
    }
    if (pathname === '/config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'private, no-store' });
      res.end('window.COACH_SUPABASE={url:"https://example.supabase.co",key:"x"};');
      return;
    }
    if (pathname === '/assets/auth-session.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'private, no-store' });
      res.end(authSessionStub());
      return;
    }
    if (pathname === '/api/coach-generate-intake-report-pdf') {
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end();
        return;
      }
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        state.pdfPosts += 1;
        if (state.pdfMode !== 'ok') {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'pdf_failed' }));
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="KR-Kinetics_Pre-entrevue_Client_test_KR_2026-08-15.pdf"',
        });
        res.end(Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n'));
      });
      return;
    }
    if (!isAllowedBrowserModule(pathname)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const abs = resolveUnder(ROOT, pathname);
    if (!abs || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(abs), 'Cache-Control': 'private, no-store' });
    fs.createReadStream(abs).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}`, state });
    });
  });
}

function trackPageNetwork(page) {
  const requested = [];
  const notFound = [];
  page.on('request', (req) => {
    requested.push({ method: req.method(), url: req.url() });
  });
  page.on('response', (res) => {
    if (res.status() === 404) notFound.push(res.url());
  });
  return { requested, notFound };
}

function waitForDownload(dir, timeoutMs = 8000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const files = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((name) => name.endsWith('.pdf') && !name.endsWith('.crdownload'))
        : [];
      if (files.length) {
        resolve(path.join(dir, files[0]));
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('PDF download did not appear'));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

let server;
let origin;
let harness;
let browser;

before(async () => {
  ({ server, origin, state: harness } = await startHarness());
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('submitted row opens the report and does not show Voir réponses', async () => {
  const page = await browser.newPage();
  await page.goto(`${origin}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  const row = await page.$eval('.client-action-groups', (el) => el.textContent.replace(/\s+/g, ' ').trim());
  assert.match(row, /Questionnaire d’entrevue/);
  assert.match(row, /Ouvrir le rapport/);
  assert.match(row, /Profil motivationnel/);
  assert.doesNotMatch(row, /Voir réponses/);
  assert.equal(await page.$('.btn-intake-view'), null);

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

  const popupPromise = new Promise((resolve) => page.once('popup', resolve));
  await page.click('.btn-intake-report');
  const report = await popupPromise;
  await report.waitForSelector('.intake-report');
  const snapshot = await report.evaluate(() => ({
    title: document.querySelector('.intake-report-kicker')?.textContent.trim(),
    client: document.querySelector('.intake-report-client')?.textContent.trim(),
    back: document.querySelector('#back-dashboard')?.textContent.trim(),
    download: document.querySelector('#download-pdf')?.textContent.trim(),
    downloadDisabled: document.querySelector('#download-pdf')?.disabled,
    tokenInUrl: new URL(location.href).searchParams.get('token'),
    clientId: new URL(location.href).searchParams.get('client_id'),
    overflow: getComputedStyle(document.querySelector('.intake-report')).overflow,
    height: getComputedStyle(document.querySelector('.intake-report')).height,
    footer: document.querySelector('.intake-report-footer')?.textContent.trim(),
    longAnswer: document.body.innerText.includes('Réponse longue pour le Preview.'),
  }));
  assert.equal(snapshot.title, 'RAPPORT DE PRÉ-ENTREVUE');
  assert.equal(snapshot.client, 'Client test KR');
  assert.equal(snapshot.back, 'Retour au tableau de bord');
  assert.equal(snapshot.download, 'Télécharger le PDF');
  assert.equal(snapshot.downloadDisabled, false);
  assert.equal(snapshot.tokenInUrl, null);
  assert.equal(snapshot.clientId, CLIENT_ID);
  assert.notEqual(snapshot.overflow, 'hidden');
  assert.notEqual(snapshot.height, '1123px');
  assert.match(snapshot.footer, /confidentielle/i);
  assert.equal(snapshot.longAnswer, true);
  await page.close();
  await report.close();
});

test('PDF button click reaches the API once and downloads application/pdf', async () => {
  const page = await browser.newPage();
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intake-report-pdf-'));
  const cdp = await page.createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  const net = trackPageNetwork(page);
  harness.pdfMode = 'ok';
  harness.pdfPosts = 0;
  await page.goto(`${origin}${REPORT_HREF}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.intake-report');
  assert.equal(await page.$eval('#download-pdf', (el) => el.disabled), false);
  assert.equal(
    net.requested.some((item) => item.url.includes('/src/coach/server/pdf/themes.mjs')),
    false,
  );
  assert.equal(
    net.notFound.filter((url) => !/favicon/i.test(url)).length,
    0,
    `unexpected 404s: ${net.notFound.join(', ')}`,
  );

  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/coach-generate-intake-report-pdf') && res.request().method() === 'POST',
  );
  await page.click('#download-pdf');
  const pdfRes = await responsePromise;
  assert.equal(pdfRes.status(), 200);
  assert.match(String(pdfRes.headers()['content-type'] || ''), /application\/pdf/);
  assert.equal(harness.pdfPosts, 1);
  const downloaded = await waitForDownload(downloadDir);
  assert.match(path.basename(downloaded), /\.pdf$/i);
  assert.equal(fs.readFileSync(downloaded).subarray(0, 4).toString(), '%PDF');
  await page.waitForFunction(() => document.getElementById('download-pdf')?.disabled === false);
  assert.equal(await page.$eval('#download-pdf', (el) => el.disabled), false);

  harness.pdfMode = 'fail';
  await page.click('#download-pdf');
  await page.waitForFunction(() => {
    const text = document.getElementById('status')?.textContent || '';
    return /refusé|impossible/i.test(text);
  });
  assert.match(await page.$eval('#status', (el) => el.textContent), /refusé|impossible/);
  assert.equal(await page.$eval('#download-pdf', (el) => el.disabled), false);
  assert.equal(harness.pdfPosts, 2);
  await page.close();
});
