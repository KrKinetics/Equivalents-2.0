/**
 * Owner-review artifact generator for the seventh-meal feature.
 *
 * Produces, under verify-seventh-meal/ (gitignored):
 *   - 8 control PDFs: KR/Elevate x FR/EN x rest/no-rest, with portions placed
 *     in all SEVEN meals (including « Repas de soirée »).
 *   - desktop / tablet / mobile screenshots of the calculator.
 *   - old-plan-compatibility.md (legacy six-meal migration proof).
 *
 * Not a test: it demonstrates the running application for manual inspection.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { scenarioNoteForLang } from './seventh-meal-scenario-notes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COACH_DIR = path.join(ROOT, 'coach-calculator');
const OUT = path.join(ROOT, 'verify-seventh-meal');
const PDF_DIR = path.join(OUT, 'control-pdfs');
const PREVIEW_DIR = path.join(OUT, 'pdf-previews');
const SHOT_DIR = path.join(OUT, 'screenshots');
const CATS = ['pro', 'fec', 'leg', 'fru', 'lai', 'lip', 'whey'];
const ORDER_FR = ['Déjeuner', 'Collation AM', 'Dîner', 'Collation PM', 'Souper', 'Collation', 'Repas de soirée'];

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function contentType(fp) {
  const ext = path.extname(fp).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf',
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
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function seedSevenMeals(page, jour) {
  await page.evaluate(({ jourKey }) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('nom_athlete', 'Xavier Tremblay');
    set('sexe', 'H'); set('age', '32'); set('poids', '185'); set('poids_unit', 'lbs');
    set('grandeur_unit', 'cm'); set('grandeur_cm', '180'); set('activite', 'modere');
    set('macroRatio', '25,45,30'); set('proteines-par-kg', '2.0');
    if (typeof setMacroMode === 'function') setMacroMode('preset');
    if (typeof setProteinesMode === 'function') setProteinesMode('gkg');
    document.querySelectorAll('.goal-card').forEach((c) => {
      c.classList.remove('active');
      if (parseFloat(c.getAttribute('data-multiplier')) === 1.0) c.classList.add('active');
    });
    selectedGoalMultiplier = 1.0;
    calculerBesoins();
    setJourReposActif(true);
    if (jourKey === 'repos') changerJour('repos');
    suggererBanque();
    repartirAutomatique('equilibre');
    const proCible = parseFloat(document.querySelector('.target-input[data-cat="pro"]').value) || 0;
    const proInputs = Array.from(document.querySelectorAll('.rep-input[data-cat="pro"]'));
    const base = Math.floor((proCible / proInputs.length) * 2) / 2;
    let remaining = proCible;
    proInputs.forEach((inp) => { inp.value = String(base); remaining = Math.round((remaining - base) * 10) / 10; });
    let i = 0;
    while (remaining >= 0.5 && i < 100) {
      const inp = proInputs[i % proInputs.length];
      inp.value = String((parseFloat(inp.value) || 0) + 0.5);
      remaining = Math.round((remaining - 0.5) * 10) / 10; i += 1;
    }
    // Neutral placeholder; the real per-language scenario note is set per PDF below.
    set('coach-notes', '');
    calculerBanque(); calculerRepartition(); updateEau(); captureJourActif();
  }, { jourKey: jour });
}

async function renderPdf(browser, html, outPath) {
  const p = await browser.newPage();
  await p.setContent(html, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => {
    const imgs = Array.from(document.images);
    return imgs.length === 0 || imgs.every((im) => im.complete && im.naturalWidth > 0);
  }, { timeout: 20000 });
  await p.pdf({ path: outPath, format: 'A4', printBackground: true, margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' } });
  await p.close();
}

async function renderPreview(browser, html, basePath) {
  const p = await browser.newPage();
  await p.setViewport({ width: 840, height: 1200, deviceScaleFactor: 1 });
  await p.setContent(html, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => {
    const imgs = Array.from(document.images);
    return imgs.length === 0 || imgs.every((im) => im.complete && im.naturalWidth > 0);
  }, { timeout: 20000 });
  const handles = await p.$$('.pdf-a4-page');
  const files = [];
  for (let i = 0; i < handles.length; i += 1) {
    const f = `${basePath}-p${i + 1}.png`;
    await handles[i].screenshot({ path: f });
    files.push(f);
  }
  await p.close();
  return files;
}

async function main() {
  ensureDir(PDF_DIR); ensureDir(PREVIEW_DIR); ensureDir(SHOT_DIR);
  const { server, origin } = await startServer(COACH_DIR);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const manifest = [];
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => { window.alert = () => {}; window.confirm = () => true; });
    await page.goto(`${origin}/`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForFunction(() => window.COACH_DATA?.totalFoods === 287 && typeof getJourSnapshot === 'function');

    // Fill both days with seven meals each.
    await seedSevenMeals(page, 'entrainement');
    await seedSevenMeals(page, 'repos');
    await page.evaluate(() => { changerJour('entrainement'); captureJourActif(); });

    // Screenshots of the running app (seven-meal repartition + recap visible).
    for (const [name, vp] of [
      ['desktop-1440', { width: 1440, height: 900 }],
      ['tablet-768', { width: 768, height: 1024 }],
      ['mobile-390', { width: 390, height: 844 }],
    ]) {
      await page.setViewport(vp);
      await new Promise((r) => setTimeout(r, 200));
      const shot = path.join(SHOT_DIR, `${name}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      manifest.push({ type: 'screenshot', viewport: name, file: path.relative(OUT, shot) });
    }
    await page.setViewport({ width: 1440, height: 900 });

    // 8 control PDFs + their PNG previews.
    for (const creator of ['kr', 'elevate']) {
      for (const lang of ['fr', 'en']) {
        for (const rest of [false, true]) {
          const html = await page.evaluate(({ brand, language, withRest, note }) => {
            setJourReposActif(withRest);
            changerJour('entrainement');
            captureJourActif();
            choisirPdfCreator(brand);
            choisirPdfLang(language);
            // Scenario demo note: neutral, language-matched, no day-type claim.
            document.getElementById('coach-notes').value = note;
            const snapEnt = getJourSnapshot('entrainement');
            const snapRep = getClientPdfRestSnapshot();
            return buildFullPDFHTML(snapEnt, snapRep, 'Xavier Tremblay', '2026-08-01', getMacroRatioLabel(), getActiveGoalLabel());
          }, { brand: creator, language: lang, withRest: rest, note: scenarioNoteForLang(lang) });
          const label = `${creator}-${lang}-${rest ? 'avec-repos' : 'sans-repos'}`;
          const file = path.join(PDF_DIR, `xavier-plan-${label}.pdf`);
          await renderPdf(browser, html, file);
          const previews = await renderPreview(browser, html, path.join(PREVIEW_DIR, `xavier-plan-${label}`));
          const pages = (html.match(/<div class="pdf-a4-page\b/g) || []).length;
          manifest.push({ type: 'pdf', creator, lang, rest, pages, note: scenarioNoteForLang(lang), file: path.relative(OUT, file) });
          previews.forEach((f) => manifest.push({ type: 'preview', creator, lang, rest, file: path.relative(OUT, f) }));
        }
      }
    }

    // Old six-meal plan compatibility proof.
    const compat = await page.evaluate(({ cats, orderFr }) => {
      const rIndex = (m, c) => m * cats.length + cats.indexOf(c);
      const repartition = {};
      for (let i = 0; i < 6 * cats.length; i += 1) repartition[i] = '0';
      repartition[rIndex(0, 'fec')] = '2';
      repartition[rIndex(2, 'pro')] = '3';
      repartition[rIndex(4, 'pro')] = '3';
      repartition[rIndex(4, 'fec')] = '2';
      repartition[rIndex(5, 'lai')] = '2';   // old Collation Soirée
      repartition[rIndex(5, 'whey')] = '1';
      const legacy = {
        nom: 'Ancien Dossier', sexe: 'H', age: '40', poids: '82', poids_unit: 'kg',
        grandeur_unit: 'cm', grandeur_cm: '178', activite: 'modere', macroRatio: '25,45,30',
        goalMultiplier: 1, banque: { pro: '6', fec: '4', leg: '0', fru: '0', lai: '2', lip: '0', whey: '1' },
        repartition,
      };
      const before = { totalPro: 0, totalGlu: 0, totalLip: 0 };
      // planned totals of the raw legacy plan (six meals)
      for (let m = 0; m < 6; m += 1) {
        let p = 0, g = 0, l = 0;
        const MOY = { pro: [9, 0, 2], fec: [3, 18, 1], leg: [2, 7, 0], fru: [1, 15, 2], lai: [7, 10, 2], lip: [1, 2, 6], whey: [22, 2, 2] };
        cats.forEach((c) => { const v = parseFloat(repartition[rIndex(m, c)]) || 0; p += v * MOY[c][0]; g += v * MOY[c][1]; l += v * MOY[c][2]; });
        if (p + g + l > 0) { before.totalPro += Math.round(p); before.totalGlu += Math.round(g); before.totalLip += Math.round(l); }
      }
      let threw = false;
      try { appliquerProfilData(legacy, 'Ancien Dossier'); } catch (e) { threw = true; }
      const rows = document.querySelectorAll('#repartition-tbody tr');
      const collationVals = Array.from(rows[5].querySelectorAll('.rep-input')).map((i) => i.value);
      const eveningVals = Array.from(rows[6].querySelectorAll('.rep-input')).map((i) => i.value);
      const snap = getJourSnapshot('entrainement');
      const labels = Array.from(rows).map((r) => {
        const clone = r.querySelector('.meal-label').cloneNode(true);
        clone.querySelectorAll('.meal-tag').forEach((s) => s.remove());
        return clone.textContent.replace(/[^\p{L} ]/gu, '').replace(/\s+/g, ' ').trim();
      });
      return {
        threw, labels, orderOk: JSON.stringify(labels) === JSON.stringify(orderFr),
        collationVals, eveningVals,
        eveningAllZero: eveningVals.every((v) => parseFloat(v) === 0),
        before, after: { totalPro: snap.totalPro, totalGlu: snap.totalGlu, totalLip: snap.totalLip },
      };
    }, { cats: CATS, orderFr: ORDER_FR });

    const compatMd = `# Compatibilité des anciens dossiers à six repas

Chargement d'un ancien plan à **six repas** (l'ancienne « Collation Soirée » contient lai=2, whey=1) dans le calculateur à sept repas.

| Vérification | Résultat |
|---|---|
| Ouverture sans erreur | ${compat.threw ? '❌ ERREUR' : '✅ OK'} |
| Ordre affiché | ${compat.orderOk ? '✅ ' + compat.labels.join(' · ') : '❌ ' + compat.labels.join(' · ')} |
| Ancienne « Collation Soirée » → « Collation » (portions conservées) | ${(compat.collationVals[CATS.indexOf('lai')] === '2' && compat.collationVals[CATS.indexOf('whey')] === '1') ? '✅ lai=2, whey=1 conservés' : '❌ ' + JSON.stringify(compat.collationVals)} |
| « Repas de soirée » initialisé à zéro | ${compat.eveningAllZero ? '✅ toutes portions = 0' : '❌ ' + JSON.stringify(compat.eveningVals)} |
| Totaux planifiés inchangés à l'ouverture | ${(compat.before.totalPro === compat.after.totalPro && compat.before.totalGlu === compat.after.totalGlu && compat.before.totalLip === compat.after.totalLip) ? '✅ identiques' : '❌'} (avant P${compat.before.totalPro}/G${compat.before.totalGlu}/L${compat.before.totalLip} · après P${compat.after.totalPro}/G${compat.after.totalGlu}/L${compat.after.totalLip}) |

Aucune redistribution automatique n'est appliquée : les portions existantes restent à leur place, seul le libellé du 6e créneau change et le 7e est ajouté à zéro.
`;
    fs.writeFileSync(path.join(OUT, 'old-plan-compatibility.md'), compatMd, 'utf8');
    manifest.push({ type: 'report', file: 'old-plan-compatibility.md' });

    fs.writeFileSync(path.join(OUT, 'artifacts-manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), manifest }, null, 2));
    console.log(JSON.stringify({ ok: true, pdfs: manifest.filter((m) => m.type === 'pdf').length, screenshots: manifest.filter((m) => m.type === 'screenshot').length, compatOk: !compat.threw && compat.orderOk && compat.eveningAllZero }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
