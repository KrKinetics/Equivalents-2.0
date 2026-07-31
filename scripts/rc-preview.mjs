/**
 * Build the interactive hybrid D/A release candidate and optionally serve it.
 *
 * Usage:
 *   node scripts/rc-preview.mjs           # build + serve
 *   node scripts/rc-preview.mjs --build-only
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

import { buildReleaseCandidateHtml } from '../src/lib/rc-app-render.mjs';
import {
  assertProtectedFilesUnchanged,
  collectProtectedHashes,
  verifyProtectedFiles,
} from '../src/lib/rc-data-protection.mjs';
import {
  assertForbiddenMergesRespected,
  assertMandatorySpecialCases,
  assertUniqueFullCoverage,
  buildLegacyContext,
  buildRollupIndex,
} from '../src/lib/hybrid-rollup-adapter.mjs';
import { defaultFoodIdResolver, runAcceptanceScenarios } from '../src/lib/rc-scenarios.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'reports', 'release-candidate');
const screenshotsDir = path.join(outDir, 'screenshots');
const guidesDir = path.join(outDir, 'guides');
const assetsDir = path.join(outDir, 'assets');
const PORT = Number(process.env.RC_PORT || 4177);
const HOST = process.env.RC_HOST || '127.0.0.1';
const buildOnly = process.argv.includes('--build-only');
const skipGuide = process.argv.includes('--skip-guide');

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function runNpm(script) {
  const result = spawnSync('npm', ['run', script], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`npm run ${script} failed with status ${result.status}`);
  }
}

function stageLogo() {
  // Prefer compact SVG for the RC app bundle (avoid committing multi‑MB PNG duplicates).
  const candidates = [
    path.join(root, 'assets', 'kinetics-logo.svg'),
    path.join(root, 'assets', 'kinetics-logo-transparent.png'),
    path.join(root, 'assets', 'kinetics-logo-full.png'),
  ];
  const source = candidates.find((candidate) => fs.existsSync(candidate));
  if (!source) throw new Error('KR Kinetics logo not found');
  ensureDir(assetsDir);
  const destName = `kinetics-logo${path.extname(source)}`;
  const dest = path.join(assetsDir, destName);
  copyFile(source, dest);
  return `./assets/${destName}`;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
  })[ext] || 'application/octet-stream';
}

function startServer() {
  const server = http.createServer((req, res) => {
    try {
      const raw = req.url && req.url !== '//' ? req.url : '/';
      const url = new URL(raw, `http://${HOST}:${PORT}`);
      let rel = decodeURIComponent(url.pathname || '/');
      if (!rel || rel === '/') rel = '/index.html';
      const safeRel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
      const filePath = path.join(outDir, safeRel);
      if (!filePath.startsWith(outDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType(filePath) });
      fs.createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad request');
    }
  });
  return new Promise((resolve) => {
    server.listen(PORT, HOST, () => resolve(server));
  });
}

async function captureScreenshots(baseUrl) {
  ensureDir(screenshotsDir);
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 180000,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const widths = [
    { width: 1440, height: 1100, name: 'desktop-1440.png' },
    { width: 768, height: 1100, name: 'tablet-768.png' },
    { width: 390, height: 1100, name: 'mobile-390.png' },
  ];
  const visual = {
    generatedAt: new Date().toISOString(),
    widths: [],
    overall: 'PASS',
  };
  try {
    for (const viewport of widths) {
      const page = await browser.newPage();
      await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
      const targetUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForSelector('#active-totals .stat', { timeout: 60000 });
      // Allow logo/fonts a short settle window without waiting on external network idle.
      await new Promise((resolve) => setTimeout(resolve, 750));
      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const wrap = document.querySelector('.wrap');
        const widest = Math.max(
          doc.scrollWidth,
          document.body.scrollWidth,
          wrap?.scrollWidth || 0,
        );
        return {
          scrollWidth: widest,
          clientWidth: doc.clientWidth,
          hasBanner: Boolean(document.querySelector('.banner')?.textContent?.includes('VERSION CANDIDATE')),
          hasModeA: Boolean(document.body.innerText.includes('Mode actuel — règles KR Kinetics')),
          hasModeDA: Boolean(document.body.innerText.includes('Aperçu précision — profils d’échange')),
          hasProvisional: Boolean(document.body.innerText.includes('Valeurs provisoires non approuvées')),
        };
      });
      // Allow 2px sub-pixel tolerance on mobile Chromium.
      const overflow = metrics.scrollWidth > metrics.clientWidth + 2;
      const pass = !overflow && metrics.hasBanner && metrics.hasModeA && metrics.hasModeDA && metrics.hasProvisional;
      if (!pass) visual.overall = 'FAIL';
      const shotPath = path.join(screenshotsDir, viewport.name);
      await page.screenshot({ path: shotPath, fullPage: true });
      visual.widths.push({
        ...viewport,
        file: `screenshots/${viewport.name}`,
        metrics,
        overflow,
        status: pass ? 'PASS' : 'FAIL',
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return visual;
}

function writeMarkdownReports({ url, command, scenarioReport, protection, visual }) {
  const readme = `# Version candidate interactive — KR Kinetics

## Ouvrir maintenant

- **Commande :** \`${command}\`
- **URL locale :** ${url}

## Ce que le propriétaire doit tester

1. Calculateur utilisable (portions par groupe).
2. Basculer entre « Mode actuel — règles KR Kinetics » et « Aperçu précision — profils d’échange » sans perdre les entrées.
3. Voir les totaux A et D/A côte à côte et comprendre les écarts.
4. Parcourir le guide desktop FR et le guide mobile bilingue.
5. Rechercher / filtrer les 287 aliments.
6. Lire les avertissements « Valeurs provisoires non approuvées » / « Échantillon insuffisant ».
7. Inspecter les scénarios d’acceptation et les PDF candidats.

## Limites connues

- Mode D/A non approuvé pour la production.
- Les slots par groupe en D/A utilisent le rollup dominant stable (aperçu) sauf si un aliment précis est sélectionné via les scénarios côté moteur.
- Les familles à échantillon insuffisant (10) ne peuvent pas générer un plan exploitable en D/A : retour explicite à A.
- Aucune migration automatique des plans existants.

## Confirmation

Ce build **ne modifie aucun client**, aucune donnée nutritionnelle individuelle, aucune MOYENNE de production, ni aucun plan sauvegardé.

- Scénarios : ${scenarioReport.passed}/${scenarioReport.scenarioCount} PASS
- Protection données : ${protection.ok ? 'OK' : 'ÉCHEC'}
- Visual QA : ${visual.overall}
`;

  const checklist = `# Checklist d’acceptation — propriétaire

- [ ] Ouvrir ${url}
- [ ] Lire la bannière VERSION CANDIDATE
- [ ] Tester le mode actuel (A)
- [ ] Tester l’aperçu précision (D/A)
- [ ] Vérifier qu’aucune valeur D/A n’est présentée comme approuvée
- [ ] Comparer une journée type A vs D/A
- [ ] Ouvrir le guide desktop FR
- [ ] Ouvrir le guide mobile bilingue
- [ ] Télécharger / imprimer les deux PDF candidats
- [ ] Rechercher un aliment FR et EN
- [ ] Filtrer par catégorie / groupe / rollup
- [ ] Vérifier un rollup à échantillon insuffisant
- [ ] Décider : accepter le visuel / demander des corrections
- [ ] Décider : valeurs hybrides encore provisoires (obligatoire)

**DO NOT MERGE — OWNER ACCEPTANCE REQUIRED**
`;

  fs.writeFileSync(path.join(outDir, 'README.md'), `${readme}\n`, 'utf8');
  fs.writeFileSync(path.join(outDir, 'ACCEPTANCE_CHECKLIST.md'), `${checklist}\n`, 'utf8');
}

async function build() {
  ensureDir(outDir);
  ensureDir(screenshotsDir);
  ensureDir(guidesDir);
  ensureDir(assetsDir);

  const beforeHashes = collectProtectedHashes();
  assertProtectedFilesUnchanged();

  const foodsPayload = readJson('src/data/food-equivalents.json');
  const categoryMapping = readJson('src/data/category-mapping.json');
  const proposal = readJson('reports/exchange-profile-decision/exchange-rollup-proposal.json');
  const versionMeta = readJson('src/data/nutrition-data-version.json');

  const rollupIndex = buildRollupIndex(proposal);
  assertUniqueFullCoverage(rollupIndex, 287, 28);
  assertMandatorySpecialCases(rollupIndex);
  assertForbiddenMergesRespected(rollupIndex);

  const foodsById = new Map(foodsPayload.foods.map((food) => [food.id, food]));
  const legacyRefs = buildLegacyContext(categoryMapping);
  const context = { legacyRefs, rollupIndex, foodsById };
  const scenarioReport = runAcceptanceScenarios(context, { foodIdResolver: defaultFoodIdResolver });
  if (scenarioReport.failed) {
    throw new Error(`Acceptance scenarios failed: ${scenarioReport.failed}`);
  }

  // Ensure guide preview artifacts exist, then copy RC PDFs/HTML.
  const guidePreviewDir = path.join(root, 'reports', 'guide-preview');
  const guideReady = ['kr-kinetics-landscape-fr.pdf', 'kr-kinetics-mobile-bilingual.pdf', 'kr-kinetics-landscape-fr.html', 'kr-kinetics-mobile-bilingual.html']
    .every((name) => fs.existsSync(path.join(guidePreviewDir, name)));
  if (!skipGuide || !guideReady) {
    runNpm('guide:preview');
  }
  const guideCopies = [
    ['kr-kinetics-landscape-fr.html', path.join(guidesDir, 'kr-kinetics-landscape-fr.html')],
    ['kr-kinetics-landscape-en.html', path.join(guidesDir, 'kr-kinetics-landscape-en.html')],
    ['kr-kinetics-mobile-bilingual.html', path.join(guidesDir, 'kr-kinetics-mobile-bilingual.html')],
    ['kr-kinetics-landscape-fr.pdf', path.join(outDir, 'kr-kinetics-guide-landscape-fr-rc.pdf')],
    ['kr-kinetics-mobile-bilingual.pdf', path.join(outDir, 'kr-kinetics-guide-mobile-bilingual-rc.pdf')],
  ];
  for (const [name, dest] of guideCopies) {
    const src = path.join(guidePreviewDir, name);
    if (!fs.existsSync(src)) throw new Error(`Missing guide preview artifact: ${name}`);
    copyFile(src, dest);
  }
  // Point guide HTML logos at the shared RC asset (no second multi‑MB PNG copy).
  const sharedLogoUrl = '../assets/kinetics-logo.svg';
  for (const htmlName of ['kr-kinetics-landscape-fr.html', 'kr-kinetics-landscape-en.html', 'kr-kinetics-mobile-bilingual.html']) {
    const htmlPath = path.join(guidesDir, htmlName);
    if (!fs.existsSync(htmlPath)) continue;
    const html = fs.readFileSync(htmlPath, 'utf8')
      .replace(/\.\/assets\/kinetics-logo\.(?:png|svg)/g, sharedLogoUrl);
    fs.writeFileSync(htmlPath, html, 'utf8');
  }
  // Keep nutrition:final-audit clean: regenerating guide-preview dirties tracked PDFs/HTML.
  // RC already copied the candidate artifacts under reports/release-candidate/.
  if (!skipGuide) {
    spawnSync('git', ['restore', 'reports/guide-preview'], {
      cwd: root,
      stdio: 'ignore',
      shell: true,
    });
  }

  const logoUrl = stageLogo();
  const rcData = {
    generatedAt: new Date().toISOString(),
    version: versionMeta.version,
    labels: {
      banner: 'VERSION CANDIDATE — NE PAS UTILISER POUR DES CLIENTS',
      modeA: 'Mode actuel — règles KR Kinetics',
      modeDA: 'Aperçu précision — profils d’échange',
      provisional: 'Valeurs provisoires non approuvées',
    },
    foods: foodsPayload.foods.map((food) => ({
      id: food.id,
      names: food.names,
      displayCategory: food.displayCategory,
      calculationGroup: food.calculationGroup,
      exchangeProfileId: food.exchangeProfileId,
      status: food.status,
    })),
    foodsById: Object.fromEntries(foodsPayload.foods.map((food) => [food.id, {
      id: food.id,
      names: food.names,
      displayCategory: food.displayCategory,
      calculationGroup: food.calculationGroup,
      exchangeProfileId: food.exchangeProfileId,
    }])),
    legacyRefs,
    rollups: proposal.rollups.map((rollup) => ({
      exchangeRollupId: rollup.exchangeRollupId,
      foodCount: rollup.foodCount,
      insufficientSample: rollup.insufficientSample,
      medianProfile: rollup.medianProfile,
      calculatorBridge: rollup.calculatorBridge,
      approved: false,
      status: rollup.status,
    })),
    rollupsById: Object.fromEntries(proposal.rollups.map((rollup) => [rollup.exchangeRollupId, {
      exchangeRollupId: rollup.exchangeRollupId,
      foodCount: rollup.foodCount,
      insufficientSample: rollup.insufficientSample,
      medianProfile: rollup.medianProfile,
      calculatorBridge: rollup.calculatorBridge,
    }])),
    assignmentsByFoodId: Object.fromEntries(proposal.assignments.map((row) => [row.foodId, row])),
    scenarios: scenarioReport.scenarios,
  };

  fs.writeFileSync(path.join(outDir, 'rc-data.json'), `${JSON.stringify(rcData, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    path.join(outDir, 'index.html'),
    buildReleaseCandidateHtml({ dataUrl: './rc-data.json', logoUrl }),
    'utf8',
  );
  fs.writeFileSync(
    path.join(outDir, 'legacy-vs-hybrid-scenarios.json'),
    `${JSON.stringify(scenarioReport, null, 2)}\n`,
    'utf8',
  );

  const protection = verifyProtectedFiles();
  const afterHashes = collectProtectedHashes();
  protection.before = beforeHashes.before;
  protection.after = afterHashes.after;
  fs.writeFileSync(path.join(outDir, 'data-protection-report.json'), `${JSON.stringify(protection, null, 2)}\n`, 'utf8');
  if (!protection.ok) throw new Error('Protected files changed during RC build');

  // Temporary server for screenshots even in build-only (closed after).
  const server = await startServer();
  const url = `http://${HOST}:${PORT}`;
  let visual;
  try {
    visual = await captureScreenshots(url);
    fs.writeFileSync(path.join(outDir, 'visual-qa-report.json'), `${JSON.stringify(visual, null, 2)}\n`, 'utf8');
    if (visual.overall !== 'PASS') {
      throw new Error('Visual QA failed for release candidate');
    }
  } finally {
    if (buildOnly) {
      await new Promise((resolve) => server.close(resolve));
    } else {
      // keep server reference on process for serve mode
      globalThis.__rcServer = server;
    }
  }

  const publicUrl = `${url}/`;
  const command = 'npm run rc:preview';
  writeMarkdownReports({ url: publicUrl, command, scenarioReport, protection, visual });

  const summary = {
    url: publicUrl,
    command,
    scenarioReport: {
      passed: scenarioReport.passed,
      failed: scenarioReport.failed,
      scenarioCount: scenarioReport.scenarioCount,
    },
    protectionOk: protection.ok,
    visual: visual.overall,
    pdfs: [
      'reports/release-candidate/kr-kinetics-guide-landscape-fr-rc.pdf',
      'reports/release-candidate/kr-kinetics-guide-mobile-bilingual-rc.pdf',
    ],
  };
  fs.writeFileSync(path.join(outDir, 'build-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log('\n=== RELEASE CANDIDATE READY ===');
  console.log(`URL: ${publicUrl}`);
  console.log(`Command: ${command}`);
  console.log(`Scenarios: ${scenarioReport.passed}/${scenarioReport.scenarioCount} PASS`);
  console.log(`Protection: ${protection.ok ? 'OK' : 'FAIL'}`);
  console.log(`Visual QA: ${visual.overall}`);
  return { url: publicUrl, command, server: buildOnly ? null : server, summary };
}

const result = await build();
if (buildOnly) {
  process.exitCode = 0;
} else {
  console.log(`\nServing ${result.url}`);
  console.log('Press Ctrl+C to stop.');
  // Keep process alive.
  await new Promise(() => {});
}
