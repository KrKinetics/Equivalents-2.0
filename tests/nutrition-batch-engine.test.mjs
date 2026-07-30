import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'module';

import {
  applyApprovedBatch,
  previewApprovedBatch,
  validateApprovedBatch,
  convertCnfPer100gToPortion,
  convertManufacturerBottleTo100ml,
  roundMacro,
  roundKcal,
} from '../src/lib/nutrition-batch-engine.mjs';
import { selectCnfRecord } from '../src/lib/cnf-selection.mjs';
import { computeFoodsDataHash } from '../src/lib/data-hash.mjs';
import {
  buildPilotBaseline,
  checkPilotCandidateScope,
  partitionPilotFoods,
} from '../src/lib/nutrition-pilot-scope.mjs';
import { auditDataset } from '../src/lib/food-audit-core.mjs';
import { diffMaterialData } from '../src/lib/verification-integrity.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATCH_PATH = path.join(
  ROOT,
  'src',
  'data',
  'approved-batches',
  'pilot-nutrition-validation-6-foods.json'
);
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const PILOT_CONFIG_PATH = path.join(ROOT, 'src', 'data', 'nutrition-pilot-config.json');
const CNF_PATH = path.join(ROOT, 'src', 'sources', 'normalized', 'cnf-2026-foods.json');
const SELECTIONS_PATH = path.join(
  ROOT,
  'src',
  'data',
  'source-selections',
  'pilot-nutrition-validation-6-foods.json'
);

const batch = JSON.parse(fs.readFileSync(BATCH_PATH, 'utf8'));
const pilotConfig = JSON.parse(fs.readFileSync(PILOT_CONFIG_PATH, 'utf8'));
const livePayload = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const PRE_APPLY_PATH = path.join(
  ROOT,
  'reports',
  'batches',
  'pilot-nutrition-validation-6-foods',
  'pre-apply-payload.json'
);
const payload =
  livePayload.foods.length === Number(batch.scope.existingFoodCount)
    ? livePayload
    : fs.existsSync(PRE_APPLY_PATH)
      ? JSON.parse(fs.readFileSync(PRE_APPLY_PATH, 'utf8'))
      : livePayload;
const cnfFoods = JSON.parse(fs.readFileSync(CNF_PATH, 'utf8')).foods;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function runNode(script, args = [], env = {}) {
  return spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('approved batch specification validates against schema and engine', () => {
  const Ajv2020 = require('ajv/dist/2020.js');
  const addFormats = require('ajv-formats');
  const schema = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'src', 'data', 'approved-nutrition-batch.schema.json'), 'utf8')
  );
  const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.equal(validate(batch), true, JSON.stringify(validate.errors));
  const result = validateApprovedBatch(batch, payload, { cnfFoods });
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('six pilot food ids are unique and scope arithmetic is 207+1=208 with 202 protected', () => {
  const ids = batch.foods.map((f) => f.id);
  assert.equal(new Set(ids).size, 6);
  assert.equal(batch.scope.existingFoodCount, 207);
  assert.equal(batch.scope.newFoodCount, 1);
  assert.equal(batch.scope.expectedFinalFoodCount, 208);
  assert.equal(batch.scope.pilotFoodCount, 6);
  assert.equal(batch.scope.protectedFoodCount, 202);
  assert.equal(pilotConfig.protectedFoodCount, 202);
  assert.notEqual(pilotConfig.protectedFoodCount, 201);
});

test('batch adds exactly one food and refuses a second add', () => {
  assert.equal(batch.foods.filter((f) => f.operation === 'add').length, 1);
  const bad = clone(batch);
  bad.foods.push({
    ...clone(batch.foods.find((f) => f.operation === 'add')),
    id: 'fake-second-add-should-fail',
  });
  bad.scope.allowedFoodIds.push('fake-second-add-should-fail');
  bad.scope.newFoodCount = 2;
  bad.scope.expectedFinalFoodCount = 209;
  const result = validateApprovedBatch(bad, payload, { cnfFoods, pilotConfig });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /pendingAllowedAdds|outside pilot|Add not listed/);
});

test('modifying a seventh food id outside allowed scope fails candidate check', () => {
  const next = clone(payload);
  const protectedFood = next.foods.find((f) => !pilotConfig.allowedFoodIds.includes(f.id));
  protectedFood.nutrients.proteinG = Number(protectedFood.nutrients.proteinG || 0) + 1;
  const scope = checkPilotCandidateScope(payload, next, pilotConfig);
  assert.equal(scope.ok, false);
  assert.match(scope.errors.join('\n'), /Protected food modified/);
});

test('CNF selection picks approved records and excludes frozen/roasted/raw chicken variants', () => {
  const expected = {
    'fruits-blueberries': '1705',
    'noix-graines-almonds': '2534',
    'feculents-cooked-quinoa': '5917',
    'viandes-volaille-chicken-breast': '842',
  };
  for (const entry of batch.foods.filter((f) => f.sourcePlan?.adapter === 'cnf_2026')) {
    const selection = selectCnfRecord(cnfFoods, entry.sourcePlan);
    assert.equal(selection.ok, true, entry.id);
    assert.equal(String(selection.selected.recordId), expected[entry.id], entry.id);
    const desc = String(selection.selected.descriptionEn || '').toLowerCase();
    for (const banned of entry.sourcePlan.mustNotContainConcepts) {
      if (banned === 'skin' || banned === 'roasted' || banned === 'blanched') continue;
      assert.equal(desc.includes(banned), false, `${entry.id} contains ${banned}`);
    }
  }
  assert.ok(fs.existsSync(SELECTIONS_PATH));
  const saved = JSON.parse(fs.readFileSync(SELECTIONS_PATH, 'utf8'));
  for (const [foodId, recordId] of Object.entries(expected)) {
    const row = saved.selections.find((s) => s.foodId === foodId);
    assert.equal(String(row.recordId), recordId);
  }
});

test('gram and fairlife conversions plus rounding rules are exact', () => {
  assert.equal(roundMacro(0.04), 0);
  assert.equal(roundMacro(0.05), 0.1);
  assert.equal(roundKcal(55.555), 56);
  const cnf = convertCnfPer100gToPortion(
    {
      energy_kcal: 57,
      protein_g: 0.74,
      carbohydrate_g: 14.49,
      fibre_g: 2.4,
      total_fat_g: 0.33,
      saturated_fat_g: 0.028,
      polyunsaturated_fat_g: 0.146,
      monounsaturated_fat_g: 0.047,
    },
    110
  );
  assert.equal(cnf.storedRounded.declaredKcal, 63);
  assert.equal(cnf.storedRounded.proteinG, 0.8);
  assert.equal(cnf.formula.includes('110'), true);

  const fairlife = convertManufacturerBottleTo100ml(
    {
      declaredKcal: 230,
      proteinG: 42,
      carbsG: 9,
      fiberG: 2,
      fatG: 3.5,
      saturatedFatG: 2,
    },
    414
  );
  assert.equal(fairlife.storedRounded.declaredKcal, 56);
  assert.equal(fairlife.storedRounded.proteinG, 10.1);
  assert.equal(fairlife.storedRounded.carbsG, 2.2);
  assert.equal(fairlife.storedRounded.fiberG, 0.5);
  assert.equal(fairlife.storedRounded.fatG, 0.8);
  assert.equal(fairlife.storedRounded.saturatedFatG, 0.5);
});

test('preview contains six foods and preserves source values', () => {
  const preview = previewApprovedBatch(batch, payload, { cnfFoods });
  assert.equal(preview.ok, true, preview.errors?.join('\n'));
  assert.equal(preview.foods.length, 6);
  for (const row of preview.foods) {
    assert.ok(row.conversion);
    if (row.operation !== 'add') assert.ok(row.before);
    assert.ok(row.after?.source?.type);
  }
});

test('apply (in memory) yields 208 foods, verifies all six, keeps 202 protected identical', () => {
  const beforeProtected = buildPilotBaseline(payload.foods, pilotConfig.allowedFoodIds);
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    pilotConfig,
    datasetVersion: 'test-pilot-6',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.payload.foods.length, 208);
  const { pilotFoods, protectedFoods } = partitionPilotFoods(
    result.payload.foods,
    pilotConfig.allowedFoodIds
  );
  assert.equal(pilotFoods.length, 6);
  assert.equal(protectedFoods.length, 202);
  const afterProtected = buildPilotBaseline(result.payload.foods, pilotConfig.allowedFoodIds);
  assert.equal(afterProtected.protectedFoodsDataHash, beforeProtected.protectedFoodsDataHash);
  assert.equal(
    afterProtected.protectedFoodsNutritionHash,
    beforeProtected.protectedFoodsNutritionHash
  );

  const vanilla = result.payload.foods.find(
    (f) => f.id === 'autres-sources-proteinees-core-power-fairlife-elite-vanilla-42g'
  );
  assert.ok(vanilla);
  assert.equal(vanilla.status, 'verified');
  assert.ok(vanilla.history.some((h) => h.action === 'create'));
  assert.ok(vanilla.history.some((h) => h.action === 'verify' && h.transactionId));

  for (const food of pilotFoods) {
    assert.equal(food.status, 'verified');
    const audited = auditDataset([food]);
    const item = audited.items?.[0];
    assert.equal(item?.errorCount ?? -1, 0, food.id);
    assert.ok(food.history.some((h) => h.action === 'verify' && h.transactionId));
  }

  const reopened = clone(result.payload);
  for (const food of reopened.foods) {
    if (!pilotConfig.allowedFoodIds.includes(food.id)) continue;
    assert.equal(food.status, 'verified');
  }

  const materialCopy = clone(vanilla);
  materialCopy.nutrients.proteinG = 99;
  const material = diffMaterialData(vanilla, materialCopy);
  assert.ok(Array.isArray(material) && material.length > 0);
});

test('dry-run CLI does not modify production food bank', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-dry-'));
  const foodPath = path.join(sandbox, 'food-equivalents.json');
  const versionPath = path.join(sandbox, 'nutrition-data-version.json');
  const reportsDir = path.join(sandbox, 'reports');
  const backupsDir = path.join(sandbox, 'backups');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });
  fs.writeFileSync(foodPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.copyFileSync(
    path.join(ROOT, 'src', 'data', 'nutrition-data-version.json'),
    versionPath
  );
  const before = crypto.createHash('sha256').update(fs.readFileSync(foodPath)).digest('hex');
  const prodBefore = crypto.createHash('sha256').update(fs.readFileSync(DATA_PATH)).digest('hex');
  const result = runNode(
    'scripts/nutrition-batch-apply.mjs',
    ['--dry-run', BATCH_PATH],
    {
      FOOD_DATA_PATH: foodPath,
      VERSION_DATA_PATH: versionPath,
      REPORTS_DIR: reportsDir,
      BACKUPS_DIR: backupsDir,
      NUTRITION_PILOT_CONFIG_PATH: PILOT_CONFIG_PATH,
    }
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const after = crypto.createHash('sha256').update(fs.readFileSync(foodPath)).digest('hex');
  const prodAfter = crypto.createHash('sha256').update(fs.readFileSync(DATA_PATH)).digest('hex');
  assert.equal(after, before);
  assert.equal(prodAfter, prodBefore);
});

test('future batch using same engine validates without code changes', () => {
  const future = clone(batch);
  future.batchId = 'future-mini-batch';
  future.foods = [clone(batch.foods[0])];
  future.scope = {
    existingFoodCount: payload.foods.length,
    newFoodCount: 0,
    expectedFinalFoodCount: payload.foods.length,
    pilotFoodCount: 1,
    protectedFoodCount: payload.foods.length - 1,
    allowedFoodIds: [future.foods[0].id],
  };
  const result = validateApprovedBatch(future, payload, { cnfFoods });
  assert.equal(result.ok, true, result.errors.join('\n'));
  const preview = previewApprovedBatch(future, payload, { cnfFoods });
  assert.equal(preview.ok, true);
  assert.equal(preview.foods.length, 1);
});
