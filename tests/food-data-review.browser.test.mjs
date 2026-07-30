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
    food.verification.datasetVersion = '1.0.0';
    api.applyFoodChange(food, {
      path: 'nutrients.proteinG',
      value: 5,
      by: 'ui-test',
    });
    return {
      status: api.getFoodStatus(food),
      verifiedAt: food.verification.verifiedAt,
      verifiedBy: food.verification.verifiedBy,
      datasetVersion: food.verification.datasetVersion,
      preserved: food.history.some((h) => h.previousVerification?.datasetVersion === '1.0.0'),
    };
  });
  assert.equal(status.status, 'unverified');
  assert.equal(status.verifiedAt, null);
  assert.equal(status.verifiedBy, null);
  assert.equal(status.datasetVersion, null);
  assert.equal(status.preserved, true);
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

test('exportCheckpoint clears dirty and writes correct hashes', async () => {
  const sequence = await page.evaluate(async () => {
    const api = window.__REVIEW_TEST__;
    const state = api.getState();
    const food = state.data.foods[2];
    state.selectedId = food.id;
    const expectedBase = state.baseDataHash;

    api.applyLiveEdit(food, 'names.fr', `${food.names.fr}*`);
    api.commitFood(food);
    const dirtyAfterEdit = state.dirty.size;

    const prompts = [];
    const originalPrompt = window.prompt;
    window.prompt = (message, defaultValue) => {
      prompts.push({ message, defaultValue });
      return 'browser-test';
    };

    let blobText = null;
    let downloadName = null;
    let objectUrlCreated = false;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;

    URL.createObjectURL = (blob) => {
      objectUrlCreated = true;
      URL.__exportReadPromise = Promise.resolve(blob.text()).then((text) => {
        blobText = text;
      });
      return 'blob:review-test-export';
    };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function clickStub() {
      downloadName = this.download;
    };

    try {
      await api.exportCheckpoint();
      if (URL.__exportReadPromise) await URL.__exportReadPromise;
    } finally {
      window.prompt = originalPrompt;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevoke;
      HTMLAnchorElement.prototype.click = originalClick;
      delete URL.__exportReadPromise;
    }

    const dirtyAfterExport = state.dirty.size;
    const lastExportHash = state.lastExportHash;
    const expectedExportHash = await api.hashFoods(state.data.foods);
    const exported = blobText ? JSON.parse(blobText) : null;

    api.applyLiveEdit(food, 'names.en', `${food.names.en}*`);
    api.commitFood(food);
    const dirtyAfterSecondEdit = state.dirty.size;

    return {
      dirtyAfterEdit,
      dirtyAfterExport,
      dirtyAfterSecondEdit,
      lastExportHash,
      expectedExportHash,
      expectedBase,
      objectUrlCreated,
      downloadName,
      prompts,
      exportBase: exported?.meta?.baseDataHash ?? null,
      exportHash: exported?.meta?.exportDataHash ?? null,
      exportedBy: exported?.meta?.exportedBy ?? null,
    };
  });

  assert.equal(sequence.dirtyAfterEdit, 1);
  assert.equal(sequence.dirtyAfterExport, 0);
  assert.equal(sequence.dirtyAfterSecondEdit, 1);
  assert.ok(sequence.lastExportHash);
  assert.equal(sequence.lastExportHash, sequence.expectedExportHash);
  assert.equal(sequence.exportHash, sequence.expectedExportHash);
  assert.equal(sequence.exportBase, sequence.expectedBase);
  assert.equal(sequence.exportedBy, 'browser-test');
  assert.equal(sequence.objectUrlCreated, true);
  assert.equal(sequence.downloadName, 'food-equivalents.corrected.json');
  assert.ok(sequence.prompts.length >= 1);
});

test('beforeunload prevents unload only when dirty', async () => {
  const result = await page.evaluate(() => {
    const api = window.__REVIEW_TEST__;
    const state = api.getState();
    const food = state.data.foods[0];

    const fire = () => {
      const event = new Event('beforeunload', { cancelable: true });
      let returnValue = undefined;
      Object.defineProperty(event, 'returnValue', {
        configurable: true,
        get() {
          return returnValue;
        },
        set(value) {
          returnValue = value;
        },
      });
      const canceled = !window.dispatchEvent(event);
      return {
        prevented: canceled || event.defaultPrevented,
        returnValueSet: returnValue !== undefined,
      };
    };

    state.dirty.clear();
    const clean = fire();

    api.applyLiveEdit(food, 'names.fr', `${food.names.fr}!`);
    api.commitFood(food);
    const dirty = fire();
    state.dirty.clear();

    return { clean, dirty };
  });

  assert.equal(result.clean.prevented, false);
  assert.equal(result.clean.returnValueSet, false);
  assert.equal(result.dirty.prevented || result.dirty.returnValueSet, true);
});

test('structural import without id is refused', async () => {
  const result = await page.evaluate(async () => {
    const api = window.__REVIEW_TEST__;
    const state = api.getState();
    const beforeCount = state.data.foods.length;
    const payload = JSON.parse(JSON.stringify(state.data));
    delete payload.foods[0].id;
    const gate = api.validateReviewImport(payload);
    return {
      ok: gate.ok,
      message: gate.message || '',
      beforeCount,
      afterCount: api.getState().data.foods.length,
    };
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /id|Import refusé/i);
  assert.equal(result.afterCount, result.beforeCount);
});

test('invalid export hash import leaves current dirty session intact', async () => {
  const result = await page.evaluate(async () => {
    const api = window.__REVIEW_TEST__;
    const state = api.getState();
    const food = state.data.foods[0];
    state.selectedId = food.id;
    api.applyLiveEdit(food, 'names.fr', `${food.names.fr}-unsaved`);
    api.commitFood(food);

    const before = {
      data: JSON.stringify(state.data),
      dirty: [...state.dirty],
      originals: [...state.originals.entries()],
      selectedId: state.selectedId,
    };
    const invalid = JSON.parse(JSON.stringify(state.data));
    invalid.meta.baseDataHash = state.baseDataHash;
    invalid.meta.exportDataHash = 'deadbeef';
    let error = null;
    try {
      await api.initFrom(invalid);
    } catch (caught) {
      error = String(caught?.message || caught);
    }
    const after = {
      data: JSON.stringify(state.data),
      dirty: [...state.dirty],
      originals: [...state.originals.entries()],
      selectedId: state.selectedId,
    };
    return { before, after, error };
  });

  assert.match(result.error, /EXPORT_HASH_MISMATCH/);
  assert.deepEqual(result.after, result.before);
});

test('re-importing an export preserves baseDataHash for the next export', async () => {
  const result = await page.evaluate(async () => {
    const api = window.__REVIEW_TEST__;
    const state = api.getState();
    const hashA = state.baseDataHash;
    const food = state.data.foods[0];

    api.applyLiveEdit(food, 'names.fr', `${food.names.fr}-B`);
    api.commitFood(food);

    const originalPrompt = window.prompt;
    window.prompt = () => 'session-1';
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    let exportedJson = null;
    URL.createObjectURL = (blob) => {
      URL.__p = blob.text().then((t) => {
        exportedJson = t;
      });
      return 'blob:test';
    };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = () => {};
    try {
      await api.exportCheckpoint();
      await URL.__p;
    } finally {
      window.prompt = originalPrompt;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      HTMLAnchorElement.prototype.click = originalClick;
    }

    const exported = JSON.parse(exportedJson);
    await api.initFrom(exported);
    const afterImportBase = api.getState().baseDataHash;

    const food2 = api.getState().data.foods[0];
    api.applyLiveEdit(food2, 'names.en', `${food2.names.en}-B2`);
    api.commitFood(food2);

    window.prompt = () => 'session-2';
    URL.createObjectURL = (blob) => {
      URL.__p = blob.text().then((t) => {
        exportedJson = t;
      });
      return 'blob:test2';
    };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = () => {};
    try {
      await api.exportCheckpoint();
      await URL.__p;
    } finally {
      window.prompt = originalPrompt;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      HTMLAnchorElement.prototype.click = originalClick;
    }

    const exported2 = JSON.parse(exportedJson);
    return {
      hashA,
      export1Base: exported.meta.baseDataHash,
      afterImportBase,
      export2Base: exported2.meta.baseDataHash,
      export1Hash: exported.meta.exportDataHash,
      export2Hash: exported2.meta.exportDataHash,
    };
  });

  assert.ok(result.hashA);
  assert.equal(result.export1Base, result.hashA);
  assert.equal(result.afterImportBase, result.hashA);
  assert.equal(result.export2Base, result.hashA);
  assert.notEqual(result.export1Hash, result.export2Hash);
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
