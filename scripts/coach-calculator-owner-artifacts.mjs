/**
 * Produce owner-review artifacts for the restored coach calculator.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { verifyProtectedFiles } from '../src/lib/rc-data-protection.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'coach-calculator');
const reportsDir = path.join(root, 'reports', 'coach-calculator-restoration');
const screenshotsDir = path.join(reportsDir, 'screenshots');
const ownerDir = path.join(reportsDir, 'owner-package-staging');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function mime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.pdf': 'application/pdf',
    '.md': 'text/markdown; charset=utf-8',
  })[ext] || 'application/octet-stream';
}

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let rel = urlPath === '/' ? '/index.html' : urlPath;
    const abs = path.normalize(path.join(outDir, rel.replace(/^\//, '')));
    if (!abs.startsWith(outDir) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime(abs), 'Cache-Control': 'no-store' });
    fs.createReadStream(abs).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

async function main() {
  const build = spawnSync(process.execPath, ['scripts/coach-calculator-build.mjs', '--with-guide-pdf'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (build.status !== 0) throw new Error('build failed');

  ensureDir(screenshotsDir);
  ensureDir(ownerDir);

  const { server, origin } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      window.alert = () => {};
      window.confirm = () => true;
    });
    await page.goto(origin + '/', { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForFunction(() => window.COACH_DATA?.totalFoods === 287);

    await page.setViewport({ width: 1440, height: 900 });
    await page.screenshot({ path: path.join(screenshotsDir, 'desktop-1440.png'), fullPage: true });
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(screenshotsDir, 'mobile-390.png'), fullPage: true });
    await page.setViewport({ width: 768, height: 1024 });
    await page.screenshot({ path: path.join(screenshotsDir, 'tablet-768.png'), fullPage: true });

    await page.setViewport({ width: 1440, height: 900 });
    const artifact = await page.evaluate(async () => {
      const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
      };
      set('nom_athlete', 'Xavier Tremblay');
      set('sexe', 'H');
      set('age', '32');
      set('poids', '185');
      set('poids_unit', 'lbs');
      set('grandeur_unit', 'cm');
      set('grandeur_cm', '180');
      set('activite', 'modere');
      set('macroRatio', '25,45,30');
      set('proteines-par-kg', '2.0');
      setMacroMode('preset');
      setProteinesMode('gkg');
      document.querySelectorAll('.goal-card').forEach((card) => {
        card.classList.remove('active');
        if (parseFloat(card.getAttribute('data-multiplier')) === 1.0) card.classList.add('active');
      });
      selectedGoalMultiplier = 1.0;
      calculerBesoins();
      suggererBanque();
      repartirAutomatique('classique');
      const proBank = parseFloat(document.querySelector('.target-input[data-cat="pro"]')?.value) || 0;
      const mealShares = [0.3, 0, 0.25, 0, 0.25, 0.2];
      for (let m = 0; m < 6; m++) {
        const input = document.querySelectorAll('.rep-input[data-cat="pro"]')[m];
        if (input) input.value = String(Math.round(proBank * mealShares[m] * 2) / 2);
      }
      set('coach-notes', 'Hydratation prioritaire. Prioriser protéines maigres et féculents autour de l’entraînement.');
      set('heure-entrainement', '17:30');
      calculerBanque();
      calculerRepartition();
      updateEau();
      captureJourActif();
      sauvegarderProfil();
      genererPlanTextuel();
      const profile = getProfilData('Xavier Tremblay');
      const planText = document.getElementById('output-plan')?.value || '';
      // Build native PDF HTML (same source as client export)
      const snapEnt = getJourSnapshot('entrainement');
      const snapRep = jourReposActif ? getJourSnapshot('repos') : null;
      const dateStr = new Date().toLocaleDateString('fr-CA');
      const pdfHtml = buildFullPDFHTML(snapEnt, snapRep, 'Xavier Tremblay', dateStr, getMacroRatioLabel(), getActiveGoalLabel());
      return {
        profile,
        planText,
        pdfHtml,
        foods: window.COACH_DATA.totalFoods,
        tdee: Math.round(currentTDEE),
        targets,
      };
    });

    fs.writeFileSync(path.join(reportsDir, 'xavier-profile-export.json'), JSON.stringify(artifact.profile, null, 2));
    fs.writeFileSync(path.join(reportsDir, 'xavier-plan-text.txt'), artifact.planText);

    // Render client PDF from the same HTML the app would export
    const pdfPage = await browser.newPage();
    await pdfPage.setContent(artifact.pdfHtml, { waitUntil: 'networkidle0' });
    const pdfPath = path.join(reportsDir, 'xavier-plan-client-fr.pdf');
    await pdfPage.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
    });
    await pdfPage.close();

    // English PDF
    await page.evaluate(() => {
      choisirPdfLang('en');
      genererPlanTextuel();
    });
    const enHtml = await page.evaluate(() => {
      const snapEnt = getJourSnapshot('entrainement');
      const snapRep = jourReposActif ? getJourSnapshot('repos') : null;
      const dateStr = new Date().toLocaleDateString('en-CA');
      return buildFullPDFHTML(snapEnt, snapRep, 'Xavier Tremblay', dateStr, getMacroRatioLabel(), getActiveGoalLabel());
    });
    const pdfPageEn = await browser.newPage();
    await pdfPageEn.setContent(enHtml, { waitUntil: 'networkidle0' });
    await pdfPageEn.pdf({
      path: path.join(reportsDir, 'xavier-plan-client-en.pdf'),
      format: 'A4',
      printBackground: true,
      margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
    });
    await pdfPageEn.close();

    // Copy equivalents guide PDF
    const guidePdf = path.join(outDir, 'guides', 'kr-kinetics-equivalents-client-fr.pdf');
    if (fs.existsSync(guidePdf)) {
      fs.copyFileSync(guidePdf, path.join(reportsDir, 'equivalents-client-287.pdf'));
    }

    const protection = verifyProtectedFiles(undefined, { generatedAt: new Date().toISOString() });
    fs.writeFileSync(
      path.join(reportsDir, 'protected-hashes-after.json'),
      JSON.stringify({
        computedAt: new Date().toISOString(),
        ok: protection.ok,
        changed: protection.changed,
        after: protection.after,
        before: protection.before,
      }, null, 2)
    );

    fs.writeFileSync(
      path.join(reportsDir, 'capture-summary.json'),
      JSON.stringify({
        capturedAt: new Date().toISOString(),
        url: 'http://127.0.0.1:4188/',
        foods: artifact.foods,
        tdee: artifact.tdee,
        targets: artifact.targets,
        screenshots: [
          'screenshots/desktop-1440.png',
          'screenshots/tablet-768.png',
          'screenshots/mobile-390.png',
        ],
        pdfs: [
          'xavier-plan-client-fr.pdf',
          'xavier-plan-client-en.pdf',
          'equivalents-client-287.pdf',
        ],
        protectedOk: protection.ok,
      }, null, 2)
    );

    console.log(JSON.stringify({
      ok: protection.ok,
      origin,
      foods: artifact.foods,
      tdee: artifact.tdee,
      pdfPath,
    }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
