/**
 * Serve the restored coach calculator and optionally capture screenshots / owner artifacts.
 *
 * Usage:
 *   node scripts/coach-calculator-preview.mjs              # serve; build only if artifacts missing
 *   node scripts/coach-calculator-preview.mjs --rebuild    # force rebuild then serve
 *   node scripts/coach-calculator-preview.mjs --build-only
 *   node scripts/coach-calculator-preview.mjs --capture
 *   node scripts/coach-calculator-preview.mjs --serve-only
 *
 * Note: --with-guide-pdf is forwarded to the build when a build runs; it does not
 * force a rebuild by itself (avoids dirtying tracked generated files on every preview).
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'coach-calculator');
const reportsDir = path.join(root, 'reports', 'coach-calculator-restoration');
const screenshotsDir = path.join(reportsDir, 'screenshots');
const PORT = Number(process.env.COACH_PORT || 4188);
const HOST = process.env.COACH_HOST || '127.0.0.1';

const buildOnly = process.argv.includes('--build-only');
const serveOnly = process.argv.includes('--serve-only');
const capture = process.argv.includes('--capture');
const forceRebuild = process.argv.includes('--rebuild') || buildOnly;
const withGuidePdf = process.argv.includes('--with-guide-pdf');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function mime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.pdf': 'application/pdf',
    '.md': 'text/markdown; charset=utf-8',
    '.svg': 'image/svg+xml',
  })[ext] || 'application/octet-stream';
}

function artifactsReady() {
  return [
    'index.html',
    'coach-data.json',
    'assets/logo-kr-kinetics-horizontal.png',
    'assets/logo-kr-monogramme.png',
    'vendor/html2canvas.min.js',
    'vendor/jspdf.umd.min.js',
  ].every((rel) => fs.existsSync(path.join(outDir, rel)));
}

function runBuild() {
  const args = ['scripts/coach-calculator-build.mjs'];
  if (withGuidePdf) args.push('--with-guide-pdf');
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('coach-calculator-build failed');
}

function startServer() {
  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let rel = urlPath === '/' ? '/index.html' : urlPath;
      const abs = path.normalize(path.join(outDir, rel.replace(/^\//, '')));
      if (!abs.startsWith(outDir)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
        res.writeHead(404); res.end('Not found'); return;
      }
      res.writeHead(200, { 'Content-Type': mime(abs), 'Cache-Control': 'no-store' });
      fs.createReadStream(abs).pipe(res);
    } catch (err) {
      res.writeHead(500); res.end(String(err));
    }
  });
  return new Promise((resolve) => {
    server.listen(PORT, HOST, () => {
      console.log(`Coach calculator: http://${HOST}:${PORT}/`);
      resolve(server);
    });
  });
}

async function captureScreenshots(baseUrl) {
  const puppeteer = (await import('puppeteer')).default;
  ensureDir(screenshotsDir);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForFunction(() => window.COACH_DATA && window.COACH_DATA.totalFoods === 287, { timeout: 30000 });

    // Desktop full page
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.screenshot({ path: path.join(screenshotsDir, 'desktop-1440.png'), fullPage: true });

    // Tablet
    await page.setViewport({ width: 768, height: 1024, deviceScaleFactor: 1 });
    await page.screenshot({ path: path.join(screenshotsDir, 'tablet-768.png'), fullPage: true });

    // Mobile
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.screenshot({ path: path.join(screenshotsDir, 'mobile-390.png'), fullPage: true });

    // Seed Xavier scenario for PDF/profile artifacts
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    const artifact = await page.evaluate(async () => {
      const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };
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
      if (typeof setMacroMode === 'function') setMacroMode('preset');
      if (typeof setProteinesMode === 'function') setProteinesMode('gkg');
      document.querySelectorAll('.goal-card').forEach((card) => {
        card.classList.remove('active');
        if (parseFloat(card.getAttribute('data-multiplier')) === 1.0) card.classList.add('active');
      });
      selectedGoalMultiplier = 1.0;
      calculerBesoins();
      if (typeof suggererBanque === 'function') suggererBanque();
      if (typeof repartirAutomatique === 'function') repartirAutomatique('classique');
      // Ensure protein portions are placed (auto skips pro)
      const proBank = parseFloat(document.querySelector('.target-input[data-cat="pro"]')?.value) || 0;
      if (proBank > 0) {
        const mealShares = [0.3, 0, 0.25, 0, 0.25, 0.2];
        let placed = 0;
        for (let m = 0; m < 6; m++) {
          const val = Math.round(proBank * mealShares[m] * 2) / 2;
          const input = document.querySelectorAll('.rep-input[data-cat="pro"]')[m];
          if (input) input.value = String(val);
          placed += val;
        }
        const rem = Math.round((proBank - placed) * 2) / 2;
        const last = document.querySelectorAll('.rep-input[data-cat="pro"]')[4];
        if (last && rem) last.value = String((parseFloat(last.value) || 0) + rem);
      }
      calculerBanque();
      calculerRepartition();
      set('coach-notes', 'Hydratation prioritaire. Prioriser protéines maigres et féculents autour de l’entraînement.');
      if (typeof updateEau === 'function') updateEau();
      sauvegarderProfil();
      genererPlanTextuel();
      const profile = getProfilData();
      const planText = document.getElementById('output-plan')?.value || '';
      return {
        profile,
        planText,
        foods: window.COACH_DATA?.totalFoods || 0,
        verified: window.COACH_DATA?.verifiedFoods || 0,
      };
    });

    fs.writeFileSync(
      path.join(reportsDir, 'xavier-profile-export.json'),
      JSON.stringify(artifact.profile, null, 2),
      'utf8'
    );
    fs.writeFileSync(path.join(reportsDir, 'xavier-plan-text.txt'), artifact.planText, 'utf8');

    // Generate client PDF via in-page exporter
    const pdfResult = await page.evaluate(async () => {
      try {
        // Intercept jsPDF save by patching
        const blobs = [];
        const Original = window.jspdf?.jsPDF || window.jsPDF;
        if (!Original && !(window.jspdf && window.jspdf.jsPDF)) {
          return { ok: false, error: 'jsPDF missing' };
        }
        await exporterPDF();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    });

    // Prefer CDP download capture if available; else regenerate via html2canvas path writing base64
    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: reportsDir,
    });
    await page.evaluate(async () => {
      if (typeof exporterPDF === 'function') await exporterPDF();
    });
    // Give download a moment
    await new Promise((r) => setTimeout(r, 4000));

    fs.writeFileSync(
      path.join(reportsDir, 'capture-summary.json'),
      JSON.stringify({
        capturedAt: new Date().toISOString(),
        url: baseUrl,
        foods: artifact.foods,
        verified: artifact.verified,
        pdfResult,
        screenshots: [
          'screenshots/desktop-1440.png',
          'screenshots/tablet-768.png',
          'screenshots/mobile-390.png',
        ],
      }, null, 2),
      'utf8'
    );
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!serveOnly && (forceRebuild || !artifactsReady())) {
    runBuild();
  }
  if (!artifactsReady()) throw new Error('Coach calculator artifacts missing');

  if (buildOnly && !capture) {
    console.log('Build complete.');
    return;
  }

  const server = await startServer();
  const baseUrl = `http://${HOST}:${PORT}/`;

  if (capture) {
    try {
      await captureScreenshots(baseUrl);
      console.log('Captures written to', screenshotsDir);
    } finally {
      server.close();
    }
    return;
  }

  // Keep serving
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
