/**
 * Browser coverage for the seventh meal (Repas de soirée / Evening Meal).
 *
 * Requirements covered:
 *  A/B  seven-meal order FR + EN
 *  C/D  training day + rest day
 *  E    save & reload of a new seven-meal plan
 *  F    opening a legacy six-meal plan
 *  G    migration of old "Collation Soirée" -> "Collation"
 *  H    "Repas de soirée" initialised to zero for legacy plans
 *  I    portions placed in "Repas de soirée" participate in totals
 *  J    totals strictly identical before/after save & reload
 *  K    exact remaining-to-place counter across seven meals
 *  L/M  KR & Elevate PDFs, FR + EN
 *  N    PDF with rest day (two pages, seven meals each)
 *  O    no brand mixing
 *  P    macro percentages total 100%
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { SCENARIO_NOTE_FR, SCENARIO_NOTE_EN, scenarioNoteForLang } from '../scripts/seventh-meal-scenario-notes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COACH_DIR = path.join(ROOT, 'coach-calculator');

const ORDER_FR = ['Déjeuner', 'Collation AM', 'Dîner', 'Collation PM', 'Souper', 'Collation', 'Repas de soirée'];
const ORDER_EN = ['Breakfast', 'AM Snack', 'Lunch', 'PM Snack', 'Dinner', 'Snack', 'Evening Meal'];
const CATS = ['pro', 'fec', 'leg', 'fru', 'lai', 'lip', 'whey'];

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
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
      res.writeHead(404); res.end('not found'); return;
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

let browser;
let server;
let origin;

before(async () => {
  const build = spawnSync(process.execPath, ['scripts/coach-calculator-build.mjs'], { cwd: ROOT, stdio: 'inherit' });
  assert.equal(build.status, 0, 'coach calculator build must succeed');
  ({ server, origin } = await startServer(COACH_DIR));
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

async function freshPage() {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { window.alert = () => {}; window.confirm = () => true; });
  await page.goto(`${origin}/`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction(() => window.COACH_DATA?.totalFoods === 287 && typeof getJourSnapshot === 'function', { timeout: 30000 });
  return page;
}

/** Fill a profile and fully distribute the bank across all seven meals for `jour`. */
async function seedSevenMealPlan(page, name, jour = 'entrainement') {
  await page.evaluate(({ athleteName, jourKey }) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('nom_athlete', athleteName);
    set('sexe', 'H'); set('age', '30');
    set('poids', '185'); set('poids_unit', 'lbs');
    set('grandeur_unit', 'cm'); set('grandeur_cm', '180');
    set('activite', 'modere'); set('macroRatio', '25,45,30'); set('proteines-par-kg', '2.0');
    if (typeof setMacroMode === 'function') setMacroMode('preset');
    if (typeof setProteinesMode === 'function') setProteinesMode('gkg');
    document.querySelectorAll('.goal-card').forEach((c) => {
      c.classList.remove('active');
      if (parseFloat(c.getAttribute('data-multiplier')) === 1.0) c.classList.add('active');
    });
    selectedGoalMultiplier = 1.0;
    calculerBesoins();
    if (jourKey === 'repos') { setJourReposActif(true); changerJour('repos'); }
    suggererBanque();
    repartirAutomatique('equilibre'); // spreads every non-protein category over 7 meals

    // Distribute the whole protein bank across all 7 meals (incl. the evening meal).
    const proCible = parseFloat(document.querySelector('.target-input[data-cat="pro"]').value) || 0;
    const proInputs = Array.from(document.querySelectorAll('.rep-input[data-cat="pro"]'));
    const base = Math.floor((proCible / proInputs.length) * 2) / 2;
    let remaining = proCible;
    proInputs.forEach((inp) => { inp.value = String(base); remaining = Math.round((remaining - base) * 10) / 10; });
    let i = 0;
    while (remaining >= 0.5 && i < 100) {
      const inp = proInputs[i % proInputs.length];
      inp.value = String((parseFloat(inp.value) || 0) + 0.5);
      remaining = Math.round((remaining - 0.5) * 10) / 10;
      i += 1;
    }
    document.getElementById('coach-notes').value = 'Directives de test — sept repas incluant le repas de soirée.';
    calculerBanque();
    calculerRepartition();
    updateEau();
    captureJourActif();
  }, { athleteName: name, jourKey: jour });
}

function repIndex(mealIdx, cat) { return mealIdx * CATS.length + CATS.indexOf(cat); }

test('A — seven meals render in canonical French order', async () => {
  const page = await freshPage();
  const clean = (s) => s.replace(/[^\p{L} ]/gu, '').replace(/\s+/g, ' ').trim();
  const labels = await page.$$eval('#repartition-tbody .meal-label', (tds) => tds.map((td) => {
    const clone = td.cloneNode(true);
    clone.querySelectorAll('.meal-tag').forEach((s) => s.remove());
    return clone.textContent;
  }));
  assert.deepEqual(labels.map(clean), ORDER_FR);
  const recap = await page.$$eval('#recap-tbody td.left', (tds) => tds.map((td) => td.textContent));
  assert.deepEqual(recap.map(clean), ORDER_FR);
  await page.close();
});

test('B — English meal order exposes Snack + Evening Meal', async () => {
  const page = await freshPage();
  const en = await page.evaluate(() => MEAL_LABELS_EN);
  assert.deepEqual(en, ORDER_EN);
  await page.close();
});

test('C/D/P — training and rest days both total seven meals with 100% macros', async () => {
  for (const jour of ['entrainement', 'repos']) {
    const page = await freshPage();
    await seedSevenMealPlan(page, `Seven ${jour}`, jour);
    const res = await page.evaluate((jourKey) => {
      const snap = getJourSnapshot(jourKey);
      // recap row 6 (evening meal) must carry real numbers, not the em-dash.
      const eveningKcal = document.getElementById('recap-kcal-6').textContent;
      return {
        eveningKcal,
        totalKcal: snap.totalKcal,
        pctSum: (parseInt(snap.pctPro, 10) || 0) + (parseInt(snap.pctGlu, 10) || 0) + (parseInt(snap.pctLip, 10) || 0),
      };
    }, jour);
    assert.notEqual(res.eveningKcal.trim(), '—', `${jour}: evening meal must be counted in the recap`);
    assert.ok(res.totalKcal > 0, `${jour}: seven-meal total must be positive`);
    assert.equal(res.pctSum, 100, `${jour}: macro percentages must total 100%`);
    await page.close();
  }
});

test('E/J — save, reload and load keep evening-meal portions and totals identical', async () => {
  const page = await freshPage();
  await seedSevenMealPlan(page, 'Seven Save');
  const before = await page.evaluate(() => {
    sauvegarderProfil();
    const snap = getJourSnapshot('entrainement');
    const eveningInputs = Array.from(document.querySelectorAll('#repartition-tbody tr:last-child .rep-input')).map((i) => i.value);
    return { totals: { pro: snap.totalPro, glu: snap.totalGlu, lip: snap.totalLip, kcal: snap.totalKcal }, eveningInputs };
  });
  assert.ok(before.eveningInputs.some((v) => parseFloat(v) > 0), 'evening meal must contain portions before save');

  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => typeof chargerProfil === 'function');
  const afterReload = await page.evaluate(() => {
    const sel = document.getElementById('liste_profils');
    sel.value = 'athlete_Seven Save';
    chargerProfil();
    captureJourActif();
    const snap = getJourSnapshot('entrainement');
    const eveningInputs = Array.from(document.querySelectorAll('#repartition-tbody tr:last-child .rep-input')).map((i) => i.value);
    return { totals: { pro: snap.totalPro, glu: snap.totalGlu, lip: snap.totalLip, kcal: snap.totalKcal }, eveningInputs };
  });
  assert.deepEqual(afterReload.totals, before.totals, 'totals must be identical before/after save+reload');
  assert.deepEqual(afterReload.eveningInputs, before.eveningInputs, 'evening-meal portions must survive save+reload');
  await page.close();
});

test('F/G/H — legacy six-meal plan opens, migrates evening snack, zero-inits evening meal', async () => {
  const page = await freshPage();
  const result = await page.evaluate(({ cats }) => {
    const rIndex = (m, c) => m * cats.length + cats.indexOf(c);
    const repartition = {};
    for (let i = 0; i < 6 * cats.length; i += 1) repartition[i] = '0';
    repartition[rIndex(0, 'fec')] = '2';
    repartition[rIndex(4, 'pro')] = '3';
    // old "Collation Soirée" = meal index 5
    repartition[rIndex(5, 'lai')] = '2';
    repartition[rIndex(5, 'whey')] = '1';
    const legacy = {
      nom: 'Legacy Six', sexe: 'H', age: '34', poids: '80', poids_unit: 'kg',
      grandeur_unit: 'cm', grandeur_cm: '178', activite: 'modere',
      macroRatio: '25,45,30', goalMultiplier: 1,
      banque: { pro: '3', fec: '2', leg: '0', fru: '0', lai: '2', lip: '0', whey: '1' },
      repartition,
    };
    let threw = false;
    try { appliquerProfilData(legacy, 'Legacy Six'); } catch (e) { threw = true; }
    const rows = document.querySelectorAll('#repartition-tbody tr');
    const collationLabel = rows[5].querySelector('.meal-label').textContent.replace(/[^\p{L} ]/gu, '').trim();
    const eveningLabel = rows[6].querySelector('.meal-label').textContent.replace(/[^\p{L} ]/gu, '').trim();
    const collationVals = Array.from(rows[5].querySelectorAll('.rep-input')).map((i) => i.value);
    const eveningVals = Array.from(rows[6].querySelectorAll('.rep-input')).map((i) => i.value);
    return { threw, collationLabel, eveningLabel, collationVals, eveningVals };
  }, { cats: CATS });

  assert.equal(result.threw, false, 'legacy plan must open without error');
  assert.equal(result.collationLabel, 'Collation', 'meal 6 must be renamed Collation');
  assert.equal(result.eveningLabel, 'Repas de soirée', 'meal 7 must be Repas de soirée');
  // migrated old evening snack (lai=2, whey=1) preserved on the Collation row
  assert.equal(result.collationVals[CATS.indexOf('lai')], '2');
  assert.equal(result.collationVals[CATS.indexOf('whey')], '1');
  // new evening meal fully zero-initialised
  assert.ok(result.eveningVals.every((v) => parseFloat(v) === 0), 'evening meal must be zero for legacy plans');
  await page.close();
});

test('I/K — evening-meal portions reduce the remaining counter exactly', async () => {
  const page = await freshPage();
  const res = await page.evaluate(({ cats }) => {
    const rIndex = (m, c) => m * cats.length + cats.indexOf(c);
    // Simple, fully-manual bank: 2 protein portions only.
    document.querySelector('.target-input[data-cat="pro"]').value = '2';
    ['fec', 'leg', 'fru', 'lai', 'lip', 'whey'].forEach((c) => {
      document.querySelector(`.target-input[data-cat="${c}"]`).value = '0';
    });
    document.querySelectorAll('.rep-input').forEach((i) => { i.value = '0'; });
    // place 1 protein in Déjeuner, 1 in Repas de soirée
    document.querySelectorAll('.rep-input')[rIndex(0, 'pro')].value = '1';
    const beforeEvening = (() => {
      calculerRepartition();
      return document.getElementById('rest-pro').textContent;
    })();
    document.querySelectorAll('.rep-input')[rIndex(6, 'pro')].value = '1';
    calculerRepartition();
    const afterEvening = document.getElementById('rest-pro').textContent;
    const distributed = document.getElementById('dist-pro').textContent;
    return { beforeEvening, afterEvening, distributed };
  }, { cats: CATS });
  assert.equal(res.beforeEvening.trim(), '1', 'one protein still to place before using the evening meal');
  assert.equal(res.afterEvening.trim(), '0', 'evening-meal portion must clear the remaining counter');
  assert.equal(res.distributed.trim(), '2', 'evening-meal portion must be counted in the distributed total');
  await page.close();
});

async function buildPdfInfo(page, creator, lang) {
  return page.evaluate(async ({ brand, language }) => {
    choisirPdfCreator(brand);
    choisirPdfLang(language);
    const snapEnt = getJourSnapshot('entrainement');
    const snapRep = getClientPdfRestSnapshot();
    const html = buildFullPDFHTML(snapEnt, snapRep, 'Xavier Sept', '2026-08-01', getMacroRatioLabel(), getActiveGoalLabel());
    const iframe = creerIframePDF(html);
    await attendreRenduPDF(iframe);
    const doc = iframe.contentWindow.document;
    const text = doc.body.innerText;
    const pages = doc.querySelectorAll('.pdf-a4-page');
    // horizontal overflow check
    let overflow = 0;
    for (const pageEl of pages) {
      const right = pageEl.getBoundingClientRect().right;
      for (const el of pageEl.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.right - right > 1) overflow += 1;
      }
    }
    nettoyerIframePDF();
    return { text, html, pageCount: pages.length };
  }, { brand: creator, language: lang });
}

test('L/M/N/O — KR & Elevate PDFs, FR + EN, rest day, seven meals, no brand mixing', async () => {
  const page = await freshPage();
  await seedSevenMealPlan(page, 'Xavier Sept', 'entrainement');
  await seedSevenMealPlan(page, 'Xavier Sept', 'repos');
  await page.evaluate(() => { changerJour('entrainement'); captureJourActif(); });

  for (const creator of ['kr', 'elevate']) {
    for (const lang of ['fr', 'en']) {
      const info = await buildPdfInfo(page, creator, lang);
      const labels = lang === 'en' ? ORDER_EN : ORDER_FR;
      for (const label of labels) {
        assert.ok(info.text.includes(label), `${creator}/${lang} PDF must contain meal "${label}"`);
      }
      assert.equal(info.pageCount, 2, `${creator}/${lang}: rest day must yield a 2-page PDF`);
      // brand purity
      if (creator === 'kr') {
        assert.equal(/Elevate Fitness/i.test(info.text), false, 'KR PDF must not mention Elevate');
        assert.equal(/logo-elevate/i.test(info.html), false, 'KR PDF must not embed Elevate assets');
      } else {
        assert.equal(/KR Kinetics/i.test(info.text), false, 'Elevate PDF must not mention KR Kinetics');
        assert.equal(/logo-kr/i.test(info.html), false, 'Elevate PDF must not embed KR assets');
      }
      if (lang === 'en') {
        assert.equal(info.text.includes('Repas de soirée'), false, 'EN PDF must not leak the French label');
      }
    }
  }
  await page.close();
});

test('OWNER REVIEW demo notes are neutral, language-matched, and never claim a rest day', async () => {
  const page = await freshPage();
  await seedSevenMealPlan(page, 'Xavier Notes', 'entrainement');
  await seedSevenMealPlan(page, 'Xavier Notes', 'repos');
  await page.evaluate(() => { changerJour('entrainement'); captureJourActif(); });

  // French terms that must never appear in an English demo PDF.
  const FR_FORBIDDEN_IN_EN = ['jour repos', 'hydratation', 'récupération', 'protéines réparties'];

  for (const creator of ['kr', 'elevate']) {
    for (const lang of ['fr', 'en']) {
      for (const rest of [false, true]) {
        const note = scenarioNoteForLang(lang);
        const info = await page.evaluate(async ({ brand, language, withRest, noteText }) => {
          setJourReposActif(withRest);
          changerJour('entrainement');
          captureJourActif();
          choisirPdfCreator(brand);
          choisirPdfLang(language);
          document.getElementById('coach-notes').value = noteText;
          const snapEnt = getJourSnapshot('entrainement');
          const snapRep = getClientPdfRestSnapshot();
          const html = buildFullPDFHTML(snapEnt, snapRep, 'Xavier Notes', '2026-08-01', getMacroRatioLabel(), getActiveGoalLabel());
          const iframe = creerIframePDF(html);
          await attendreRenduPDF(iframe);
          const doc = iframe.contentWindow.document;
          const text = doc.body.innerText;
          const pages = doc.querySelectorAll('.pdf-a4-page').length;
          nettoyerIframePDF();
          return { text, pages };
        }, { brand: creator, language: lang, withRest: rest, noteText: note });

        const sc = `${creator}/${lang}/${rest ? 'rest' : 'norest'}`;
        assert.equal(info.pages, rest ? 2 : 1, `${sc}: page count`);
        assert.ok(info.text.includes(note), `${sc}: neutral scenario note must be present`);
        const lower = info.text.toLowerCase();
        if (lang === 'en') {
          for (const w of FR_FORBIDDEN_IN_EN) {
            assert.equal(lower.includes(w), false, `${sc}: EN PDF must not contain French "${w}"`);
          }
          assert.equal(info.text.includes(SCENARIO_NOTE_FR), false, `${sc}: EN PDF must not contain the French note`);
        } else {
          assert.equal(info.text.includes(SCENARIO_NOTE_EN), false, `${sc}: FR PDF must not contain the English note`);
        }
        if (!rest) {
          assert.equal(/jour repos/i.test(info.text), false, `${sc}: no-rest PDF must not mention Jour Repos`);
          assert.equal(/rest day/i.test(info.text), false, `${sc}: no-rest PDF must not claim a Rest Day`);
        }
      }
    }
  }
  await page.close();
});
