/**
 * Build the interactive hybrid D/A release candidate and optionally serve it.
 *
 * Usage:
 *   node scripts/rc-preview.mjs              # serve existing artifacts (build only if missing)
 *   node scripts/rc-preview.mjs --rebuild    # force deterministic rebuild + serve
 *   node scripts/rc-preview.mjs --build-only # force deterministic rebuild, no serve
 *   node scripts/rc-preview.mjs --serve-only # never rebuild
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

import { buildReleaseCandidateHtml } from '../src/lib/rc-app-render.mjs';
import {
  assertProtectedFilesUnchanged,
  collectProtectedHashes,
  verifyProtectedFiles,
} from '../src/lib/rc-data-protection.mjs';
import { releaseCandidateGeneratedAt } from '../src/lib/rc-determinism.mjs';
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
const rewriteScreenshots = process.argv.includes('--rewrite-screenshots');
const rewriteGuides = process.argv.includes('--rewrite-guides');
const forceRebuild = process.argv.includes('--rebuild') || buildOnly;
const serveOnly = process.argv.includes('--serve-only');

const REQUIRED_ARTIFACTS = [
  'index.html',
  'rc-data.json',
  'legacy-vs-hybrid-scenarios.json',
  'data-protection-report.json',
  'visual-qa-report.json',
  'screenshots/desktop-1440.png',
  'screenshots/tablet-768.png',
  'screenshots/mobile-390.png',
  'kr-kinetics-guide-landscape-fr-rc.pdf',
  'kr-kinetics-guide-mobile-bilingual-rc.pdf',
];

function artifactsReady() {
  return REQUIRED_ARTIFACTS.every((rel) => fs.existsSync(path.join(outDir, rel)));
}

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
  // Owner-approved brand assets only (horizontal wordmark + monogram favicon).
  const horizontal = path.join(root, 'assets', 'logo-kr-kinetics-horizontal.png');
  const monogram = path.join(root, 'assets', 'logo-kr-monogramme.png');
  if (!fs.existsSync(horizontal)) throw new Error('Official logo-kr-kinetics-horizontal.png not found');
  if (!fs.existsSync(monogram)) throw new Error('Official logo-kr-monogramme.png not found');
  ensureDir(assetsDir);
  copyFile(horizontal, path.join(assetsDir, 'logo-kr-kinetics-horizontal.png'));
  copyFile(monogram, path.join(assetsDir, 'logo-kr-monogramme.png'));
  return {
    logoUrl: './assets/logo-kr-kinetics-horizontal.png',
    faviconUrl: './assets/logo-kr-monogramme.png',
  };
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

async function captureScreenshots(baseUrl, { generatedAt, rewrite = false } = {}) {
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
    generatedAt,
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
          hasModeA: Boolean(document.body.innerText.includes('Calcul actuel')),
          hasModeDA: Boolean(document.body.innerText.includes('Aperçu personnalisé')),
          hasProvisionalNote: Boolean(document.body.innerText.includes('Non approuvé pour la production')),
          hasLogo: [...document.images].some((img) => img.complete && img.naturalWidth > 0),
        };
      });
      // Allow 2px sub-pixel tolerance on mobile Chromium.
      const overflow = metrics.scrollWidth > metrics.clientWidth + 2;
      const pass = !overflow && metrics.hasBanner && metrics.hasModeA && metrics.hasModeDA && metrics.hasProvisionalNote && metrics.hasLogo;
      if (!pass) visual.overall = 'FAIL';
      const shotPath = path.join(screenshotsDir, viewport.name);
      const exists = fs.existsSync(shotPath);
      // PNG captures are non-deterministic across Chromium runs; reuse committed files by default.
      if (rewrite || !exists) {
        await page.screenshot({ path: shotPath, fullPage: true });
      }
      visual.widths.push({
        ...viewport,
        file: `screenshots/${viewport.name}`,
        metrics,
        overflow,
        reusedScreenshot: !(rewrite || !exists),
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

1. Calculateur utilisable (portions par groupe pour le calcul actuel).
2. Basculer entre « Calcul actuel » et « Aperçu personnalisé » sans perdre les entrées.
3. Ajouter des aliments réels au panier et comparer les totaux.
4. Parcourir les guides desktop FR/EN et le guide mobile bilingue.
5. Rechercher / filtrer les 287 aliments.
6. Lire la bannière provisoire et les exceptions (échantillon insuffisant / fallback).
7. Inspecter les diagnostics propriétaire et les PDF candidats.

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

function copyIfMissing(src, dest) {
  if (fs.existsSync(dest)) return false;
  if (!fs.existsSync(src)) throw new Error(`Missing source artifact: ${src}`);
  copyFile(src, dest);
  return true;
}

async function build() {
  ensureDir(outDir);
  ensureDir(screenshotsDir);
  ensureDir(guidesDir);
  ensureDir(assetsDir);

  const beforeHashes = collectProtectedHashes();
  const foodsPayload = readJson('src/data/food-equivalents.json');
  const categoryMapping = readJson('src/data/category-mapping.json');
  const proposal = readJson('reports/exchange-profile-decision/exchange-rollup-proposal.json');
  const versionMeta = readJson('src/data/nutrition-data-version.json');
  const generatedAt = releaseCandidateGeneratedAt(versionMeta);
  assertProtectedFilesUnchanged(undefined, { generatedAt });

  const rollupIndex = buildRollupIndex(proposal);
  assertUniqueFullCoverage(rollupIndex, 287, 28);
  assertMandatorySpecialCases(rollupIndex);
  assertForbiddenMergesRespected(rollupIndex);

  const foodsById = new Map(foodsPayload.foods.map((food) => [food.id, food]));
  const legacyRefs = buildLegacyContext(categoryMapping);
  const context = { legacyRefs, rollupIndex, foodsById };
  const scenarioReport = runAcceptanceScenarios(context, {
    foodIdResolver: defaultFoodIdResolver,
    generatedAt,
  });
  if (scenarioReport.failed) {
    throw new Error(`Acceptance scenarios failed: ${scenarioReport.failed}`);
  }

  // Ensure guide preview artifacts exist. Keep already-committed RC PDFs/HTML by default
  // (Puppeteer PDF bytes are non-deterministic across runs).
  const guidePreviewDir = path.join(root, 'reports', 'guide-preview');
  const guideReady = ['kr-kinetics-landscape-fr.pdf', 'kr-kinetics-mobile-bilingual.pdf', 'kr-kinetics-landscape-fr.html', 'kr-kinetics-mobile-bilingual.html']
    .every((name) => fs.existsSync(path.join(guidePreviewDir, name)));
  const rcGuidesReady = [
    path.join(guidesDir, 'kr-kinetics-landscape-fr.html'),
    path.join(guidesDir, 'kr-kinetics-mobile-bilingual.html'),
    path.join(outDir, 'kr-kinetics-guide-landscape-fr-rc.pdf'),
    path.join(outDir, 'kr-kinetics-guide-mobile-bilingual-rc.pdf'),
  ].every((filePath) => fs.existsSync(filePath));
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
    if (rewriteGuides || !rcGuidesReady) {
      copyFile(src, dest);
      continue;
    }
    // Preserve committed RC binaries/HTML; guide:preview still validated separately.
    copyIfMissing(src, dest);
  }
  // Point guide HTML logos at the shared official horizontal asset.
  const sharedLogoUrl = '../assets/logo-kr-kinetics-horizontal.png';
  for (const htmlName of ['kr-kinetics-landscape-fr.html', 'kr-kinetics-landscape-en.html', 'kr-kinetics-mobile-bilingual.html']) {
    const htmlPath = path.join(guidesDir, htmlName);
    if (!fs.existsSync(htmlPath)) continue;
    const html = fs.readFileSync(htmlPath, 'utf8');
    const next = html
      .replace(/(?<!\.)\.\/assets\/(?:kinetics-logo|logo-kr-kinetics-horizontal)\.(?:png|svg)/g, sharedLogoUrl)
      .replace(/\.\.\/assets\/(?:kinetics-logo|logo-kr-kinetics-horizontal)\.(?:png|svg)/g, sharedLogoUrl);
    if (next !== html) fs.writeFileSync(htmlPath, next, 'utf8');
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

  const { logoUrl, faviconUrl } = stageLogo();
  const rcData = {
    generatedAt,
    version: versionMeta.version,
    labels: {
      banner: 'VERSION CANDIDATE — NE PAS UTILISER POUR DES CLIENTS',
      modeA: 'Calcul actuel',
      modeDA: 'Aperçu personnalisé',
      provisional: 'Aperçu personnalisé : valeurs provisoires non approuvées pour la production',
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
    buildReleaseCandidateHtml({ dataUrl: './rc-data.json', logoUrl, faviconUrl }),
    'utf8',
  );
  fs.writeFileSync(
    path.join(outDir, 'legacy-vs-hybrid-scenarios.json'),
    `${JSON.stringify(scenarioReport, null, 2)}\n`,
    'utf8',
  );

  const protection = verifyProtectedFiles(undefined, { generatedAt });
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
    visual = await captureScreenshots(url, { generatedAt, rewrite: rewriteScreenshots });
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

async function serveExisting() {
  if (!artifactsReady()) {
    throw new Error('Release-candidate artifacts missing. Run: node scripts/rc-preview.mjs --build-only');
  }
  const server = await startServer();
  const publicUrl = `http://${HOST}:${PORT}/`;
  console.log('\n=== RELEASE CANDIDATE READY ===');
  console.log(`URL: ${publicUrl}`);
  console.log('Command: npm run rc:preview');
  console.log('(serving existing artifacts — no rebuild)');
  console.log('Press Ctrl+C to stop.');
  globalThis.__rcServer = server;
  await new Promise(() => {});
}

// Default owner command serves committed artifacts without rewriting them.
// --build-only / --rebuild force a deterministic rebuild for verification.
if (serveOnly || (!buildOnly && !forceRebuild && artifactsReady())) {
  await serveExisting();
} else {
  const result = await build();
  if (buildOnly) {
    process.exitCode = 0;
  } else {
    console.log(`\nServing ${result.url}`);
    console.log('Press Ctrl+C to stop.');
    await new Promise(() => {});
  }
}
