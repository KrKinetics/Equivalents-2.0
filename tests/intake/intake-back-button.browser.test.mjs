/**
 * Visual contract for the intake Retour button.
 * Step 1 hides it. Steps 2–4 show readable navy-on-white text.
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

function resolveChromePath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  try {
    const bundled = puppeteer.executablePath();
    if (bundled) candidates.push(bundled);
  } catch {
    /* ignore */
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
  })[ext] || 'application/octet-stream';
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end('globalThis.__COACH_CONFIG = { url: "https://example.supabase.co", publishableKey: "sb_test" };');
      return;
    }
    if (url.pathname === '/assets/auth-session.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(`export function getPortalSupabase() {
        return {
          rpc(name) {
            if (name === 'get_client_intake') {
              return Promise.resolve({
                data: {
                  organization_slug: 'kr-kinetics',
                  organization_name: 'KR Kinetics',
                  client_name: 'Alex',
                  invite_status: 'pending',
                  response_status: 'draft',
                  answers: {},
                },
                error: null,
              });
            }
            return Promise.resolve({ data: { ok: true }, error: null });
          }
        };
      }`);
      return;
    }
    let rel = url.pathname === '/' ? '/intake.html' : url.pathname;
    if (rel.startsWith('/src/')) {
      const fromSrc = path.join(root, rel.slice(1));
      if (fs.existsSync(fromSrc)) {
        res.writeHead(200, { 'Content-Type': contentType(fromSrc) });
        res.end(fs.readFileSync(fromSrc));
        return;
      }
    }
    const filePath = path.join(portal, rel.replace(/^\//, ''));
    if (!filePath.startsWith(portal) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    res.end(fs.readFileSync(filePath));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

async function assertBackVisible(page, expectedStep) {
  const state = await page.evaluate((step) => {
    const back = document.getElementById('back-button');
    const style = getComputedStyle(back);
    const active = document.querySelector('.intake-step:not(.hidden)')?.dataset.step;
    return {
      text: back.textContent.trim(),
      hiddenClass: back.classList.contains('hidden'),
      display: style.display,
      visibility: style.visibility,
      color: style.color,
      backgroundColor: style.backgroundColor,
      step: Number(active),
      label: document.getElementById('step-label')?.textContent || '',
    };
  }, expectedStep);
  assert.equal(state.text, 'Retour');
  assert.equal(state.hiddenClass, false);
  assert.notEqual(state.display, 'none');
  assert.notEqual(state.visibility, 'hidden');
  assert.notEqual(state.color, state.backgroundColor);
  assert.equal(state.step, expectedStep);
  assert.match(state.label, new RegExp(`Étape ${expectedStep}`));
}

async function currentStep(page) {
  return page.evaluate(() => Number(document.querySelector('.intake-step:not(.hidden)')?.dataset.step));
}

async function choose(page, name, value) {
  await page.evaluate((field, selected) => {
    const input = document.querySelector(`.intake-step:not(.hidden) [name="${field}"][value="${selected}"]`);
    if (!input) throw new Error(`missing ${field}=${selected}`);
    input.checked = true;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, name, value);
}

async function fillAndContinue(page, fillFn) {
  const before = await currentStep(page);
  await fillFn();
  await page.$eval('#next-button', (el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await page.click('#next-button', { delay: 20 });
  await page.waitForFunction((prev) => {
    const active = Number(document.querySelector('.intake-step:not(.hidden)')?.dataset.step);
    const error = document.getElementById('form-error');
    const blocked = error && !error.classList.contains('hidden') && error.textContent.trim();
    return active === prev + 1 || Boolean(blocked);
  }, { timeout: 5000 }, before);
  const after = await currentStep(page);
  if (after !== before + 1) {
    const message = await page.evaluate(() => document.getElementById('form-error')?.textContent || '');
    throw new Error(`expected step ${before + 1}, stayed on ${after}: ${message}`);
  }
}

let browser;
let server;
let origin;

before(async () => {
  const chrome = resolveChromePath();
  assert.ok(chrome, 'Chrome is required for the intake back-button visual contract');
  const started = await startServer();
  server = started.server;
  origin = started.origin;
  browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chrome,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function runNavigation(page) {
  await page.goto(`${origin}/intake.html?token=TEST_TOKEN`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#intake-form:not(.hidden)');

  const step1 = await page.evaluate(() => {
    const back = document.getElementById('back-button');
    return {
      text: back.textContent.trim(),
      hidden: back.classList.contains('hidden'),
      display: getComputedStyle(back).display,
    };
  });
  assert.equal(step1.text, 'Retour');
  assert.equal(step1.hidden, true);
  assert.equal(step1.display, 'none');

  await fillAndContinue(page, async () => {
    await page.type('#email', 'alex@example.com');
    await page.type('#age_years', '36');
    await page.type('#height_feet', '5');
    await page.type('#height_inches', '9');
    await page.type('#weight_lb', '183');
    await choose(page, 'objective_primary', 'Perte de masse adipeuse');
    await page.type('#objective_detail', 'Retrouver une routine réaliste.');
  });
  await assertBackVisible(page, 2);

  await fillAndContinue(page, async () => {
    await choose(page, 'activity_level', 'Modérément actif');
    await choose(page, 'work_type', 'Assis ou peu actif');
    await choose(page, 'schedule', 'Régulier');
  });
  await assertBackVisible(page, 3);

  await fillAndContinue(page, async () => {
    await choose(page, 'medications_status', 'Non');
    await choose(page, 'allergies_status', 'Non');
    await choose(page, 'restriction_status', 'Non');
    await choose(page, 'challenges', 'Manque de temps');
  });
  await assertBackVisible(page, 4);

  await page.$eval('#back-button', (el) => el.scrollIntoView({ block: 'center' }));
  await page.click('#back-button');
  await assertBackVisible(page, 3);
  await page.click('#back-button');
  await assertBackVisible(page, 2);
  await page.click('#back-button');
  const backOnOne = await page.evaluate(() => {
    const back = document.getElementById('back-button');
    return {
      hidden: back.classList.contains('hidden'),
      step: Number(document.querySelector('.intake-step:not(.hidden)')?.dataset.step),
    };
  });
  assert.equal(backOnOne.hidden, true);
  assert.equal(backOnOne.step, 1);
}

test('Retour is hidden on step 1 and readable on steps 2-4 (desktop)', async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  try {
    await runNavigation(page);
  } finally {
    await page.close();
  }
});

test('Retour stays readable on mobile while navigating back', async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  try {
    await runNavigation(page);
  } finally {
    await page.close();
  }
});
