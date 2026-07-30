import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  applyApprovedBatch,
  previewApprovedBatch,
  validateApprovedBatch,
} from '../src/lib/nutrition-batch-engine.mjs';
import {
  selectCnfRecord,
  excludesConcept,
  CNF_SELECTION_ERROR_CODES,
} from '../src/lib/cnf-selection.mjs';
import {
  buildBatchScopeBaseline,
  checkBatchScope,
} from '../src/lib/nutrition-batch-scope.mjs';
import { auditFood } from '../src/lib/food-audit-core.mjs';
import {
  convertManufacturerLabelToCanonicalPortion,
  MANUFACTURER_ERROR_CODES,
  validateManufacturerStoredAgainstConversion,
} from '../src/lib/nutrition-batch-math.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATCH_PATH = path.join(
  ROOT,
  'src',
  'data',
  'approved-batches',
  'dairy-alternatives-complete-individual-validation-29-foods.json'
);
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const CNF_PATH = path.join(ROOT, 'src', 'sources', 'normalized', 'cnf-2026-foods.json');
const PRE_APPLY_PATH = path.join(
  ROOT,
  'reports',
  'batches',
  'dairy-alternatives-complete-individual-validation-29-foods',
  'pre-apply-payload.json'
);
const MFR_DIR = path.join(ROOT, 'src', 'sources', 'manufacturer');

const batch = JSON.parse(fs.readFileSync(BATCH_PATH, 'utf8'));
const livePayload = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
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

function openErrorCodes(food) {
  return auditFood(food)
    .alerts.filter(
      (a) => a.severity === 'ERROR' && a.resolutionStatus !== 'resolved_documented'
    )
    .map((a) => a.code);
}

function entry(id) {
  return batch.foods.find((f) => f.id === id);
}

const cnfEntries = batch.foods.filter((f) => f.sourcePlan);
const mfrEntries = batch.foods.filter((f) => f.manufacturerLabel);

test('dairy batch contains 19 updates and 10 adds', () => {
  assert.equal(batch.foods.filter((f) => f.operation === 'update').length, 19);
  assert.equal(batch.foods.filter((f) => f.operation === 'add').length, 10);
  assert.equal(batch.scope.batchFoodCount, 29);
  assert.equal(batch.scope.expectedFinalFoodCount, 277);
  assert.equal(batch.scope.protectedFoodCount, 248);
  assert.equal(cnfEntries.length, 23);
  assert.equal(mfrEntries.length, 6);
});

test('dairy scope arithmetic is consistent', () => {
  assert.equal(batch.scope.existingFoodCount + batch.scope.newFoodCount, 277);
  assert.equal(batch.scope.allowedFoodIds.length, 29);
  assert.equal(batch.scope.existingFoodCount, 267);
  assert.equal(batch.scope.newFoodCount, 10);
});

test('percentage exclusions do not match nested decimals like 0.1%', () => {
  assert.equal(excludesConcept('Milk, fluid, skim, 0.1% M.F.', '1%'), false);
  assert.equal(excludesConcept('Milk, fluid, skim, 0.1% M.F.', '2%'), false);
  assert.equal(excludesConcept('Milk, fluid, partly skimmed, 2% M.F.', '1%'), false);
  assert.equal(excludesConcept('Milk, fluid, partly skimmed, 2% M.F.', '2%'), true);
  assert.equal(excludesConcept('Milk, fluid, partly skimmed, 1% M.F.', '1%'), true);
});

test('23 CNF foods have expectedRecordId that exists and matches selection', () => {
  const validation = validateApprovedBatch(batch, payload, { cnfFoods });
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  const cnfResolved = validation.resolved.filter((r) => r.entry.sourcePlan);
  assert.equal(cnfResolved.length, 23);
  for (const row of cnfResolved) {
    assert.ok(row.entry.sourcePlan.expectedRecordId);
    assert.equal(row.result.expectedRecordId, row.entry.sourcePlan.expectedRecordId);
    assert.equal(row.result.selectedRecordId, row.result.expectedRecordId);
    assert.ok(
      cnfFoods.some((f) => String(f.recordId) === String(row.result.expectedRecordId))
    );
  }
});

test('six manufacturer foods have distinct evidence files', () => {
  const paths = new Set();
  for (const food of mfrEntries) {
    const files = fs
      .readdirSync(MFR_DIR)
      .filter((name) => name.endsWith('.json'))
      .map((name) => path.join(MFR_DIR, name));
    const match = files.find((filePath) => {
      const evidence = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return evidence.linkedFoodId === food.id;
    });
    assert.ok(match, `missing evidence for ${food.id}`);
    paths.add(match);
    const evidence = JSON.parse(fs.readFileSync(match, 'utf8'));
    assert.equal(evidence.officialUrl, food.manufacturerLabel.url);
    assert.ok(Array.isArray(evidence.undeclaredNutrients));
  }
  assert.equal(paths.size, 6);
});

test('siggis keeps undeclared macros as null', () => {
  const food = entry('produits-laitiers-plain-skyr');
  const label = food.manufacturerLabel;
  assert.equal(label.labelNutrients.declaredKcal, 60);
  assert.equal(label.labelNutrients.proteinG, 12);
  for (const key of [
    'carbsG',
    'fiberG',
    'fatG',
    'saturatedFatG',
    'polyunsaturatedFatG',
    'monounsaturatedFatG',
  ]) {
    assert.equal(label.labelNutrients[key], null, key);
    assert.equal(label.storedForCanonicalPortion[key], null, key);
  }
  const conversion = convertManufacturerLabelToCanonicalPortion(
    label.labelNutrients,
    label.labelServing,
    food.canonicalPortion
  );
  assert.equal(conversion.storedRounded.carbsG, null);
  assert.ok(conversion.undeclaredNutrients.includes('carbsG'));
  const coerced = validateManufacturerStoredAgainstConversion(
    { ...conversion.storedRounded, carbsG: 0 },
    conversion
  );
  assert.equal(coerced.ok, false);
  assert.ok(
    coerced.errors.some(
      (e) => e.code === MANUFACTURER_ERROR_CODES.MANUFACTURER_UNKNOWN_COERCED_TO_ZERO
    )
  );
});

test('fairlife 240 ml to 150 ml is exact', () => {
  const food = entry('produits-laitiers-high-protein-filtered-milk');
  const conversion = convertManufacturerLabelToCanonicalPortion(
    food.manufacturerLabel.labelNutrients,
    food.manufacturerLabel.labelServing,
    food.canonicalPortion
  );
  assert.equal(conversion.factor, 150 / 240);
  assert.equal(conversion.storedRounded.declaredKcal, 75);
  assert.equal(conversion.storedRounded.proteinG, 8.1);
});

test('Core Power 414 ml to 207 ml is exact', () => {
  const food = entry('produits-laitiers-bottle-core-power-fairlife');
  const conversion = convertManufacturerLabelToCanonicalPortion(
    food.manufacturerLabel.labelNutrients,
    food.manufacturerLabel.labelServing,
    food.canonicalPortion
  );
  assert.equal(conversion.factor, 0.5);
  assert.equal(conversion.storedRounded.declaredKcal, 85);
  assert.equal(conversion.storedRounded.proteinG, 13);
});

test('Natrel Plus 250 ml to 125 ml is exact', () => {
  const food = entry('produits-laitiers-natrel-plus-2');
  const conversion = convertManufacturerLabelToCanonicalPortion(
    food.manufacturerLabel.labelNutrients,
    food.manufacturerLabel.labelServing,
    food.canonicalPortion
  );
  assert.equal(conversion.factor, 0.5);
  assert.equal(conversion.storedRounded.declaredKcal, 80);
  assert.equal(conversion.storedRounded.proteinG, 9);
});

test('Natrel chocolate 250 ml to 150 ml is exact', () => {
  const food = entry('produits-laitiers-protein-chocolate-milk');
  const conversion = convertManufacturerLabelToCanonicalPortion(
    food.manufacturerLabel.labelNutrients,
    food.manufacturerLabel.labelServing,
    food.canonicalPortion
  );
  assert.equal(conversion.factor, 150 / 250);
  assert.equal(conversion.storedRounded.declaredKcal, 90);
  assert.equal(conversion.storedRounded.proteinG, 10.8);
});

test('Greek yogurts 0%, 2% and fruit are distinct', () => {
  const greek2 = entry('produits-laitiers-greek-yogurt');
  const greek0 = entry('produits-laitiers-plain-greek-yogurt');
  const greekFruit = entry('produits-laitiers-greek-yogurt-fat-free-fruit');
  assert.notEqual(greek2.sourcePlan.expectedRecordId, greek0.sourcePlan.expectedRecordId);
  assert.notEqual(greek2.sourcePlan.expectedRecordId, greekFruit.sourcePlan.expectedRecordId);
  assert.notEqual(greek0.sourcePlan.expectedRecordId, greekFruit.sourcePlan.expectedRecordId);
});

test('plain and fruit kefir are distinct', () => {
  const plain = entry('produits-laitiers-plain-or-fruit-kefir');
  const fruit = entry('produits-laitiers-kefir-fruit-low-fat');
  assert.notEqual(plain.sourcePlan.expectedRecordId, fruit.sourcePlan.expectedRecordId);
});

test('milk variants are distinct', () => {
  const ids = [
    'produits-laitiers-skim-milk',
    'produits-laitiers-cup-1-2-milk',
    'produits-laitiers-whole-milk',
    'produits-laitiers-goat-milk-whole',
    'produits-laitiers-high-protein-filtered-milk',
    'produits-laitiers-natrel-plus-2',
  ];
  const keys = ids.map((id) => {
    const food = entry(id);
    return food.sourcePlan?.expectedRecordId || food.manufacturerLabel.url;
  });
  assert.equal(new Set(keys).size, 6);
});

test('plant beverages are distinct', () => {
  const ids = [
    'produits-laitiers-cup-plain-almond-barley-rice-beverage',
    'produits-laitiers-cup-vanilla-almond-barley-rice-beverage',
    'produits-laitiers-cup-soy-beverage',
    'produits-laitiers-soy-beverage-vanilla',
    'produits-laitiers-oat-quinoa-beverage-unsweetened',
    'produits-laitiers-rice-beverage-unsweetened',
  ];
  const records = ids.map((id) => entry(id).sourcePlan.expectedRecordId);
  assert.equal(new Set(records).size, 6);
});

test('cottage 1% and 2% are distinct', () => {
  const cottage1 = entry('produits-laitiers-cottage-cheese');
  const cottage2 = entry('produits-laitiers-cottage-cheese-2');
  assert.notEqual(cottage1.sourcePlan.expectedRecordId, cottage2.sourcePlan.expectedRecordId);
});

test('eleventh add is refused', () => {
  const bad = clone(batch);
  bad.foods.push({
    ...clone(batch.foods.find((f) => f.operation === 'add')),
    id: 'produits-laitiers-extra-should-fail',
  });
  const result = validateApprovedBatch(bad, payload, { cnfFoods });
  assert.equal(result.ok, false);
});

test('modification outside batch is refused by scope check', () => {
  const baseline = buildBatchScopeBaseline(payload, batch);
  assert.equal(baseline.protectedFoodCount, 248);
  const next = clone(payload);
  const protectedFood = next.foods.find((f) => !batch.scope.allowedFoodIds.includes(f.id));
  protectedFood.nutrients.proteinG = Number(protectedFood.nutrients.proteinG || 0) + 1;
  const check = checkBatchScope(baseline, next, batch);
  assert.equal(check.ok, false);
});

test('deletion outside batch is refused', () => {
  const baseline = buildBatchScopeBaseline(payload, batch);
  const protectedId = payload.foods.find(
    (f) => !batch.scope.allowedFoodIds.includes(f.id)
  ).id;
  const next = clone(payload);
  next.foods = next.foods.filter((f) => f.id !== protectedId);
  const check = checkBatchScope(baseline, next, batch);
  assert.equal(check.ok, false);
  assert.match(check.errors.join('\n'), /Protected food removed/);
});

test('each dairy food has conversion and distinct verify transaction', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-dairy-29',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.applied.length, 29);
  assert.equal(new Set(result.applied.map((a) => a.transactionId)).size, 29);
  for (const row of result.preview.foods) {
    assert.ok(row.conversion);
  }
});

test('apply in memory yields 277 foods, 29 verified dairy, 255 verified global', () => {
  const beforeProtected = buildBatchScopeBaseline(payload, batch);
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-dairy-29-b',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.payload.foods.length, 277);
  const cat = result.payload.foods.filter((f) => f.displayCategory === 'produits_laitiers');
  assert.equal(cat.length, 29);
  assert.equal(cat.filter((f) => f.status === 'verified').length, 29);
  assert.equal(result.payload.foods.filter((f) => f.status === 'verified').length, 255);
  const afterProtected = checkBatchScope(beforeProtected, result.payload, batch);
  assert.equal(afterProtected.ok, true);
  assert.equal(afterProtected.protectedFoodCount, 248);
  for (const add of result.applied.filter((a) => a.operation === 'add')) {
    assert.equal(add.startedUnverified, true);
  }
});

test('no open ERROR remains on applied dairy foods', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-dairy-29-c',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  for (const row of result.applied) {
    const food = result.payload.foods.find((f) => f.id === row.id);
    assert.equal(food.status, 'verified');
    assert.deepEqual(openErrorCodes(food), []);
  }
});

test('expectedRecordId nonexistent is refused', () => {
  const plan = {
    ...cnfEntries[0].sourcePlan,
    expectedRecordId: '99999999',
  };
  const selection = selectCnfRecord(cnfFoods, plan);
  assert.equal(selection.ok, false);
  assert.equal(selection.code, CNF_SELECTION_ERROR_CODES.EXPECTED_CNF_RECORD_NOT_FOUND);
});

test('dry-run CLI does not modify production food bank', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dairy-dry-'));
  const foodPath = path.join(sandbox, 'food-equivalents.json');
  const versionPath = path.join(sandbox, 'nutrition-data-version.json');
  const reportsDir = path.join(sandbox, 'reports');
  const backupsDir = path.join(sandbox, 'backups');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });
  fs.writeFileSync(foodPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.copyFileSync(path.join(ROOT, 'src', 'data', 'nutrition-data-version.json'), versionPath);
  const before = crypto.createHash('sha256').update(fs.readFileSync(foodPath)).digest('hex');
  const prodBefore = crypto.createHash('sha256').update(fs.readFileSync(DATA_PATH)).digest('hex');
  const result = runNode('scripts/nutrition-batch-apply.mjs', ['--dry-run', BATCH_PATH], {
    FOOD_DATA_PATH: foodPath,
    VERSION_DATA_PATH: versionPath,
    REPORTS_DIR: reportsDir,
    BACKUPS_DIR: backupsDir,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const after = crypto.createHash('sha256').update(fs.readFileSync(foodPath)).digest('hex');
  const prodAfter = crypto.createHash('sha256').update(fs.readFileSync(DATA_PATH)).digest('hex');
  assert.equal(after, before);
  assert.equal(prodAfter, prodBefore);
});

test('preview after apply remains reproducible against pre-apply payload', () => {
  if (!fs.existsSync(PRE_APPLY_PATH) && livePayload.foods.length !== 267) {
    return;
  }
  const base =
    livePayload.foods.length === 267
      ? livePayload
      : JSON.parse(fs.readFileSync(PRE_APPLY_PATH, 'utf8'));
  const previewA = previewApprovedBatch(batch, base, { cnfFoods });
  const previewB = previewApprovedBatch(batch, base, { cnfFoods });
  assert.equal(previewA.ok, true, previewA.errors?.join('\n'));
  assert.equal(previewB.ok, true);
  assert.equal(
    JSON.stringify(previewA.foods.map((f) => [f.id, f.selectedRecordId, f.after?.nutrients])),
    JSON.stringify(previewB.foods.map((f) => [f.id, f.selectedRecordId, f.after?.nutrients]))
  );
});

test('live bank matches post-apply dairy totals when already applied', () => {
  if (livePayload.foods.length !== 277) return;
  const cat = livePayload.foods.filter((f) => f.displayCategory === 'produits_laitiers');
  assert.equal(cat.length, 29);
  assert.equal(cat.filter((f) => f.status === 'verified').length, 29);
  assert.equal(livePayload.foods.filter((f) => f.status === 'verified').length, 255);
});
