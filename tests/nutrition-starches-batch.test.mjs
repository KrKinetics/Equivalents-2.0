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
import { selectCnfRecord, CNF_SELECTION_ERROR_CODES } from '../src/lib/cnf-selection.mjs';
import {
  buildBatchScopeBaseline,
  checkBatchScope,
} from '../src/lib/nutrition-batch-scope.mjs';
import { auditFood } from '../src/lib/food-audit-core.mjs';
import { convertManufacturerLabelToCanonicalPortion } from '../src/lib/nutrition-batch-math.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATCH_PATH = path.join(
  ROOT,
  'src',
  'data',
  'approved-batches',
  'starches-complete-individual-validation-32-foods.json'
);
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const CNF_PATH = path.join(ROOT, 'src', 'sources', 'normalized', 'cnf-2026-foods.json');
const PRE_APPLY_PATH = path.join(
  ROOT,
  'reports',
  'batches',
  'starches-complete-individual-validation-32-foods',
  'pre-apply-payload.json'
);
const MFR_DIR = path.join(ROOT, 'src', 'sources', 'manufacturer');
const QUINOA_ID = 'feculents-cooked-quinoa';

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

function stableEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
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

test('starches batch contains 22 updates and 10 adds', () => {
  assert.equal(batch.foods.filter((f) => f.operation === 'update').length, 22);
  assert.equal(batch.foods.filter((f) => f.operation === 'add').length, 10);
  assert.equal(batch.scope.batchFoodCount, 32);
  assert.equal(batch.scope.expectedFinalFoodCount, 287);
  assert.equal(batch.scope.protectedFoodCount, 255);
  assert.equal(batch.scope.expectedFinalVerifiedCount, 287);
  assert.equal(cnfEntries.length, 31);
  assert.equal(mfrEntries.length, 1);
});

test('starches scope arithmetic and quinoa stay outside batch', () => {
  assert.equal(batch.scope.existingFoodCount + batch.scope.newFoodCount, 287);
  assert.equal(batch.scope.allowedFoodIds.length, 32);
  assert.equal(batch.scope.allowedFoodIds.includes(QUINOA_ID), false);
  assert.ok(batch.scope.protectedVerifiedFoodIds.includes(QUINOA_ID));
});

test('31 CNF foods have expectedRecordId that exists and matches selection', () => {
  const validation = validateApprovedBatch(batch, payload, { cnfFoods });
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  const cnfResolved = validation.resolved.filter((r) => r.entry.sourcePlan);
  assert.equal(cnfResolved.length, 31);
  for (const row of cnfResolved) {
    assert.ok(row.entry.sourcePlan.expectedRecordId);
    assert.equal(row.result.expectedRecordId, row.entry.sourcePlan.expectedRecordId);
    assert.equal(row.result.selectedRecordId, row.result.expectedRecordId);
    assert.ok(
      cnfFoods.some((f) => String(f.recordId) === String(row.result.expectedRecordId))
    );
  }
});

test('distinct Ezekiel manufacturer evidence exists', () => {
  assert.equal(mfrEntries.length, 1);
  const food = mfrEntries[0];
  const files = fs
    .readdirSync(MFR_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(MFR_DIR, name));
  const match = files.find((filePath) => {
    const evidence = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return evidence.linkedFoodId === food.id;
  });
  assert.ok(match, `missing evidence for ${food.id}`);
  const evidence = JSON.parse(fs.readFileSync(match, 'utf8'));
  assert.equal(evidence.officialUrl, food.manufacturerLabel.url);
  assert.equal(evidence.productUrl, food.manufacturerLabel.productUrl);
  assert.equal(evidence.smartLabelUrl, food.manufacturerLabel.url);
});

test('Ezekiel label snapshot values are exact for 34 g slice', () => {
  const food = entry('feculents-slice-ezekiel-sprouted-bread');
  const label = food.manufacturerLabel;
  assert.equal(food.canonicalPortion.amount, 1);
  assert.equal(food.canonicalPortion.unit, 'slice');
  assert.equal(food.canonicalPortion.grams, 34);
  assert.equal(label.labelServing.grams, 34);
  assert.deepEqual(label.storedForCanonicalPortion, {
    declaredKcal: 80,
    proteinG: 5.0,
    carbsG: 15.0,
    fiberG: 3.0,
    fatG: 0.5,
    saturatedFatG: 0,
    polyunsaturatedFatG: 0,
    monounsaturatedFatG: 0,
  });
  const conversion = convertManufacturerLabelToCanonicalPortion(
    label.labelNutrients,
    label.labelServing,
    food.canonicalPortion
  );
  assert.equal(conversion.factor, 1);
  assert.equal(conversion.storedRounded.declaredKcal, 80);
  assert.equal(conversion.storedRounded.proteinG, 5);
  assert.equal(conversion.storedRounded.carbsG, 15);
  assert.equal(conversion.storedRounded.fiberG, 3);
  assert.equal(conversion.storedRounded.fatG, 0.5);
});

test('three oat forms are distinct', () => {
  const ids = [
    'feculents-plain-oatmeal-uncooked',
    'feculents-rolled-oats-uncooked',
    'feculents-rolled-oats',
  ];
  const records = ids.map((id) => entry(id).sourcePlan.expectedRecordId);
  assert.equal(new Set(records).size, 3);
});

test('white and brown rice are distinct', () => {
  assert.notEqual(
    entry('feculents-cooked-rice').sourcePlan.expectedRecordId,
    entry('feculents-cooked-brown-rice').sourcePlan.expectedRecordId
  );
});

test('enriched and whole-wheat pasta are distinct', () => {
  assert.notEqual(
    entry('feculents-cooked-pasta').sourcePlan.expectedRecordId,
    entry('feculents-cooked-whole-wheat-pasta').sourcePlan.expectedRecordId
  );
});

test('potato forms and sweet potato are distinct', () => {
  const ids = [
    'feculents-mashed-potato-with-milk',
    'feculents-boiled-potato',
    'feculents-medium-sweet-potato',
  ];
  const records = ids.map((id) => entry(id).sourcePlan.expectedRecordId);
  assert.equal(new Set(records).size, 3);
});

test('corn and flour tortillas are distinct', () => {
  assert.notEqual(
    entry('feculents-corn-tortilla').sourcePlan.expectedRecordId,
    entry('feculents-flour-tortilla').sourcePlan.expectedRecordId
  );
});

test('whole wheat, sprouted, rye and Ezekiel breads are distinct', () => {
  const keys = [
    entry('feculents-slice-bread').sourcePlan.expectedRecordId,
    entry('feculents-slice-sprouted-bread').sourcePlan.expectedRecordId,
    entry('feculents-rye-bread').sourcePlan.expectedRecordId,
    entry('feculents-slice-ezekiel-sprouted-bread').manufacturerLabel.url,
  ];
  assert.equal(new Set(keys).size, 4);
});

test('chickpeas, lentils and black beans are distinct', () => {
  const records = [
    entry('feculents-cooked-legumes').sourcePlan.expectedRecordId,
    entry('feculents-cooked-beluga-lentils').sourcePlan.expectedRecordId,
    entry('feculents-cooked-black-beans').sourcePlan.expectedRecordId,
  ];
  assert.equal(new Set(records).size, 3);
});

test('eleventh add is refused', () => {
  const bad = clone(batch);
  bad.foods.push({
    ...clone(batch.foods.find((f) => f.operation === 'add')),
    id: 'feculents-extra-should-fail',
  });
  const result = validateApprovedBatch(bad, payload, { cnfFoods });
  assert.equal(result.ok, false);
});

test('modification outside batch is refused by scope check', () => {
  const baseline = buildBatchScopeBaseline(payload, batch);
  assert.equal(baseline.protectedFoodCount, 255);
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

test('quinoa remains byte-identical after apply', () => {
  const before = clone(payload.foods.find((f) => f.id === QUINOA_ID));
  assert.ok(before);
  assert.equal(before.status, 'verified');
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-starches-quinoa',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(
    stableEqual(before, result.payload.foods.find((f) => f.id === QUINOA_ID)),
    true
  );
});

test('each starches food has conversion and distinct verify transaction', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-starches-32',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.applied.length, 32);
  assert.equal(new Set(result.applied.map((a) => a.transactionId)).size, 32);
  for (const row of result.preview.foods) {
    assert.ok(row.conversion);
  }
});

test('apply in memory yields 287 foods, 33 verified starches, zero unverified', () => {
  const beforeProtected = buildBatchScopeBaseline(payload, batch);
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-starches-32-b',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.payload.foods.length, 287);
  const cat = result.payload.foods.filter((f) => f.displayCategory === 'feculents');
  assert.equal(cat.length, 33);
  assert.equal(cat.filter((f) => f.status === 'verified').length, 33);
  assert.equal(result.payload.foods.filter((f) => f.status === 'verified').length, 287);
  assert.equal(result.payload.foods.filter((f) => f.status !== 'verified').length, 0);
  const afterProtected = checkBatchScope(beforeProtected, result.payload, batch);
  assert.equal(afterProtected.ok, true);
  assert.equal(afterProtected.protectedFoodCount, 255);
  for (const add of result.applied.filter((a) => a.operation === 'add')) {
    assert.equal(add.startedUnverified, true);
  }
});

test('no open ERROR remains on applied starches foods', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-starches-32-c',
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
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'starches-dry-'));
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
  if (!fs.existsSync(PRE_APPLY_PATH) && livePayload.foods.length !== 277) {
    return;
  }
  const base =
    livePayload.foods.length === 277
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

test('live bank matches post-apply starches totals when already applied', () => {
  if (livePayload.foods.length !== 287) return;
  const cat = livePayload.foods.filter((f) => f.displayCategory === 'feculents');
  assert.equal(cat.length, 33);
  assert.equal(cat.filter((f) => f.status === 'verified').length, 33);
  assert.equal(livePayload.foods.filter((f) => f.status === 'verified').length, 287);
  assert.equal(livePayload.foods.filter((f) => f.status !== 'verified').length, 0);
  if (fs.existsSync(PRE_APPLY_PATH)) {
    const pre = JSON.parse(fs.readFileSync(PRE_APPLY_PATH, 'utf8'));
    assert.equal(
      stableEqual(
        pre.foods.find((f) => f.id === QUINOA_ID),
        livePayload.foods.find((f) => f.id === QUINOA_ID)
      ),
      true
    );
  }
});
