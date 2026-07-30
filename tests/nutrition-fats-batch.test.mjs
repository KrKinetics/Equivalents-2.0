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
  convertManufacturerLabelToCanonicalPortion,
} from '../src/lib/nutrition-batch-engine.mjs';
import { selectCnfRecord, CNF_SELECTION_ERROR_CODES } from '../src/lib/cnf-selection.mjs';
import {
  buildBatchScopeBaseline,
  checkBatchScope,
} from '../src/lib/nutrition-batch-scope.mjs';
import { auditFood } from '../src/lib/food-audit-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATCH_PATH = path.join(
  ROOT,
  'src',
  'data',
  'approved-batches',
  'fats-complete-individual-validation-23-foods.json'
);
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const CNF_PATH = path.join(ROOT, 'src', 'sources', 'normalized', 'cnf-2026-foods.json');
const PRE_APPLY_PATH = path.join(
  ROOT,
  'reports',
  'batches',
  'fats-complete-individual-validation-23-foods',
  'pre-apply-payload.json'
);
const MCT_EVIDENCE_PATH = path.join(
  ROOT,
  'src',
  'sources',
  'manufacturer',
  'now-foods-mct-oil-liquid.json'
);

const batch = JSON.parse(fs.readFileSync(BATCH_PATH, 'utf8'));
const livePayload = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const payload =
  livePayload.foods.length === Number(batch.scope.existingFoodCount)
    ? livePayload
    : fs.existsSync(PRE_APPLY_PATH)
      ? JSON.parse(fs.readFileSync(PRE_APPLY_PATH, 'utf8'))
      : livePayload;
const cnfFoods = JSON.parse(fs.readFileSync(CNF_PATH, 'utf8')).foods;

const OIL_IDS = [
  'matieres-grasses-vegetable-oil',
  'matieres-grasses-canola-oil',
  'matieres-grasses-peanut-oil',
  'matieres-grasses-avocado-oil',
  'matieres-grasses-virgin-coconut-oil',
];
const CHEESE_IDS = [
  'matieres-grasses-cheddar-mozzarella-cream-cheese',
  'matieres-grasses-mozzarella-cheese',
  'matieres-grasses-cream-cheese-plain',
];
const BUTTER_IDS = [
  'matieres-grasses-non-hydrogenated-margarine-or-butter',
  'matieres-grasses-unsalted-butter',
  'matieres-grasses-non-hydrogenated-canola-margarine',
];

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

test('fats batch contains 13 updates and 10 adds', () => {
  assert.equal(batch.foods.filter((f) => f.operation === 'update').length, 13);
  assert.equal(batch.foods.filter((f) => f.operation === 'add').length, 10);
  assert.equal(batch.scope.batchFoodCount, 23);
  assert.equal(batch.scope.expectedFinalFoodCount, 237);
  assert.equal(batch.scope.protectedFoodCount, 214);
  assert.equal(batch.scope.newFoodCount, 10);
});

test('fats batch scope arithmetic and allowed ids', () => {
  assert.equal(batch.scope.existingFoodCount + batch.scope.newFoodCount, 237);
  assert.equal(batch.scope.allowedFoodIds.length, 23);
  assert.equal(new Set(batch.foods.map((f) => f.id)).size, 23);
});

test('22 CNF foods have expectedRecordId that exists and matches selection', () => {
  const cnfEntries = batch.foods.filter((f) => f.sourcePlan);
  assert.equal(cnfEntries.length, 22);
  const validation = validateApprovedBatch(batch, payload, { cnfFoods });
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  for (const row of validation.resolved.filter((r) => r.entry.sourcePlan)) {
    assert.ok(row.entry.sourcePlan.expectedRecordId);
    assert.equal(row.result.expectedRecordId, row.entry.sourcePlan.expectedRecordId);
    assert.equal(row.result.selectedRecordId, row.result.expectedRecordId);
    assert.ok(
      cnfFoods.some((f) => String(f.recordId) === String(row.result.expectedRecordId))
    );
  }
});

test('olive, canola, peanut, avocado and coconut oils are distinct cards', () => {
  const records = OIL_IDS.map((id) => {
    const entry = batch.foods.find((f) => f.id === id);
    assert.ok(entry, id);
    return entry.sourcePlan.expectedRecordId;
  });
  assert.equal(new Set(records).size, 5);
});

test('cheddar, mozzarella and cream cheese are distinct cards', () => {
  const records = CHEESE_IDS.map((id) => batch.foods.find((f) => f.id === id).sourcePlan.expectedRecordId);
  assert.equal(new Set(records).size, 3);
  assert.match(
    batch.foods.find((f) => f.id === 'matieres-grasses-cheddar-mozzarella-cream-cheese')
      .lockedIdentity.fr,
    /Cheddar/i
  );
});

test('salted butter, unsalted butter and margarine are distinct', () => {
  const entries = BUTTER_IDS.map((id) => batch.foods.find((f) => f.id === id));
  assert.match(entries[0].lockedIdentity.fr, /Beurre salé/i);
  assert.match(entries[1].lockedIdentity.fr, /sans sel|non sal/i);
  assert.match(entries[2].lockedIdentity.fr, /Margarine/i);
  assert.equal(new Set(entries.map((e) => e.sourcePlan.expectedRecordId)).size, 3);
});

test('dark chocolates 70-85 and 60-69 use distinct CNF records', () => {
  const dark70 = batch.foods.find((f) => f.id === 'matieres-grasses-square-dark-chocolate-70');
  const dark60 = batch.foods.find((f) => f.id === 'matieres-grasses-dark-chocolate-60-69');
  assert.notEqual(dark70.sourcePlan.expectedRecordId, dark60.sourcePlan.expectedRecordId);
  assert.equal(dark70.sourcePlan.expectedRecordId, '6672');
  assert.equal(dark60.sourcePlan.expectedRecordId, '6671');
});

test('black and green olives use distinct CNF records', () => {
  const black = batch.foods.find((f) => f.id === 'matieres-grasses-olives-1-6-2-cm');
  const green = batch.foods.find((f) => f.id === 'matieres-grasses-green-olives');
  assert.notEqual(black.sourcePlan.expectedRecordId, green.sourcePlan.expectedRecordId);
});

test('MCT uses manufacturer evidence and not CNF coconut oil', () => {
  const mct = batch.foods.find((f) => f.id === 'matieres-grasses-mct-oil');
  const coconut = batch.foods.find((f) => f.id === 'matieres-grasses-virgin-coconut-oil');
  assert.ok(mct.manufacturerLabel);
  assert.equal(mct.sourcePlan, undefined);
  assert.notEqual(mct.manufacturerLabel.url, coconut.sourcePlan.expectedRecordId);
  assert.match(mct.manufacturerLabel.url, /nowfoods\.com/i);
  assert.equal(coconut.sourcePlan.expectedRecordId, '420');
  assert.ok(fs.existsSync(MCT_EVIDENCE_PATH));
  const evidence = JSON.parse(fs.readFileSync(MCT_EVIDENCE_PATH, 'utf8'));
  assert.equal(evidence.linkedFoodId, 'matieres-grasses-mct-oil');
  assert.equal(evidence.officialUrl, mct.manufacturerLabel.url);
  assert.notEqual(String(evidence.officialUrl), '420');
});

test('MCT conversion 15 ml to 7.5 ml yields 65 kcal and 7 g fat', () => {
  const mct = batch.foods.find((f) => f.id === 'matieres-grasses-mct-oil');
  const conversion = convertManufacturerLabelToCanonicalPortion(
    mct.manufacturerLabel.labelNutrients,
    mct.manufacturerLabel.labelServing.amount,
    mct.canonicalPortion.amount
  );
  assert.equal(conversion.storedRounded.declaredKcal, 65);
  assert.equal(conversion.storedRounded.fatG, 7);
  assert.equal(mct.manufacturerLabel.storedForCanonicalPortion.declaredKcal, 65);
  assert.equal(mct.manufacturerLabel.storedForCanonicalPortion.fatG, 7);
});

test('eleventh add is refused', () => {
  const bad = clone(batch);
  bad.foods.push({
    ...clone(batch.foods.find((f) => f.operation === 'add')),
    id: 'matieres-grasses-extra-should-fail',
  });
  const result = validateApprovedBatch(bad, payload, { cnfFoods });
  assert.equal(result.ok, false);
  assert.match(
    result.errors.join('\n'),
    /outside allowed scope|newFoodCount mismatch|Food id outside/
  );
});

test('modification outside batch is refused by scope check', () => {
  const baseline = buildBatchScopeBaseline(payload, batch);
  assert.equal(baseline.protectedFoodCount, 214);
  const next = clone(payload);
  const protectedFood = next.foods.find((f) => !batch.scope.allowedFoodIds.includes(f.id));
  protectedFood.nutrients.proteinG = Number(protectedFood.nutrients.proteinG || 0) + 1;
  const check = checkBatchScope(baseline, next, batch);
  assert.equal(check.ok, false);
  assert.match(check.errors.join('\n'), /Protected foods hash mismatch|hash mismatch/);
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

test('each fats food has conversion and distinct verify transaction', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-fats-23',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.applied.length, 23);
  assert.equal(new Set(result.applied.map((a) => a.transactionId)).size, 23);
  for (const row of result.preview.foods) {
    assert.ok(row.conversion);
  }
});

test('apply in memory yields 237 foods, 23 verified fats, 128 verified global', () => {
  const beforeProtected = buildBatchScopeBaseline(payload, batch);
  const protectedSample = clone(
    payload.foods.find((f) => !batch.scope.allowedFoodIds.includes(f.id))
  );
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-fats-23-b',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.payload.foods.length, 237);
  const fats = result.payload.foods.filter((f) => f.displayCategory === 'matieres_grasses');
  assert.equal(fats.length, 23);
  assert.equal(fats.filter((f) => f.status === 'verified').length, 23);
  assert.equal(result.payload.foods.filter((f) => f.status === 'verified').length, 128);
  const afterSample = result.payload.foods.find((f) => f.id === protectedSample.id);
  assert.equal(stableEqual(protectedSample, afterSample), true);
  const afterProtected = checkBatchScope(beforeProtected, result.payload, batch);
  assert.equal(afterProtected.ok, true);
  assert.equal(afterProtected.protectedFoodCount, 214);
  for (const add of result.applied.filter((a) => a.operation === 'add')) {
    assert.equal(add.startedUnverified, true);
  }
  const mct = result.payload.foods.find((f) => f.id === 'matieres-grasses-mct-oil');
  assert.equal(mct.source.type, 'manufacturer_website');
  assert.match(mct.source.url, /nowfoods\.com/i);
  assert.equal(mct.nutrients.declaredKcal, 65);
  assert.equal(mct.nutrients.fatG, 7);
  assert.notEqual(mct.source.recordId, '420');
});

test('no open ERROR remains on applied fats foods', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-fats-23-c',
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
    ...batch.foods.find((f) => f.sourcePlan).sourcePlan,
    expectedRecordId: '99999999',
  };
  const selection = selectCnfRecord(cnfFoods, plan);
  assert.equal(selection.ok, false);
  assert.equal(selection.code, CNF_SELECTION_ERROR_CODES.EXPECTED_CNF_RECORD_NOT_FOUND);
});

test('dry-run CLI does not modify production food bank', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'fats-dry-'));
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
  if (!fs.existsSync(PRE_APPLY_PATH) && livePayload.foods.length !== 227) {
    return;
  }
  const base =
    livePayload.foods.length === 227
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

test('live bank matches post-apply fats totals when already applied', () => {
  if (livePayload.foods.length !== 237) return;
  const fats = livePayload.foods.filter((f) => f.displayCategory === 'matieres_grasses');
  assert.equal(fats.length, 23);
  assert.equal(fats.filter((f) => f.status === 'verified').length, 23);
  assert.equal(livePayload.foods.filter((f) => f.status === 'verified').length, 128);
  for (const food of fats) {
    assert.deepEqual(openErrorCodes(food), []);
  }
});
