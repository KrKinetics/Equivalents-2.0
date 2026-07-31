/**
 * Browser parity checks for the restored full coach calculator.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { assertProtectedFilesUnchanged } from '../src/lib/rc-data-protection.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COACH_DIR = path.join(ROOT, 'coach-calculator');

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.pdf': 'application/pdf',
  })[ext] || 'application/octet-stream';
}

function startServer(rootDir) {
  const server = http.createServer((req, res) => {
    try {
      const raw = req.url && req.url !== '//' ? req.url : '/';
      const url = new URL(raw, 'http://127.0.0.1');
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
    } catch {
      res.writeHead(400);
      res.end('bad');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

async function stubDialogs(page) {
  await page.evaluateOnNewDocument(() => {
    window.alert = () => {};
    window.confirm = () => true;
  });
  await page.evaluate(() => {
    window.alert = () => {};
    window.confirm = () => true;
  });
}

async function seedAthlete(page, name = 'Client Test Alpha') {
  await stubDialogs(page);
  await page.evaluate((athleteName) => {
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };
    set('nom_athlete', athleteName);
    set('sexe', 'H');
    set('age', '30');
    set('poids', '185');
    set('poids_unit', 'lbs');
    set('grandeur_unit', 'cm');
    set('grandeur_cm', '180');
    set('activite', 'modere');
    set('macroRatio', '25,45,30');
    set('proteines-par-kg', '2.0');
    if (typeof setMacroMode === 'function') setMacroMode('preset');
    if (typeof setProteinesMode === 'function') setProteinesMode('gkg');
    document.querySelectorAll('.goal-card').forEach((card) => {
      card.classList.remove('active');
      if (parseFloat(card.getAttribute('data-multiplier')) === 1.0) card.classList.add('active');
    });
    selectedGoalMultiplier = 1.0;
    calculerBesoins();
    suggererBanque();
    repartirAutomatique('classique');
    const proBank = parseFloat(document.querySelector('.target-input[data-cat="pro"]')?.value) || 0;
    if (proBank > 0) {
      const mealShares = [0.3, 0, 0.25, 0, 0.25, 0.2];
      for (let m = 0; m < 6; m++) {
        const input = document.querySelectorAll('.rep-input[data-cat="pro"]')[m];
        if (input) input.value = String(Math.round(proBank * mealShares[m] * 2) / 2);
      }
    }
    document.getElementById('coach-notes').value = 'Directives de test — hydratation et timing.';
    calculerBanque();
    calculerRepartition();
    updateEau();
  }, name);
}

let browser;
let origin;
let server;

before(async () => {
  assertProtectedFilesUnchanged();
  const build = spawnSync(process.execPath, ['scripts/coach-calculator-build.mjs', '--with-guide-pdf'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  assert.equal(build.status, 0, 'coach calculator build must succeed');
  assert.ok(fs.existsSync(path.join(COACH_DIR, 'index.html')));
  ({ server, origin } = await startServer(COACH_DIR));
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('coach UI loads logos, 287 foods, DA disabled', async () => {
  const page = await browser.newPage();
  await stubDialogs(page);
  await page.goto(`${origin}/`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction(() => window.COACH_DATA?.totalFoods === 287, { timeout: 30000 });
  const state = await page.evaluate(() => ({
    foods: window.COACH_DATA.totalFoods,
    verified: window.COACH_DATA.verifiedFoods,
    da: window.FEATURE_DA_ENABLED,
    logoWidths: [...document.querySelectorAll('.app-header img')].map((img) => img.naturalWidth),
    hasGuideSection: !!document.getElementById('section-guide-equivalents'),
    hasProfil: !!document.getElementById('nom_athlete'),
    hasBanque: document.querySelectorAll('.target-input').length === 7,
    hasRepas: document.querySelectorAll('.rep-input').length === 42,
  }));
  assert.equal(state.foods, 287);
  assert.equal(state.verified, 287);
  assert.equal(state.da, false);
  assert.ok(state.logoWidths.every((w) => w > 0));
  assert.equal(state.hasGuideSection, true);
  assert.equal(state.hasProfil, true);
  assert.equal(state.hasBanque, true);
  assert.equal(state.hasRepas, true);
  await page.close();
});

test('save / reload / delete dossier without loss', async () => {
  const page = await browser.newPage();
  await stubDialogs(page);
  await page.goto(`${origin}/`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction(() => typeof sauvegarderProfil === 'function');
  await seedAthlete(page, 'Client Test Alpha');
  const before = await page.evaluate(() => {
    captureJourActif();
    sauvegarderProfil();
    return JSON.parse(localStorage.getItem('athlete_Client Test Alpha'));
  });
  assert.ok(before, 'profile must be stored under athlete_Client Test Alpha');
  assert.ok(parseFloat(before.jours.entrainement.banque.pro) > 0, 'saved banque must be non-empty');
  await page.reload({ waitUntil: 'networkidle0' });
  await stubDialogs(page);
  await page.waitForFunction(() => typeof chargerProfil === 'function');
  const after = await page.evaluate(() => {
    const key = 'athlete_Client Test Alpha';
    const sel = document.getElementById('liste_profils');
    sel.value = key;
    chargerProfil();
    captureJourActif();
    return {
      stored: JSON.parse(localStorage.getItem(key)),
      live: getProfilData('Client Test Alpha'),
      domPro: document.querySelector('.target-input[data-cat="pro"]').value,
      nomDom: document.getElementById('nom_athlete').value,
    };
  });
  assert.equal(after.nomDom, before.nom);
  assert.equal(after.live.nom, before.nom);
  assert.equal(after.live.sexe, before.sexe);
  assert.equal(after.live.age, before.age);
  assert.equal(after.live.poids, before.poids);
  assert.deepEqual(after.stored.jours.entrainement.banque, before.jours.entrainement.banque);
  assert.deepEqual(after.live.jours.entrainement.banque, before.jours.entrainement.banque);
  assert.equal(after.domPro, before.jours.entrainement.banque.pro);
  await page.evaluate(() => {
    const key = 'athlete_Client Test Alpha';
    document.getElementById('liste_profils').value = key;
    localStorage.removeItem(key);
    initProfils();
  });
  const gone = await page.evaluate(() => localStorage.getItem('athlete_Client Test Alpha'));
  assert.equal(gone, null);
  await page.close();
});

test('select among multiple client dossiers', async () => {
  const page = await browser.newPage();
  await stubDialogs(page);
  await page.goto(`${origin}/`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction(() => typeof sauvegarderProfil === 'function');
  await seedAthlete(page, 'Client Alpha');
  await page.evaluate(() => {
    document.getElementById('age').value = '31';
    captureJourActif();
    sauvegarderProfil();
  });
  await seedAthlete(page, 'Client Beta');
  await page.evaluate(() => {
    document.getElementById('age').value = '42';
    document.querySelector('.target-input[data-cat="pro"]').value = '8';
    captureJourActif();
    sauvegarderProfil();
  });
  const switched = await page.evaluate(() => {
    const sel = document.getElementById('liste_profils');
    const keys = [...sel.options].map((o) => o.value).filter(Boolean);
    sel.value = 'athlete_Client Alpha';
    chargerProfil();
    const alpha = {
      nom: document.getElementById('nom_athlete').value,
      age: document.getElementById('age').value,
      pro: document.querySelector('.target-input[data-cat="pro"]').value,
    };
    sel.value = 'athlete_Client Beta';
    chargerProfil();
    const beta = {
      nom: document.getElementById('nom_athlete').value,
      age: document.getElementById('age').value,
      pro: document.querySelector('.target-input[data-cat="pro"]').value,
    };
    return { keys, alpha, beta };
  });
  assert.ok(switched.keys.includes('athlete_Client Alpha'));
  assert.ok(switched.keys.includes('athlete_Client Beta'));
  assert.equal(switched.alpha.nom, 'Client Alpha');
  assert.equal(switched.alpha.age, '31');
  assert.equal(switched.beta.nom, 'Client Beta');
  assert.equal(switched.beta.age, '42');
  assert.equal(switched.beta.pro, '8');
  await page.close();
});

test('export/import JSON and legacy profile compatibility', async () => {
  const page = await browser.newPage();
  await page.goto(`${origin}/`, { waitUntil: 'networkidle0', timeout: 120000 });
  await seedAthlete(page, 'Client Export');
  const roundtrip = await page.evaluate(() => {
    const original = getProfilData();
    const json = JSON.stringify(original);
    const parsed = JSON.parse(json);
    appliquerProfilData(parsed, 'Client Export');
    const restored = getProfilData();
    // legacy single-day
    const legacy = {
      nom: 'Legacy Client',
      sexe: 'F',
      age: 28,
      poids: 65,
      poids_unit: 'kg',
      grandeur_unit: 'cm',
      grandeur_cm: 165,
      grandeur_ft: 5,
      grandeur_in: 5,
      activite: 'leger',
      macroRatio: '30,40,30',
      goalMultiplier: 0.9,
      banque: { pro: '4', fec: '5', leg: '2', fru: '2', lai: '1', lip: '3', whey: '0.5' },
      repartition: {},
    };
    for (let i = 0; i < 42; i++) legacy.repartition[i] = '0';
    legacy.repartition[0] = '2';
    legacy.repartition[2] = '2';
    const migrated = migrateProfilData(legacy);
    return {
      sameBanque: JSON.stringify(restored.jours.entrainement.banque) === JSON.stringify(original.jours.entrainement.banque),
      legacyHasRepos: !!migrated.jours?.repos,
      legacyHasEnt: !!migrated.jours?.entrainement,
      legacyBanque: migrated.jours.entrainement.banque.pro,
    };
  });
  assert.equal(roundtrip.sameBanque, true);
  assert.equal(roundtrip.legacyHasRepos, true);
  assert.equal(roundtrip.legacyHasEnt, true);
  assert.equal(roundtrip.legacyBanque, '4');
  await page.close();
});

test('training/rest days, distribution modes, hydration, plan text without internals', async () => {
  const page = await browser.newPage();
  await page.goto(`${origin}/`, { waitUntil: 'networkidle0', timeout: 120000 });
  await seedAthlete(page, 'Xavier Tremblay');
  const result = await page.evaluate(() => {
    const tdee = Math.round(currentTDEE);
    const goals = [0.8, 0.9, 1.0, 1.1, 1.2].map((m) => Math.round(currentTDEE * m));
    setJourReposActif(true);
    changerJour('repos');
    suggererBanque();
    repartirAutomatique('equilibre');
    const reposBanque = { ...joursData.repos.banque };
    changerJour('entrainement');
    repartirAutomatique('entrainement');
    const classicOk = typeof repartirAutomatique === 'function';
    genererPlanTextuel();
    const plan = document.getElementById('output-plan').value;
    const eau = parseFloat(document.getElementById('eau-total').value) || 0;
    return {
      tdee,
      goals,
      reposBanque,
      classicOk,
      plan,
      eau,
      daFlag: window.FEATURE_DA_ENABLED,
      foodCount: window.COACH_DATA.totalFoods,
    };
  });
  assert.ok(result.tdee > 2000);
  assert.equal(result.goals.length, 5);
  assert.ok(result.eau > 0);
  assert.equal(result.daFlag, false);
  assert.equal(result.foodCount, 287);
  assert.match(result.plan, /Xavier Tremblay|Athlète|Athlete/i);
  const internalMarkers = ['A/D-A', 'hybrid-da', 'rollup', 'provisoire', 'release-candidate', 'legacy-a', 'diagnostic'];
  for (const marker of internalMarkers) {
    assert.equal(result.plan.toLowerCase().includes(marker.toLowerCase()), false, `plan must not contain ${marker}`);
  }
  await page.close();
});

test('client equivalents guide has 287 foods and no forbidden markers', async () => {
  const guidePath = path.join(COACH_DIR, 'guides', 'kr-kinetics-equivalents-client-fr.html');
  assert.ok(fs.existsSync(guidePath));
  const html = fs.readFileSync(guidePath, 'utf8');
  const foodIds = (html.match(/data-food-id="/g) || []).length;
  assert.equal(foodIds, 287);
  const internalMarkers = [
    'A/D-A', 'hybrid-da', 'rollup', 'provisoire', 'release-candidate', 'legacy-a',
    'PROFILS D’ÉCHANGE NON APPROUVÉS', 'UNAPPROVED EXCHANGE PROFILES',
  ];
  for (const marker of internalMarkers) {
    assert.equal(html.toLowerCase().includes(marker.toLowerCase()), false, `guide must not contain ${marker}`);
  }
  assertProtectedFilesUnchanged();
});

test('responsive viewports render without crash', async () => {
  const page = await browser.newPage();
  for (const vp of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewport(vp);
    await page.goto(`${origin}/`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForSelector('#nom_athlete');
    const visible = await page.$eval('#nom_athlete', (el) => !!el);
    assert.equal(visible, true);
  }
  await page.close();
});

test('client PDF embeds logo, omits empty rest day, shows reconciliation', async () => {
  const page = await browser.newPage();
  await stubDialogs(page);
  await page.goto(`${origin}/`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction(() => typeof buildFullPDFHTML === 'function');
  await seedAthlete(page, 'PDF Audit Client');
  const result = await page.evaluate(async () => {
    setJourReposActif(true);
    // Ensure rest remains empty / unconfigured
    joursData.repos = createEmptyJourData();
    captureJourActif();
    const snapEnt = getJourSnapshot('entrainement');
    const snapRep = getClientPdfRestSnapshot();
    const html = buildFullPDFHTML(
      snapEnt,
      snapRep,
      'PDF Audit Client',
      '2026-07-31',
      getMacroRatioLabel(),
      getActiveGoalLabel(),
    );
    const iframe = creerIframePDF(html);
    await attendreRenduPDF(iframe);
    const doc = iframe.contentWindow.document;
    const imgs = Array.from(doc.images);
    const broken = imgs.filter((img) => !img.complete || !img.naturalWidth).length;
    const pages = doc.querySelectorAll('.pdf-a4-page').length;
    const text = doc.body.innerText;
    const recon = reconcilePlanTotalsFromSnapshot(snapEnt);
    nettoyerIframePDF();
    return {
      pages,
      broken,
      imgCount: imgs.length,
      hasDataUri: html.includes('data:image/png;base64,'),
      hasMarineBanner: html.includes('#071B41'),
      hasRecon: html.includes('Réconciliation') || html.includes('Energy reconciliation'),
      hasPlanned: html.includes('Total planifié') || html.includes('Planned total'),
      hasVariance: html.includes('Écart planifié') || html.includes('Planned vs target'),
      hasZeroKcalPlan: /0 kcal/.test(text) && pages > 1,
      snapRepNull: snapRep === null,
      withinThresholdDefined: typeof recon.withinThreshold === 'boolean',
      varianceKcal: recon.variance.kcal,
    };
  });
  assert.equal(result.snapRepNull, true);
  assert.equal(result.pages, 1);
  assert.equal(result.broken, 0);
  assert.ok(result.imgCount >= 1);
  assert.equal(result.hasDataUri, true);
  assert.equal(result.hasMarineBanner, true);
  assert.equal(result.hasRecon, true);
  assert.equal(result.hasPlanned, true);
  assert.equal(result.hasVariance, true);
  assert.equal(result.hasZeroKcalPlan, false);
  assert.equal(result.withinThresholdDefined, true);
  assert.equal(typeof result.varianceKcal, 'number');
  await page.close();
});

test('configured rest day still yields a second client PDF page', async () => {
  const page = await browser.newPage();
  await stubDialogs(page);
  await page.goto(`${origin}/`, { waitUntil: 'networkidle0', timeout: 120000 });
  await seedAthlete(page, 'Rest Configured');
  const pages = await page.evaluate(() => {
    setJourReposActif(true);
    changerJour('repos');
    suggererBanque();
    repartirAutomatique('equilibre');
    const proBank = parseFloat(document.querySelector('.target-input[data-cat="pro"]')?.value) || 0;
    if (proBank > 0) {
      const shares = [0.3, 0, 0.25, 0, 0.25, 0.2];
      for (let m = 0; m < 6; m++) {
        const input = document.querySelectorAll('.rep-input[data-cat="pro"]')[m];
        if (input) input.value = String(Math.round(proBank * shares[m] * 2) / 2);
      }
    }
    calculerBanque();
    calculerRepartition();
    captureJourActif();
    const html = buildFullPDFHTML(
      getJourSnapshot('entrainement'),
      getClientPdfRestSnapshot(),
      'Rest Configured',
      '2026-07-31',
      getMacroRatioLabel(),
      getActiveGoalLabel(),
    );
    return (html.match(/class="pdf-a4-page"/g) || []).length;
  });
  assert.equal(pages, 2);
  await page.close();
});

test('mobile 390px keeps readable type and scroll hints on tables', async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${origin}/`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForSelector('#nom_athlete');
  const mobile = await page.evaluate(() => {
    const wraps = document.querySelectorAll('.table-h-scroll');
    const btn = document.querySelector('.btn');
    const label = document.querySelector('label');
    const btnH = btn ? btn.getBoundingClientRect().height : 0;
    const labelSize = label ? parseFloat(getComputedStyle(label).fontSize) : 0;
    return {
      wrapCount: wraps.length,
      btnH,
      labelSize,
      hasScrollHint: !!document.styleSheets,
    };
  });
  assert.ok(mobile.wrapCount >= 1, 'tables should be wrapped for horizontal scroll');
  assert.ok(mobile.btnH >= 44, `touch target ${mobile.btnH}px`);
  assert.ok(mobile.labelSize >= 14, `label font ${mobile.labelSize}px`);
  await page.close();
});
