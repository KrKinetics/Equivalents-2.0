/**
 * Chromium checks for motivation questionnaire controls and the back button.
 * Skips when local Chrome/puppeteer is unavailable.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const portal = path.join(root, 'coach-portal');

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
  })[ext] || 'application/octet-stream';
}

const FIXTURE = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="./assets/portal.css">
</head>
<body class="intake-page motivation-page" data-brand="kr">
  <main class="intake-shell">
    <form class="intake-card">
      <div class="field-group">
        <label>Question Likert</label>
        <fieldset class="motivation-likert">
          <div class="motivation-likert-scale">
            ${[1, 2, 3, 4, 5].map((n) => `
              <label class="motivation-likert-opt">
                <input type="radio" name="LIKERT_Q" value="${n}">
                <span class="motivation-likert-n">${n}</span>
              </label>
            `).join('')}
          </div>
        </fieldset>
        <fieldset class="motivation-choices">
          <label class="motivation-choice-card" for="obs-0">
            <input id="obs-0" type="checkbox" name="NUT_OBS_01" value="Manque de temps">
            <span>Manque de temps pour préparer des repas</span>
          </label>
        </fieldset>
      </div>
      <div class="intake-actions">
        <button id="back-button" type="button" class="motivation-btn-back" aria-label="Précédent">← Précédent</button>
        <button id="next-button" type="button" class="motivation-btn-next" aria-label="Suivant">Suivant →</button>
      </div>
    </form>
  </main>
</body>
</html>`;

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/' || url.pathname === '/motivation-ui.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(FIXTURE);
      return;
    }
    const rel = url.pathname.replace(/^\//, '');
    const abs = path.normalize(path.join(portal, rel));
    if (!abs.startsWith(portal) || !fs.existsSync(abs)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(abs) });
    fs.createReadStream(abs).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

let server;
let origin;
let browser;
let puppeteerReady = true;

before(async () => {
  try {
    ({ server, origin } = await startServer());
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  } catch {
    puppeteerReady = false;
  }
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('Chromium shows a visible Précédent button and compact radios', { skip: !puppeteerReady }, async () => {
  if (!browser) {
    puppeteerReady = false;
    return;
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto(`${origin}/motivation-ui.html`, { waitUntil: 'networkidle0' });
  const metrics = await page.evaluate(() => {
    const back = document.getElementById('back-button');
    const radio = document.querySelector('.motivation-likert input[type="radio"]');
    const checkbox = document.querySelector('.motivation-choices input[type="checkbox"]');
    const backStyle = getComputedStyle(back);
    const radioBox = radio.getBoundingClientRect();
    const checkboxBox = checkbox.getBoundingClientRect();
    return {
      backText: back.textContent.trim(),
      backColor: backStyle.color,
      backBg: backStyle.backgroundColor,
      radioWidth: radioBox.width,
      checkboxWidth: checkboxBox.width,
      optHeight: document.querySelector('.motivation-likert-opt').getBoundingClientRect().height,
      scrollOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      likertCount: document.querySelectorAll('.motivation-likert-opt').length,
    };
  });
  assert.equal(metrics.backText, '← Précédent');
  assert.notEqual(metrics.backColor, metrics.backBg);
  assert.ok(metrics.radioWidth > 0 && metrics.radioWidth < 40, String(metrics.radioWidth));
  assert.ok(metrics.checkboxWidth > 0 && metrics.checkboxWidth < 40, String(metrics.checkboxWidth));
  assert.ok(metrics.optHeight >= 44, String(metrics.optHeight));
  assert.equal(metrics.likertCount, 5);
  assert.equal(metrics.scrollOverflow, false);
  await page.close();
});
