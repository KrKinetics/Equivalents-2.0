/**
 * Dual-brand browser QA: exclusive KR / Elevate PDF + guide selection,
 * real rest-day 2-page plans, English notes, professional UI labels.
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
const NOTE_FR = 'Hydratation prioritaire. Prioriser protéines maigres et féculents autour de l’entraînement.';
const NOTE_EN = 'Prioritize hydration. Emphasize lean proteins and starches around training sessions.';
const NOTE_REST_FR = 'Prioriser l’hydratation, la récupération et une répartition régulière des protéines au cours de la journée.';
const NOTE_REST_EN = 'Prioritize hydration, recovery, and an even distribution of protein throughout the day.';
const FORBIDDEN_FR_IN_EN = 'Hydratation prioritaire. Prioriser protéines maigres et féculents autour de l’entraînement.';
const REST_PRO_SHARES = [2, 1, 2.5, 1, 2.5, 1, 1];

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

function countPdfPages(html) {
  return (html.match(/<div class="pdf-a4-page\b/g) || []).length;
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

async function ensureTrainingExportable() {
  return page.evaluate(() => {
    if (typeof window.setJourReposActif === 'function') window.setJourReposActif(false);
    window.changerJour?.('entrainement');
    window.calculerBanque?.();
    window.calculerRepartition?.();
    window.captureJourActif?.();
    const evalEnt = window.evaluerJourData('entrainement');
    return {
      canExport: evalEnt.canExport,
      errors: evalEnt.errors,
      remainingZero: !evalEnt.errors.some((e) => /Répartition incomplète/i.test(e)),
    };
  });
}

async function configureRealRestDay() {
  return page.evaluate((proShares) => {
    window.changerJour('entrainement');
    window.captureJourActif();
    window.setJourReposActif(true);
    window.changerJour('repos');
    window.suggererBanque();
    window.repartirAutomatique('equilibre');
    window.calculerBanque();
    window.calculerRepartition();

    // Demo-only realistic protein spread for owner-review rest day (not a clinical default).
    const proInputs = Array.from(document.querySelectorAll('.rep-input[data-cat="pro"]'));
    proShares.forEach((value, idx) => {
      if (proInputs[idx]) proInputs[idx].value = String(value);
    });

    const otherCats = ['fec', 'leg', 'fru', 'lai', 'lip', 'whey'];
    // Keep non-protein portions near auto distribution; only clear leftover remainder.
    otherCats.forEach((cat) => {
      const cible = parseFloat(document.querySelector(`.target-input[data-cat="${cat}"]`)?.value) || 0;
      const inputs = Array.from(document.querySelectorAll(`.rep-input[data-cat="${cat}"]`));
      let sum = inputs.reduce((acc, el) => acc + (parseFloat(el.value) || 0), 0);
      const restant = Math.round((cible - sum) * 10) / 10;
      if (restant === 0 || !inputs.length) return;
      const target = inputs.find((el) => (parseFloat(el.value) || 0) > 0) || inputs[0];
      target.value = String(Math.round(((parseFloat(target.value) || 0) + restant) * 10) / 10);
    });
    window.calculerBanque();
    window.calculerRepartition();
    window.captureJourActif();

    const cats = ['pro', ...otherCats];
    const remaining = [];
    const proValues = [];
    cats.forEach((cat) => {
      const cible = parseFloat(document.querySelector(`.target-input[data-cat="${cat}"]`)?.value) || 0;
      const values = Array.from(document.querySelectorAll(`.rep-input[data-cat="${cat}"]`))
        .map((el) => parseFloat(el.value) || 0);
      if (cat === 'pro') proValues.push(...values);
      const sum = values.reduce((acc, v) => acc + v, 0);
      const restant = Math.round((cible - sum) * 10) / 10;
      if (cible > 0 && restant !== 0) remaining.push({ cat, restant, cible, sum });
    });

    const restEval = window.evaluerJourData('repos');
    const training = window.getJourSnapshot('entrainement');
    const rest = window.getClientPdfRestSnapshot();
    return {
      remaining,
      proValues,
      proTarget: parseFloat(document.querySelector('.target-input[data-cat="pro"]')?.value) || 0,
      restConfigured: !!rest,
      restCanExport: restEval.canExport,
      restErrors: restEval.errors,
      restLabel: rest?.jourLabel || '',
      trainingTargets: training?.targets,
      restTargets: rest?.targets,
      trainingPlanned: {
        pro: training?.totalPro, glu: training?.totalGlu, lip: training?.totalLip, kcal: training?.totalKcal,
      },
      restPlanned: {
        pro: rest?.totalPro, glu: rest?.totalGlu, lip: rest?.totalLip, kcal: rest?.totalKcal,
      },
    };
  }, REST_PRO_SHARES);
}

async function buildPdfHtml(creator, lang, notes) {
  return page.evaluate(async ({ creator, lang, notes }) => {
    const notesEl = document.getElementById('coach-notes');
    if (notesEl) notesEl.value = notes;
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
    const guideText = document.getElementById('btn-guide-pdf')?.textContent || '';
    const planText = document.getElementById('output-plan').value;
    return {
      html,
      brandKey: brand.key,
      brandLabel: brand.label,
      guideHref,
      guideText,
      planText,
      pages: (html.match(/<div class="pdf-a4-page\b/g) || []).length,
      hasRestSnapshot: !!rest,
      trainingLabel: training?.jourLabel || '',
      restLabel: rest?.jourLabel || '',
      trainingTargets: training?.targets || null,
      restTargets: rest?.targets || null,
      trainingPlannedKcal: training?.totalKcal || 0,
      restPlannedKcal: rest?.totalKcal || 0,
    };
  }, { creator, lang, notes });
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

async function pdfText(pdfPath) {
  const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
  const parsed = await parser.getText();
  await parser.destroy();
  return parsed.text || '';
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

  const ui = await page.evaluate(() => {
    const h1 = document.querySelector('.header-title-container h1')?.textContent || '';
    const macroText = Array.from(document.querySelectorAll('#macroRatio option')).map((o) => o.textContent.trim());
    const macroHint = document.querySelector('.macro-hint')?.textContent || '';
    const calorieTitle = document.querySelector('#cible-kcal')?.closest('.dash-card, div')?.querySelector('.dash-title')?.textContent
      || Array.from(document.querySelectorAll('.dash-title')).find((el) => /Cible/i.test(el.textContent || ''))?.textContent
      || '';
    const hydrationLabel = Array.from(document.querySelectorAll('label')).find((el) => /liquides|Hydratation/i.test(el.textContent || ''))?.textContent || '';
    const hydrationDetail = Array.from(document.querySelectorAll('div')).find((el) => /Repère initial|Règle : 1 L/i.test(el.textContent || ''))?.textContent || '';
    const creatorHint = document.querySelector('.pdf-creator-picker .pdf-creator-hint')?.textContent || '';
    const notesHint = document.getElementById('coach-notes-lang-hint')?.textContent || '';
    const elevate = document.querySelector('.header-logo.elevate-logo img');
    const kr = document.querySelector('.header-logo.kr-logo img');
    const elevateBox = elevate?.closest('.header-logo')?.getBoundingClientRect();
    const krBox = kr?.closest('.header-logo')?.getBoundingClientRect();
    return {
      h1,
      macroText,
      macroHint,
      calorieTitle,
      hydrationLabel,
      hydrationDetail,
      creatorHint,
      notesHint,
      elevateSrc: elevate?.getAttribute('src') || '',
      elevateAlt: elevate?.getAttribute('alt') || '',
      krSrc: kr?.getAttribute('src') || '',
      elevateW: elevateBox?.width || 0,
      elevateH: elevateBox?.height || 0,
      krW: krBox?.width || 0,
      krH: krBox?.height || 0,
      hasRuntime: typeof window.getSelectedPdfBrand === 'function',
      foodCount: window.COACH_DATA?.totalFoods,
      featureDaEnabled: window.COACH_DATA?.featureDaEnabled,
    };
  });

  assert.equal(ui.hasRuntime, true);
  assert.equal(ui.foodCount, 287);
  assert.equal(ui.featureDaEnabled, false);
  assert.match(ui.h1, /ÉVALUATION DES HABITUDES & PLANIFICATION ALIMENTAIRE/);
  assert.ok(ui.macroText.some((t) => /restant 57 % G \/ 43 % L/.test(t)));
  assert.ok(ui.macroText.some((t) => /Maintien — restant 60 % G \/ 40 % L/.test(t)));
  assert.equal(ui.macroText.some((t) => /25P\s*\|\s*45G/.test(t)), false, 'misleading P/G/L ratios must be removed');
  assert.match(ui.macroHint, /protéines sont fixées d'abord en section 2/i);
  assert.match(ui.calorieTitle, /Cible alimentaire après arrondi des macros/);
  assert.match(ui.hydrationLabel, /Cible initiale de liquides — repère automatique/);
  assert.match(ui.hydrationDetail, /Repère initial : 1 L \/ 1000 kcal/);
  assert.match(ui.hydrationDetail, /individualiser selon la sudation/i);
  assert.match(ui.creatorHint, /exclusivement la marque choisie/);
  assert.match(ui.notesHint, /notes sont reproduites telles quelles/);
  assert.match(ui.elevateSrc, /logo-elevate-fitness\.jpg/);
  assert.match(ui.elevateAlt, /Elevate Fitness/i);
  assert.match(ui.krSrc, /logo-kr-kinetics-horizontal\.png/);
  assert.ok(ui.elevateW >= 200 && ui.krW >= 200, `logo widths too small: KR=${ui.krW} Elevate=${ui.elevateW}`);
  assert.ok(ui.elevateH >= 90 && ui.krH >= 90, `logo heights too small: KR=${ui.krH} Elevate=${ui.elevateH}`);

  const trainingReady = await ensureTrainingExportable();
  assert.equal(trainingReady.canExport, true, `training not exportable: ${trainingReady.errors?.join('; ')}`);
  assert.equal(trainingReady.remainingZero, true);

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

  const scenariosNoRest = [
    { creator: 'kr', lang: 'fr', notes: NOTE_FR, file: 'xavier-plan-kr-fr.pdf' },
    { creator: 'kr', lang: 'en', notes: NOTE_EN, file: 'xavier-plan-kr-en.pdf' },
    { creator: 'elevate', lang: 'fr', notes: NOTE_FR, file: 'xavier-plan-elevate-fr.pdf' },
    { creator: 'elevate', lang: 'en', notes: NOTE_EN, file: 'xavier-plan-elevate-en.pdf' },
  ];

  const noRestHtml = {};
  for (const scenario of scenariosNoRest) {
    const built = await buildPdfHtml(scenario.creator, scenario.lang, scenario.notes);
    assert.equal(built.pages, 1, `${scenario.file} must be 1 page without rest`);
    assert.equal(built.hasRestSnapshot, false);
    assert.match(built.guideText, new RegExp(built.brandLabel));
    if (scenario.creator === 'elevate') {
      assertNoForbidden(built.html, scenario.file);
      assert.equal(/KR Kinetics/i.test(built.html), false);
      assert.equal(/logo-kr/i.test(built.html), false);
      assert.match(built.guideHref, /elevate-fitness-equivalents-client-fr\.pdf/);
    } else {
      assert.equal(/Elevate Fitness/i.test(built.html), false);
      assert.equal(/logo-elevate/i.test(built.html), false);
      assert.match(built.guideHref, /kr-kinetics-equivalents-client-fr\.pdf/);
    }
    if (scenario.lang === 'en') {
      assert.equal(built.html.includes(FORBIDDEN_FR_IN_EN), false, `${scenario.file} must not contain French demo note`);
      assert.match(built.html, /Prioritize hydration|lean proteins and starches/i);
      assert.match(built.html, /Rest Day|Training Day|Prepared by/);
    } else {
      assert.match(built.html, /Jour Entraînement|Hydratation prioritaire/);
    }
    const out = path.join(ARTIFACT_DIR, 'generated-pdfs', scenario.file);
    await renderPdf(built.html, out);
    noRestHtml[scenario.file] = built.html;
    if (scenario.file.includes('elevate-fr.pdf')) {
      fs.writeFileSync(path.join(ARTIFACT_DIR, 'review', 'plan-elevate-preview.html'), built.html, 'utf8');
    }
    if (scenario.file.includes('kr-fr.pdf')) {
      fs.writeFileSync(path.join(ARTIFACT_DIR, 'review', 'plan-kr-preview.html'), built.html, 'utf8');
    }
  }

  const restSetup = await configureRealRestDay();
  assert.deepEqual(restSetup.remaining, [], `rest remaining must be zero: ${JSON.stringify(restSetup.remaining)}`);
  assert.equal(restSetup.proTarget, 11, 'demo rest protein bank should remain 11 portions');
  assert.deepEqual(restSetup.proValues, REST_PRO_SHARES, 'demo rest protein must be spread across meals');
  assert.equal(restSetup.restConfigured, true, `rest not configured: ${restSetup.restErrors?.join('; ')}`);
  assert.equal(restSetup.restCanExport, true, `rest not exportable: ${restSetup.restErrors?.join('; ')}`);
  assert.match(restSetup.restLabel, /Jour Repos \(cyclage des glucides\)|Rest Day/i);
  assert.equal(/Carb Cycling/i.test(restSetup.restLabel), false, 'French rest label must not keep English Carb Cycling');
  assert.notDeepEqual(restSetup.trainingTargets, restSetup.restTargets, 'rest day targets must differ from training (carb cycling)');
  assert.notEqual(restSetup.trainingPlanned.kcal, restSetup.restPlanned.kcal, 'rest planned kcal must differ from training');

  const scenariosWithRest = [
    { creator: 'kr', lang: 'fr', notes: NOTE_REST_FR, file: 'xavier-plan-kr-fr-with-rest.pdf', noRestFile: 'xavier-plan-kr-fr.pdf' },
    { creator: 'kr', lang: 'en', notes: NOTE_REST_EN, file: 'xavier-plan-kr-en-with-rest.pdf', noRestFile: 'xavier-plan-kr-en.pdf' },
    { creator: 'elevate', lang: 'fr', notes: NOTE_REST_FR, file: 'xavier-plan-elevate-fr-with-rest.pdf', noRestFile: 'xavier-plan-elevate-fr.pdf' },
    { creator: 'elevate', lang: 'en', notes: NOTE_REST_EN, file: 'xavier-plan-elevate-en-with-rest.pdf', noRestFile: 'xavier-plan-elevate-en.pdf' },
  ];

  for (const scenario of scenariosWithRest) {
    const built = await buildPdfHtml(scenario.creator, scenario.lang, scenario.notes);
    assert.equal(built.pages, 2, `${scenario.file} must have exactly 2 pages`);
    assert.equal(built.hasRestSnapshot, true);
    assert.ok(countPdfPages(built.html) === 2);
    if (scenario.lang === 'fr') {
      assert.match(built.html, /Jour Entraînement/);
      assert.match(built.html, /Jour Repos \(cyclage des glucides\)/);
      assert.equal(/Carb Cycling/i.test(built.html), false, `${scenario.file} must use French carb-cycling wording`);
      assert.match(built.html, /répartition régulière des protéines/);
      assert.equal(/autour de l’entraînement|autour de l'entraînement/i.test(built.html), false);
    } else {
      assert.match(built.html, /Training Day|Jour Entraînement/i);
      assert.match(built.html, /Rest Day/);
      assert.equal(built.html.includes(FORBIDDEN_FR_IN_EN), false, `${scenario.file} must not contain French demo note`);
      assert.match(built.html, /even distribution of protein throughout the day/i);
      assert.equal(/autour de l’entraînement|féculents autour/i.test(built.html), false);
    }
    assert.notEqual(built.html, noRestHtml[scenario.noRestFile], `${scenario.file} must differ from no-rest HTML`);
    assert.ok(
      built.restTargets
      && (
        built.restTargets.glu !== built.trainingTargets.glu
        || built.restTargets.lip !== built.trainingTargets.lip
        || built.restPlannedKcal !== built.trainingPlannedKcal
      ),
      `${scenario.file} rest page must carry its own targets/macros`,
    );
    if (scenario.creator === 'elevate') {
      assertNoForbidden(built.html, scenario.file);
    } else {
      assert.equal(/Elevate Fitness/i.test(built.html), false);
    }
    await renderPdf(built.html, path.join(ARTIFACT_DIR, 'generated-pdfs', scenario.file));
  }

  for (const pdfPath of [
    path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-elevate-fr.pdf'),
    path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-elevate-en.pdf'),
    path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-elevate-fr-with-rest.pdf'),
    path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-elevate-en-with-rest.pdf'),
    path.join(COACH_DIR, 'guides', 'elevate-fitness-equivalents-client-fr.pdf'),
  ]) {
    const text = await pdfText(pdfPath);
    assertNoForbidden(text, path.basename(pdfPath));
  }

  for (const pdfPath of [
    path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-kr-en.pdf'),
    path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-elevate-en.pdf'),
  ]) {
    const text = await pdfText(pdfPath);
    assert.equal(text.includes(FORBIDDEN_FR_IN_EN), false, `${path.basename(pdfPath)} parsed text still has French note`);
    assert.match(text, /Prioritize hydration|lean proteins and starches/i);
  }

  for (const pdfPath of [
    path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-kr-en-with-rest.pdf'),
    path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-elevate-en-with-rest.pdf'),
  ]) {
    const text = await pdfText(pdfPath);
    assert.equal(text.includes(FORBIDDEN_FR_IN_EN), false, `${path.basename(pdfPath)} parsed text still has French note`);
    assert.match(text, /Rest Day/);
    assert.match(text, /even distribution of protein throughout the day/i);
    assert.equal(/autour de l’entraînement|féculents autour/i.test(text), false);
  }

  for (const pdfPath of [
    path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-kr-fr-with-rest.pdf'),
    path.join(ARTIFACT_DIR, 'generated-pdfs', 'xavier-plan-elevate-fr-with-rest.pdf'),
  ]) {
    const text = await pdfText(pdfPath);
    assert.match(text, /Jour Entraînement/);
    assert.match(text, /Jour Repos \(cyclage des glucides\)/);
    assert.equal(/Carb Cycling/i.test(text), false);
    assert.match(text, /répartition régulière des protéines/);
    const noRestName = path.basename(pdfPath).replace('-with-rest', '');
    const noRestText = await pdfText(path.join(ARTIFACT_DIR, 'generated-pdfs', noRestName));
    assert.notEqual(text, noRestText, `${path.basename(pdfPath)} must not be identical to no-rest PDF text`);
  }

  const elevateGuideHtml = fs.readFileSync(
    path.join(COACH_DIR, 'guides', 'elevate-fitness-equivalents-client-fr.html'),
    'utf8',
  );
  assertNoForbidden(elevateGuideHtml, 'Elevate guide HTML');

  assert.equal(runtimeErrors.length, 0, runtimeErrors.join('\n'));

  const generated = fs.readdirSync(path.join(ARTIFACT_DIR, 'generated-pdfs')).sort();
  assert.deepEqual(generated, [
    'xavier-plan-elevate-en-with-rest.pdf',
    'xavier-plan-elevate-en.pdf',
    'xavier-plan-elevate-fr-with-rest.pdf',
    'xavier-plan-elevate-fr.pdf',
    'xavier-plan-kr-en-with-rest.pdf',
    'xavier-plan-kr-en.pdf',
    'xavier-plan-kr-fr-with-rest.pdf',
    'xavier-plan-kr-fr.pdf',
  ]);

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'review', 'functional-results.json'),
    JSON.stringify({
      ok: true,
      checks: [
        '287 foods preserved; Mode A; D/A disabled',
        'Professional UI labels restored (title, macros remaining G/L, calorie/hydration, brand hint, notes hint)',
        '8 PDF scenarios generated (KR/Elevate × FR/EN × with/without rest)',
        'Rest-day PDFs have 2 pages with Jour Repos / Rest Day and distinct targets',
        'English demo PDFs use English notes (no French hydration phrase)',
        'Elevate PDFs/guides contain no KR Kinetics / logo-kr / projet conjoint',
      ],
      restSetup: {
        remaining: restSetup.remaining,
        trainingTargets: restSetup.trainingTargets,
        restTargets: restSetup.restTargets,
        trainingPlanned: restSetup.trainingPlanned,
        restPlanned: restSetup.restPlanned,
      },
      pdfs: generated,
    }, null, 2),
    'utf8',
  );
});
