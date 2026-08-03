/**
 * Science/UI browser QA (ported from SCIENCE_UI_REVIEW package, using Puppeteer).
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COACH_DIR = path.join(ROOT, 'coach-calculator');
const REPORTS = path.join(ROOT, 'reports', 'coach-calculator-science-ui');
// Write PDFs outside the git worktree so nutrition:final-audit's dirty-tree PDF guard stays clean.
const ARTIFACT_DIR = path.join(ROOT, 'verify-science-ui-artifacts');
const PROFILE = path.join(ROOT, 'reports', 'coach-calculator-restoration', 'xavier-profile-export.json');

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.pdf': 'application/pdf',
  })[ext] || 'application/octet-stream';
}

function startServer(rootDir) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname || '/');
    if (!rel || rel === '/') rel = '/index.html';
    const safeRel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
    const filePath = path.join(rootDir, safeRel);
    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
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
let page;

before(async () => {
  const build = spawnSync(process.execPath, ['scripts/coach-calculator-build.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(build.status, 0, build.stderr || build.stdout || 'coach build failed');
  fs.mkdirSync(path.join(REPORTS, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(ARTIFACT_DIR, 'generated-pdfs'), { recursive: true });
  ({ server, origin } = await startServer(COACH_DIR));
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.alert = () => {};
    window.confirm = () => true;
  });
  page.on('dialog', async (dialog) => {
    try { await dialog.accept(); } catch { /* ignore */ }
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});

async function loadXavier() {
  const profile = JSON.parse(fs.readFileSync(PROFILE, 'utf8'));
  profile.energyEquationVersion = 'nasem2023';
  await page.evaluate((data) => {
    window.appliquerProfilData(data, 'Xavier Tremblay');
  }, profile);
  await new Promise((r) => setTimeout(r, 250));
}

test('science UI branding, NASEM default, workflow and viewports', async () => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) {
      runtimeErrors.push(message.text());
    }
  });

  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${origin}/`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction(() => window.COACH_DATA?.totalFoods === 287);
  await loadXavier();

  const header = await page.$eval('.app-header', (el) => {
    const style = getComputedStyle(el);
    return { background: style.backgroundImage, color: style.color, border: style.borderBottomColor };
  });
  assert.match(header.background, /rgb\(7,\s*27,\s*65\)/);
  assert.equal(header.color, 'rgb(255, 255, 255)');
  assert.equal(header.border, 'rgb(237, 17, 54)');
  assert.match(await page.$eval('#scientific-scope', (el) => el.innerText), /NASEM 2023/);
  assert.equal(await page.$eval('#tdee-out', (el) => el.innerText), '3167');
  assert.equal(await page.$eval('.goal-card.active', (el) => el.getAttribute('data-multiplier')), '1.0');

  const workflow = await page.evaluate(() => {
    const originalName = document.getElementById('nom_athlete').value;
    document.getElementById('nom_athlete').value = 'Test Fiabilité KR';
    window.sauvegarderProfil();
    const saved = Boolean(localStorage.getItem('athlete_Test Fiabilité KR'));
    document.getElementById('age').value = '55';
    document.getElementById('liste_profils').value = 'athlete_Test Fiabilité KR';
    window.chargerProfil();
    const loadedAge = document.getElementById('age').value;
    window.supprimerProfil();
    const deleted = !localStorage.getItem('athlete_Test Fiabilité KR');
    document.getElementById('nom_athlete').value = originalName;

    document.getElementById('guide-search').value = 'saumon';
    window.filtrerGuideEquivalents();
    const guideCount = Number(document.getElementById('guide-count').textContent.split('/')[0].trim());
    document.getElementById('guide-search').value = '';
    window.filtrerGuideEquivalents();

    window.suggererBanque();
    window.repartirAutomatique('classique');
    window.genererPlanTextuel();
    const bankKcal = Number(document.getElementById('gen-kcal').textContent.replace(/[^0-9.-]/g, ''));
    const distributed = Array.from(document.querySelectorAll('.rep-input')).some((input) => Number(input.value) > 0);
    const planOk = document.getElementById('output-plan').value.includes('Xavier Tremblay');
    return { saved, loadedAge, deleted, guideCount, bankKcal, distributed, planOk };
  });
  assert.equal(workflow.saved, true);
  assert.equal(workflow.loadedAge, '32');
  assert.equal(workflow.deleted, true);
  assert.ok(workflow.guideCount > 0 && workflow.guideCount < 287);
  assert.ok(workflow.bankKcal > 0);
  assert.equal(workflow.distributed, true);
  assert.equal(workflow.planOk, true);

  await loadXavier();
  // Capture to gitignored artifacts and compare to tracked baselines.
  // Never overwrite tracked PNGs during normal test runs (keeps git clean).
  // Set COACH_UPDATE_SCIENCE_UI_SCREENSHOTS=1 to refresh baselines intentionally.
  const updateBaselines = process.env.COACH_UPDATE_SCIENCE_UI_SCREENSHOTS === '1';
  const actualShotDir = path.join(ARTIFACT_DIR, 'screenshots');
  fs.mkdirSync(actualShotDir, { recursive: true });
  async function captureAndCompare(name, shotOptions) {
    const baseline = path.join(REPORTS, 'screenshots', name);
    const actual = path.join(actualShotDir, name);
    await page.screenshot({ path: actual, ...shotOptions });
    assert.ok(fs.existsSync(baseline), `missing visual baseline: ${name}`);
    const actualBuf = fs.readFileSync(actual);
    const baselineBuf = fs.readFileSync(baseline);
    if (updateBaselines) {
      fs.writeFileSync(baseline, actualBuf);
      return;
    }
    assert.ok(
      actualBuf.equals(baselineBuf),
      `visual regression: ${name} differs from baseline (see ${actual})`,
    );
  }
  await captureAndCompare('desktop-1440-science-ui.png', { fullPage: true });
  await page.setViewport({ width: 768, height: 1024 });
  await captureAndCompare('tablet-768-science-ui.png', { fullPage: true });
  await page.setViewport({ width: 390, height: 1600 });
  await captureAndCompare('mobile-390-science-ui.png', { fullPage: false });

  // PDF FR/EN via HTML print path (same as owner artifacts)
  await page.setViewport({ width: 1440, height: 1000 });
  await loadXavier();

  async function buildAndAssertPdfBounds(lang) {
    const report = await page.evaluate(async (pdfLang) => {
      window.choisirPdfLang(pdfLang);
      const training = window.getJourSnapshot('entrainement');
      const rest = window.getClientPdfRestSnapshot();
      const html = window.buildFullPDFHTML(
        training, rest, 'Xavier Tremblay', '2026-07-31', window.getMacroRatioLabel(), window.getActiveGoalLabel(),
      );
      const iframe = window.creerIframePDF(html);
      await window.attendreRenduPDF(iframe);
      const doc = iframe.contentWindow.document;
      const pages = Array.from(doc.querySelectorAll('.pdf-a4-page'));
      const overflows = [];
      for (const pageEl of pages) {
        const pageRight = pageEl.getBoundingClientRect().right;
        for (const el of pageEl.querySelectorAll('*')) {
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          const over = rect.right - pageRight;
          if (over > 1) {
            overflows.push({
              tag: el.tagName,
              className: String(el.className || '').slice(0, 80),
              over: Math.round(over * 100) / 100,
            });
          }
        }
      }
      window.nettoyerIframePDF();
      return { html, overflows, pageCount: pages.length };
    }, lang);
    assert.match(report.html, /pdf-brand-header/);
    assert.equal(
      report.overflows.length,
      0,
      `${lang}: horizontal overflow >1px before export: ${JSON.stringify(report.overflows.slice(0, 8), null, 2)}`,
    );
    return report.html;
  }

  const frHtml = await buildAndAssertPdfBounds('fr');
  assert.match(frHtml, /#071B41/);
  const enHtml = await buildAndAssertPdfBounds('en');

  async function renderPdf(html, outPath) {
    const pdfPage = await browser.newPage();
    await pdfPage.setContent(html, { waitUntil: 'networkidle0' });
    await pdfPage.waitForFunction(() => {
      const imgs = Array.from(document.images);
      return imgs.length === 0 || imgs.every((img) => img.complete && img.naturalWidth > 0);
    }, { timeout: 15000 });
    await pdfPage.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
    });
    await pdfPage.close();
  }

  await renderPdf(frHtml, path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-client-fr-science-ui.pdf'));
  await renderPdf(enHtml, path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-client-en-science-ui.pdf'));

  assert.equal(runtimeErrors.length, 0, runtimeErrors.join('\n'));
});
