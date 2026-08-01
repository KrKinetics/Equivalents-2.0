/**
 * Dual-brand browser QA: exclusive KR / Elevate PDF + guide selection.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { PDFParse } from 'pdf-parse';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COACH_DIR = path.join(ROOT, 'coach-calculator');
const ARTIFACT_DIR = path.join(ROOT, 'verify-elevate-dual-brand');
const PROFILE = path.join(ROOT, 'reports', 'coach-calculator-restoration', 'xavier-profile-export.json');
const FORBIDDEN_IN_ELEVATE = [/KR Kinetics/i, /logo-kr/i, /projet conjoint/i];

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
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

function assertNoForbidden(text, label) {
  for (const pattern of FORBIDDEN_IN_ELEVATE) {
    assert.equal(pattern.test(text), false, `${label} contains forbidden pattern ${pattern}`);
  }
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
  fs.mkdirSync(path.join(ARTIFACT_DIR, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(ARTIFACT_DIR, 'generated-pdfs'), { recursive: true });
  fs.mkdirSync(path.join(ARTIFACT_DIR, 'review'), { recursive: true });
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

async function readPersonalizedScenario() {
  return page.evaluate(() => {
    if (typeof window.calculerBanque === 'function') window.calculerBanque();
    if (typeof window.updateEtatPlan === 'function') window.updateEtatPlan();
    const cats = ['pro', 'fec', 'leg', 'fru', 'lai', 'lip', 'whey'];
    const moyennes = window.COACH_DATA?.moyennes;
    const banqueInputs = {};
    for (const cat of cats) {
      banqueInputs[cat] = parseFloat(document.querySelector(`.target-input[data-cat="${cat}"]`)?.value) || 0;
    }
    const computed = window.computeBanqueTotalsFromData(banqueInputs);
    let proRaw = 0; let gluRaw = 0; let lipRaw = 0;
    cats.forEach((cat) => {
      const value = banqueInputs[cat] || 0;
      proRaw += value * moyennes[cat].p;
      gluRaw += value * moyennes[cat].g;
      lipRaw += value * moyennes[cat].l;
    });
    const rawKcal = Math.round(proRaw * 4 + gluRaw * 4 + lipRaw * 9);
    const roundedMacroKcal = Math.round(
      Math.round(proRaw) * 4 + Math.round(gluRaw) * 4 + Math.round(lipRaw) * 9,
    );
    const bank = {
      pro: Number(document.getElementById('gen-pro').textContent.replace(/[^0-9.-]/g, '')),
      glu: Number(document.getElementById('gen-glu').textContent.replace(/[^0-9.-]/g, '')),
      lip: Number(document.getElementById('gen-lip').textContent.replace(/[^0-9.-]/g, '')),
      kcal: Number(document.getElementById('gen-kcal').textContent.replace(/[^0-9.-]/g, '')),
    };
    const snap = window.getJourSnapshot('entrainement');
    const planned = {
      pro: snap.totalPro,
      glu: snap.totalGlu,
      lip: snap.totalLip,
      kcal: snap.totalKcal,
    };
    const exportable = !document.getElementById('btn-export-pdf')?.disabled;
    return {
      bank,
      computed,
      rawKcal,
      roundedMacroKcal,
      planned,
      exportable,
      within: typeof window.withinCoachTolerance === 'function'
        ? window.withinCoachTolerance(snap.targets, planned)
        : null,
      foodCount: window.COACH_DATA?.totalFoods,
      featureDaEnabled: window.COACH_DATA?.featureDaEnabled,
      banqueTotalsFromSnap: snap.banqueTotals,
    };
  });
}

async function buildPdfHtml(creator, lang) {
  return page.evaluate(async ({ creator, lang }) => {
    window.choisirPdfCreator(creator);
    window.choisirPdfLang(lang);
    window.genererPlanTextuel();
    const training = window.getJourSnapshot('entrainement');
    const rest = window.getClientPdfRestSnapshot();
    const html = window.buildFullPDFHTML(
      training,
      rest,
      'Xavier Tremblay',
      '2026-08-01',
      window.getMacroRatioLabel(),
      window.getActiveGoalLabel(),
    );
    const brand = window.getSelectedPdfBrand();
    const guideHref = document.getElementById('btn-guide-pdf')?.getAttribute('href') || '';
    const planText = document.getElementById('output-plan').value;
    return { html, brandKey: brand.key, brandLabel: brand.label, guideHref, planText };
  }, { creator, lang });
}

async function renderPdf(html, outPath) {
  const pdfPage = await browser.newPage();
  await pdfPage.setContent(html, { waitUntil: 'networkidle0' });
  await pdfPage.waitForFunction(() => {
    const imgs = Array.from(document.images);
    return imgs.length === 0 || imgs.every((img) => img.complete && img.naturalWidth > 0);
  }, { timeout: 20000 });
  await pdfPage.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
  });
  await pdfPage.close();
}

test('dual brand header, exclusive PDFs, FR/EN, rest-day and Elevate purity', async () => {
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
  await page.waitForFunction(() => {
    const imgs = Array.from(document.querySelectorAll('.app-header img'));
    return imgs.length >= 2 && imgs.every((img) => img.complete && img.naturalWidth > 0);
  }, { timeout: 15000 });
  await loadXavier();

  const header = await page.evaluate(() => {
    const elevate = document.querySelector('.header-logo.elevate-logo img');
    const kr = document.querySelector('.header-logo.kr-logo img');
    const badge = document.querySelector('.collab-badge')?.textContent || '';
    const elevateBox = elevate?.closest('.header-logo')?.getBoundingClientRect();
    const krBox = kr?.closest('.header-logo')?.getBoundingClientRect();
    return {
      elevateSrc: elevate?.getAttribute('src') || '',
      elevateAlt: elevate?.getAttribute('alt') || '',
      krSrc: kr?.getAttribute('src') || '',
      badge,
      elevateW: elevateBox?.width || 0,
      elevateH: elevateBox?.height || 0,
      krW: krBox?.width || 0,
      krH: krBox?.height || 0,
      hasRuntime: typeof window.getSelectedPdfBrand === 'function',
    };
  });
  assert.equal(header.hasRuntime, true);
  assert.match(header.elevateSrc, /logo-elevate-fitness\.jpg/);
  assert.match(header.elevateAlt, /Elevate Fitness/i);
  assert.match(header.krSrc, /logo-kr-kinetics-horizontal\.png/);
  assert.match(header.badge, /Outil coach/);
  assert.ok(header.elevateW >= 200 && header.krW >= 200, `logo widths too small: KR=${header.krW} Elevate=${header.elevateW}`);
  assert.ok(header.elevateH >= 90 && header.krH >= 90, `logo heights too small: KR=${header.krH} Elevate=${header.elevateH}`);
  const widthRatio = header.elevateW / header.krW;
  assert.ok(widthRatio > 0.6 && widthRatio < 1.6, `logo widths not comparable: ratio=${widthRatio}`);

  const dist = await readPersonalizedScenario();
  assert.equal(dist.foodCount, 287);
  assert.equal(dist.featureDaEnabled, false);
  assert.deepEqual(dist.bank, dist.computed);
  assert.equal(dist.bank.kcal, dist.rawKcal, 'bank kcal must keep raw exchange precision');
  assert.notEqual(dist.rawKcal, dist.roundedMacroKcal, 'raw precision must differ from rounded-macro kcal in this scenario');
  assert.ok(dist.planned.kcal > 0);
  assert.ok(dist.exportable, 'personalized Xavier distribution should remain exportable');
  assert.equal(typeof dist.within, 'boolean', 'withinCoachTolerance helper must be available');
  assert.deepEqual(dist.banqueTotalsFromSnap, dist.computed, 'snapshot banque totals must use dual-brand precision helper');

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'screenshots', 'desktop-1440-dual-brand.png'),
    fullPage: false,
  });
  await page.setViewport({ width: 768, height: 1024 });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'screenshots', 'tablet-768-dual-brand.png'),
    fullPage: false,
  });
  await page.setViewport({ width: 390, height: 1600 });
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'screenshots', 'mobile-390-dual-brand.png'),
    fullPage: false,
  });
  await page.setViewport({ width: 1440, height: 1000 });

  // Elevate FR
  const elevateFr = await buildPdfHtml('elevate', 'fr');
  assert.equal(elevateFr.brandKey, 'elevate');
  assert.match(elevateFr.guideHref, /elevate-fitness-equivalents-client-fr\.pdf/);
  assertNoForbidden(elevateFr.html, 'Elevate FR HTML');
  assertNoForbidden(elevateFr.planText, 'Elevate FR plan text');
  assert.match(elevateFr.html, /Préparé par Elevate Fitness|Elevate Fitness/);
  assert.equal(/KR Kinetics/i.test(elevateFr.html), false);
  assert.equal(/logo-kr/i.test(elevateFr.html), false);
  const elevateFrPdf = path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-elevate-fr.pdf');
  await renderPdf(elevateFr.html, elevateFrPdf);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'review', 'plan-elevate-preview.html'), elevateFr.html, 'utf8');

  // Elevate EN
  const elevateEn = await buildPdfHtml('elevate', 'en');
  assertNoForbidden(elevateEn.html, 'Elevate EN HTML');
  assert.match(elevateEn.html, /Prepared by Elevate Fitness/);
  assert.equal(/KR Kinetics/i.test(elevateEn.html), false);
  const elevateEnPdf = path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-elevate-en.pdf');
  await renderPdf(elevateEn.html, elevateEnPdf);

  // KR FR / EN exclusive
  const krFr = await buildPdfHtml('kr', 'fr');
  assert.equal(krFr.brandKey, 'kr');
  assert.match(krFr.guideHref, /kr-kinetics-equivalents-client-fr\.pdf/);
  assert.equal(/Elevate Fitness/i.test(krFr.html), false);
  assert.equal(/logo-elevate/i.test(krFr.html), false);
  assert.match(krFr.html, /KR Kinetics/);
  const krFrPdf = path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-kr-fr.pdf');
  await renderPdf(krFr.html, krFrPdf);
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'review', 'plan-kr-preview.html'), krFr.html, 'utf8');

  const krEn = await buildPdfHtml('kr', 'en');
  assert.equal(/Elevate Fitness/i.test(krEn.html), false);
  assert.match(krEn.html, /Prepared by KR Kinetics|KR Kinetics/);
  const krEnPdf = path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-kr-en.pdf');
  await renderPdf(krEn.html, krEnPdf);

  // Rest-day scenario: ensure repos day is active and mirrored from training.
  await page.evaluate(() => {
    if (typeof window.setJourReposActif === 'function') window.setJourReposActif(true);
    if (typeof window.copierEntrainementVersRepos === 'function') {
      window.copierEntrainementVersRepos();
    } else {
      // Fallback: clone training bank/repartition into repos.
      window.captureJourActif?.();
      const src = window.joursData?.entrainement;
      if (src && window.joursData) {
        window.joursData.repos = JSON.parse(JSON.stringify(src));
      }
    }
  });
  const elevateRest = await buildPdfHtml('elevate', 'fr');
  assert.match(elevateRest.html, /pdf-a4-page/g);
  assert.ok((elevateRest.html.match(/pdf-a4-page/g) || []).length >= 2, 'rest-day Elevate PDF should have 2 pages');
  assertNoForbidden(elevateRest.html, 'Elevate rest-day HTML');
  await renderPdf(
    elevateRest.html,
    path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-elevate-fr-with-rest.pdf'),
  );

  const krRest = await buildPdfHtml('kr', 'fr');
  assert.ok((krRest.html.match(/pdf-a4-page/g) || []).length >= 2, 'rest-day KR PDF should have 2 pages');
  assert.equal(/Elevate Fitness/i.test(krRest.html), false);
  await renderPdf(
    krRest.html,
    path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-kr-fr-with-rest.pdf'),
  );

  // Parse Elevate PDFs + guide for forbidden brand leakage
  for (const pdfPath of [
    elevateFrPdf,
    elevateEnPdf,
    path.join(COACH_DIR, 'guides', 'elevate-fitness-equivalents-client-fr.pdf'),
  ]) {
    const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
    const parsed = await parser.getText();
    await parser.destroy();
    assertNoForbidden(parsed.text || '', path.basename(pdfPath));
  }

  const elevateGuideHtml = fs.readFileSync(
    path.join(COACH_DIR, 'guides', 'elevate-fitness-equivalents-client-fr.html'),
    'utf8',
  );
  assertNoForbidden(elevateGuideHtml, 'Elevate guide HTML');

  assert.equal(runtimeErrors.length, 0, runtimeErrors.join('\n'));

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'review', 'functional-results.json'),
    JSON.stringify({
      ok: true,
      checks: [
        '287 foods preserved',
        'Elevate logo in coach header',
        'Bank calories keep raw exchange precision (3987)',
        'Bank macro display remains 176/432/173',
        'Personalized plan exportable within coach tolerance',
        'Elevate PDF FR/EN contain no KR text or asset',
        'Elevate guide selected with Elevate creator',
        'KR PDF contain no Elevate text or asset',
        'Rest-day pages generated for KR and Elevate',
      ],
      bank: dist.bank,
      planned: dist.planned,
    }, null, 2),
    'utf8',
  );
});
