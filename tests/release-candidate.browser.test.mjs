/**
 * Browser checks for the interactive release candidate.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RC_DIR = path.join(ROOT, 'reports', 'release-candidate');

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

let browser;
let origin;
let server;

before(async () => {
  // Ensure RC artifacts exist (deterministic rebuild, reuse screenshots/PDFs).
  if (!fs.existsSync(path.join(RC_DIR, 'index.html'))) {
    const build = spawnSync('node', ['scripts/rc-preview.mjs', '--build-only', '--skip-guide'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
    });
    assert.equal(build.status, 0);
  }
  ({ server, origin } = await startServer(RC_DIR));
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('RC logo loads with naturalWidth > 0 on main page and guides', async () => {
  const page = await browser.newPage();
  for (const rel of [
    '/',
    '/guides/kr-kinetics-landscape-fr.html',
    '/guides/kr-kinetics-landscape-en.html',
    '/guides/kr-kinetics-mobile-bilingual.html',
  ]) {
    await page.goto(`${origin}${rel}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('img', { timeout: 15000 });
    const logos = await page.$$eval('img', (imgs) => imgs.map((img) => ({
      src: img.getAttribute('src'),
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    })));
    assert.ok(logos.length > 0, `no images on ${rel}`);
    for (const logo of logos) {
      assert.equal(logo.complete, true, `${rel} ${logo.src} incomplete`);
      assert.ok(logo.naturalWidth > 0, `${rel} ${logo.src} naturalWidth=${logo.naturalWidth}`);
    }
  }
  await page.close();
});

test('RC cart adds distinct foods by foodId and supports qty/remove', async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('[data-add]', { timeout: 30000 });
  await page.click('#mode-da');
  const firstId = await page.$eval('[data-add]', (el) => el.getAttribute('data-add'));
  await page.click('[data-add]');
  await page.waitForFunction(() => (document.getElementById('cart-count')?.textContent || '').includes('1 aliments'));
  // Add a different food if available
  const buttons = await page.$$('[data-add]');
  if (buttons.length > 1) {
    await buttons[1].click();
    await page.waitForFunction(() => (document.getElementById('cart-count')?.textContent || '').includes('2 aliments'));
  }
  const details = await page.$eval('#validation-details', (el) => el.textContent);
  assert.match(details, /"foodId"/);
  assert.match(details, /"exchangeRollupId"/);
  assert.ok(details.includes(firstId));
  assert.doesNotMatch(details, /silencieux|generic group bump/i);
  await page.click('[data-remove]');
  await page.click('#btn-clear-cart');
  await page.waitForFunction(() => (document.getElementById('cart-count')?.textContent || '').includes('0 sélectionnés'));
  await page.close();
});

test('RC has no horizontal overflow at 390/768/1440 and keeps user-facing mode labels', async () => {
  const page = await browser.newPage();
  for (const width of [390, 768, 1440]) {
    await page.setViewport({ width, height: 1100 });
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#active-totals .stat', { timeout: 30000 });
    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      hasCalculActuel: document.body.innerText.includes('Calcul actuel'),
      hasApercu: document.body.innerText.includes('Aperçu personnalisé'),
      diagnosticsExists: Boolean(document.querySelector('#diagnostics')),
      diagnosticsOpen: Boolean(document.querySelector('#diagnostics')?.open),
      scenariosInsideDiagnostics: Boolean(document.querySelector('#diagnostics #scenarios')),
    }));
    assert.equal(metrics.overflow, false, `overflow at ${width}`);
    assert.equal(metrics.hasCalculActuel, true);
    assert.equal(metrics.hasApercu, true);
    assert.equal(metrics.diagnosticsExists, true);
    assert.equal(metrics.diagnosticsOpen, false);
    assert.equal(metrics.scenariosInsideDiagnostics, true);
  }
  await page.close();
});

test('official owner-approved logos are present (horizontal + monogram)', () => {
  const horizontal = path.join(ROOT, 'assets', 'logo-kr-kinetics-horizontal.png');
  const monogram = path.join(ROOT, 'assets', 'logo-kr-monogramme.png');
  const fakeSvg = path.join(ROOT, 'assets', 'kinetics-logo.svg');
  assert.equal(fs.existsSync(fakeSvg), false, 'fake assets/kinetics-logo.svg must be removed');
  assert.equal(fs.existsSync(horizontal), true);
  assert.equal(fs.existsSync(monogram), true);
  for (const pngPath of [horizontal, monogram]) {
    const png = fs.readFileSync(pngPath);
    assert.ok(png.length > 1000);
    assert.equal(png[0], 0x89);
    assert.equal(png[1], 0x50);
    assert.equal(png[2], 0x4e);
    assert.equal(png[3], 0x47);
  }
});

test('RC food list paginates the full catalog and empty cart hides fake A vs D/A deltas', async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100 });
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#food-count', { timeout: 30000 });
  const emptyDiff = await page.$eval('#diff-summary', (el) => el.textContent || '');
  assert.match(emptyDiff, /Panier vide/i);
  assert.doesNotMatch(emptyDiff, /Écart aperçu/);
  assert.equal(await page.$eval('body', (el) => el.innerHTML.includes('dominantRollup')), false);
  assert.equal(await page.$eval('body', (el) => /DM Serif Display|#991F2D|#f7f4f1/.test(el.innerHTML)), false);
  const countBefore = await page.$eval('#food-count', (el) => el.textContent || '');
  assert.match(countBefore, /catalogue exact\s*:\s*287/);
  await page.click('#btn-food-all');
  await page.waitForFunction(() => {
    const text = document.getElementById('food-count')?.textContent || '';
    return text.includes('287 / 287');
  }, { timeout: 30000 });
  const rows = await page.$$eval('#food-list .food-row [data-add]', (nodes) => nodes.length);
  assert.equal(rows, 287);
  await page.close();
});
