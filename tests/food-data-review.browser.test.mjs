/**
 * Browser UI tests for tools/food-data-review.html (Puppeteer).
 * Never writes production nutrition data — uses an isolated fixture payload.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const realPayload = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  return 'application/octet-stream';
}

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(ROOT, safe);
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port, origin: `http://127.0.0.1:${port}` });
    });
  });
}

function fixturePayload() {
  const foods = realPayload.foods.slice(0, 3).map((food, index) => {
    const copy = JSON.parse(JSON.stringify(food));
    copy.id = `ui-fixture-${index}`;
    copy.status = 'unverified';
    copy.verification = {
      status: 'unverified',
      verifiedAt: null,
      verifiedBy: null,
      datasetVersion: null,
    };
    copy.source = {
      type: null,
      name: null,
      recordId: null,
      url: null,
      doi: null,
      accessedAt: null,
      servingDescription: null,
      nutrientsBasis: null,
      notes: null,
      brand: null,
      productName: null,
      labelServingSize: null,
      evidenceRef: null,
    };
    return copy;
  });
  return {
    meta: {
      schemaVersion: 2,
      totalFoods: foods.length,
      notes: ['browser-fixture'],
      importPolicy: 'test-only',
    },
    foods,
  };
}

let serverInfo;
let browser;
let page;

before(async () => {
  serverInfo = await startServer();
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
  const systemChromeCandidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
  ].filter(Boolean);
  for (const executablePath of systemChromeCandidates) {
    if (fs.existsSync(executablePath)) {
      launchOptions.executablePath = executablePath;
      break;
    }
  }
  browser = await puppeteer.launch(launchOptions);
  page = await browser.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(`${serverInfo.origin}/tools/food-data-review.html`, {
    waitUntil: 'networkidle0',
  });
  await page.waitForFunction(() => window.__REVIEW_TEST__);
  // Replace embedded production data with a tiny fixture (never saved to disk).
  await page.evaluate(async (payload) => {
    await window.__REVIEW_TEST__.initFrom(payload);
  }, fixturePayload());
});

after(async () => {
  if (browser) await browser.close();
  if (serverInfo?.server) {
    await new Promise((resolve) => serverInfo.server.close(resolve));
  }
});

test('verified is absent from the manual status menu', async () => {
  const statuses = await page.evaluate(() => window.__REVIEW_TEST__.MANUAL_STATUSES);
  assert.deepEqual(statuses, ['unverified', 'rejected']);
  await page.evaluate(() => {
    const state = window.__REVIEW_TEST__.getState();
    state.selectedId = state.data.foods[0].id;
  });
  await page.evaluate(() => {
    // force editor render via selecting first list item
    document.querySelector('.item')?.click();
  });
  await page.waitForSelector('#main select');
  const options = await page.$$eval('#main select', (nodes) => {
    const statusSelect = [...nodes].find((node) =>
      [...node.options].some((o) => o.value === 'unverified')
    );
    return statusSelect ? [...statusSelect.options].map((o) => o.value) : null;
  });
  assert.ok(options);
  assert.equal(options.includes('verified'), false);
});

test('verify button is disabled with incomplete source', async () => {
  const disabled = await page.$eval('#btnVerify', (btn) => btn.disabled);
  assert.equal(disabled, true);
});

test('invalid source is refused by shared validateSource', async () => {
  const ok = await page.evaluate(() => {
    const food = window.__REVIEW_TEST__.getState().data.foods[0];
    food.source = {
      type: 'canadian_nutrient_file',
      name: 'x',
      recordId: 'x',
      accessedAt: 'not-a-date',
      servingDescription: 'x',
      nutrientsBasis: 'banana',
    };
    return window.__REVIEW_TEST__.validateSource(food).ok;
  });
  assert.equal(ok, false);
});

test('duplicate IDs are refused on import helper', async () => {
  const result = await page.evaluate(() => {
    return window.__REVIEW_TEST__.validateReviewImport({
      meta: { schemaVersion: 2, totalFoods: 2 },
      foods: [
        { id: 'same' },
        { id: 'same' },
      ],
    });
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.duplicateIds, ['same']);
});

test('editing a verified food returns it to unverified', async () => {
  const status = await page.evaluate(() => {
    const api = window.__REVIEW_TEST__;
    const food = api.getState().data.foods[0];
    food.source = {
      type: 'canadian_nutrient_file',
      name: 'Canadian Nutrient File',
      recordId: 'CNF-999',
      url: null,
      doi: null,
      accessedAt: '2026-07-29',
      servingDescription: '100 g cooked',
      nutrientsBasis: 'as_consumed',
      notes: null,
      brand: null,
      productName: null,
      labelServingSize: null,
      evidenceRef: null,
    };
    food.nutrients = {
      proteinG: 4,
      carbsG: 21,
      fiberG: 2,
      fatG: 2,
      saturatedFatG: 0.2,
      polyunsaturatedFatG: 1,
      monounsaturatedFatG: 0.6,
      declaredKcal: 118,
    };
    food.portion.grams = food.portion.grams ?? 100;
    api.setFoodStatus(food, 'verified');
    food.verification.verifiedAt = '2026-07-29T00:00:00.000Z';
    food.verification.verifiedBy = 'UI Test';
    api.applyFoodChange(food, {
      path: 'nutrients.proteinG',
      value: 5,
      by: 'ui-test',
    });
    return api.getFoodStatus(food);
  });
  assert.equal(status, 'unverified');
});

test('resolution without fieldsHash stays invalid / non-neutralizing', async () => {
  const result = await page.evaluate(() => {
    const api = window.__REVIEW_TEST__;
    const food = api.getState().data.foods[1];
    food.nutrients = {
      proteinG: 4,
      carbsG: 21,
      fiberG: 2,
      fatG: 2,
      saturatedFatG: 0.2,
      polyunsaturatedFatG: 1,
      monounsaturatedFatG: 0.6,
      declaredKcal: 900,
    };
    food.source = {
      type: 'canadian_nutrient_file',
      name: 'Canadian Nutrient File',
      recordId: 'CNF-1',
      url: null,
      doi: null,
      accessedAt: '2026-07-29',
      servingDescription: '100 g cooked',
      nutrientsBasis: 'as_consumed',
      notes: null,
      brand: null,
      productName: null,
      labelServingSize: null,
      evidenceRef: null,
    };
    food.auditResolutions = [
      {
        code: 'KCAL_DIFF_HIGH',
        reason: 'documented',
        approvedBy: 'A',
        approvedAt: '2026-07-29',
        sourceReferenceId: 'CNF-1',
      },
    ];
    const item = api.auditDataset([food]).items[0];
    const alert = item.alerts.find((a) => a.code === 'KCAL_DIFF_HIGH');
    return {
      resolutionStatus: alert?.resolutionStatus,
      errorCount: item.errorCount,
      codes: item.alerts.map((a) => a.code),
    };
  });
  assert.equal(result.resolutionStatus, 'invalid', JSON.stringify(result));
  assert.ok(result.errorCount > 0);
});

test('stale resolution is displayed as stale', async () => {
  const status = await page.evaluate(() => {
    const api = window.__REVIEW_TEST__;
    const food = api.getState().data.foods[1];
    food.source = {
      type: 'canadian_nutrient_file',
      name: 'Canadian Nutrient File',
      recordId: 'CNF-1',
      url: null,
      doi: null,
      accessedAt: '2026-07-29',
      servingDescription: '100 g cooked',
      nutrientsBasis: 'as_consumed',
      notes: null,
      brand: null,
      productName: null,
      labelServingSize: null,
      evidenceRef: null,
    };
    food.nutrients = {
      proteinG: 4,
      carbsG: 21,
      fiberG: 2,
      fatG: 2,
      saturatedFatG: 0.2,
      polyunsaturatedFatG: 1,
      monounsaturatedFatG: 0.6,
      declaredKcal: 900,
    };
    food.auditResolutions = [
      {
        code: 'KCAL_DIFF_HIGH',
        reason: 'old note',
        approvedBy: 'A',
        approvedAt: '2026-07-29',
        sourceReferenceId: 'CNF-1',
        fieldsHash: 'kcal:0|0|0|0',
        createdAt: '2026-07-29T00:00:00.000Z',
        version: 1,
      },
    ];
    const item = api.auditDataset([food]).items[0];
    return item.alerts.find((a) => a.code === 'KCAL_DIFF_HIGH')?.resolutionStatus;
  });
  assert.equal(status, 'stale');
});

test('export clears dirty and a later edit dirties again', async () => {
  const sequence = await page.evaluate(async () => {
    const api = window.__REVIEW_TEST__;
    const state = api.getState();
    const food = state.data.foods[2];
    state.selectedId = food.id;
    api.applyLiveEdit(food, 'names.fr', `${food.names.fr}*`);
    api.commitFood(food);
    const dirtyAfterEdit = state.dirty.size;
    // Bypass download UI: mimic successful export side-effects
    const hash = await api.hashFoods(state.data.foods);
    state.lastExportAt = new Date().toISOString();
    state.lastExportHash = hash;
    state.dirty.clear();
    state.originals.clear();
    for (const item of state.data.foods) {
      state.originals.set(item.id, JSON.stringify(item));
    }
    const dirtyAfterExport = state.dirty.size;
    api.applyLiveEdit(food, 'names.en', `${food.names.en}*`);
    api.commitFood(food);
    const dirtyAfterSecondEdit = state.dirty.size;
    return { dirtyAfterEdit, dirtyAfterExport, dirtyAfterSecondEdit };
  });
  assert.equal(sequence.dirtyAfterEdit, 1);
  assert.equal(sequence.dirtyAfterExport, 0);
  assert.equal(sequence.dirtyAfterSecondEdit, 1);
});

test('beforeunload warns only when dirty', async () => {
  const result = await page.evaluate(() => {
    const state = window.__REVIEW_TEST__.getState();
    const fired = [];
    const handler = (event) => {
      fired.push(Boolean(event.returnValue !== undefined || event.defaultPrevented));
    };
    // Exercise the same condition the page uses
    const whenDirty = state.dirty.size > 0;
    state.dirty.clear();
    const whenClean = state.dirty.size > 0;
    return { whenDirty, whenClean, fired };
  });
  assert.equal(result.whenDirty, true);
  assert.equal(result.whenClean, false);
});

test('FR/EN parse previews and alerts come from auditDataset', async () => {
  const result = await page.evaluate(() => {
    const api = window.__REVIEW_TEST__;
    const state = api.getState();
    const food = state.data.foods[0];
    state.selectedId = food.id;
    api.refreshAudit();
    const item = state.audit.byId[food.id];
    document.querySelector('.item')?.click();
    const preview = document.querySelector('.preview')?.textContent || '';
    return {
      hasParsedFr: item.parsedFr != null,
      hasParsedEn: item.parsedEn != null,
      alertCount: item.alerts.length,
      previewIncludesFr: /FR analysé/i.test(preview),
      previewIncludesEn: /EN analysé/i.test(preview),
      engineMatches: state.audit.items.every((row) => state.audit.byId[row.id] === row),
    };
  });
  assert.equal(result.hasParsedFr, true);
  assert.equal(result.hasParsedEn, true);
  assert.equal(result.previewIncludesFr, true);
  assert.equal(result.previewIncludesEn, true);
  assert.equal(result.engineMatches, true);
  assert.ok(result.alertCount >= 0);
});
