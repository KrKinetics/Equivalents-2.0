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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATCH_PATH = path.join(
  ROOT,
  'src',
  'data',
  'approved-batches',
  'vegetables-complete-individual-validation-36-foods.json'
);
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const CNF_PATH = path.join(ROOT, 'src', 'sources', 'normalized', 'cnf-2026-foods.json');
const PRE_APPLY_PATH = path.join(
  ROOT,
  'reports',
  'batches',
  'vegetables-complete-individual-validation-36-foods',
  'pre-apply-payload.json'
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

const SHARED_BEAN_RECORD = '2371';
const PEPPER_RECORDS = {
  'legumes-green-red-yellow-bell-pepper': '2413',
  'legumes-red-bell-pepper': '2484',
  'legumes-yellow-bell-pepper': '2344',
};

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

test('vegetables batch contains 30 updates and 6 adds', () => {
  assert.equal(batch.foods.filter((f) => f.operation === 'update').length, 30);
  assert.equal(batch.foods.filter((f) => f.operation === 'add').length, 6);
  assert.equal(batch.scope.batchFoodCount, 36);
  assert.equal(batch.scope.expectedFinalFoodCount, 217);
  assert.equal(batch.scope.protectedFoodCount, 181);
  assert.equal(batch.scope.newFoodCount, 6);
});

test('vegetables batch scope arithmetic and allowed ids', () => {
  assert.equal(batch.scope.existingFoodCount + batch.scope.newFoodCount, 217);
  assert.equal(batch.scope.allowedFoodIds.length, 36);
  assert.equal(new Set(batch.foods.map((f) => f.id)).size, 36);
  for (const entry of batch.foods) {
    assert.equal(batch.scope.allowedFoodIds.includes(entry.id), true);
  }
});

test('each vegetable has expectedRecordId that exists and matches selection', () => {
  const validation = validateApprovedBatch(batch, payload, { cnfFoods });
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  for (const row of validation.resolved) {
    assert.ok(row.entry.sourcePlan.expectedRecordId);
    assert.equal(row.result.expectedRecordId, row.entry.sourcePlan.expectedRecordId);
    assert.equal(row.result.selectedRecordId, row.result.expectedRecordId);
    const found = cnfFoods.find(
      (f) => String(f.recordId) === String(row.result.expectedRecordId)
    );
    assert.ok(found, `missing CNF record ${row.result.expectedRecordId}`);
  }
});

test('green and yellow snap beans may share CNF record but keep distinct cards', () => {
  const green = batch.foods.find((f) => f.id === 'legumes-yellow-or-green-beans');
  const yellow = batch.foods.find((f) => f.id === 'legumes-yellow-snap-beans');
  assert.equal(green.operation, 'update');
  assert.equal(yellow.operation, 'add');
  assert.equal(green.sourcePlan.expectedRecordId, SHARED_BEAN_RECORD);
  assert.equal(yellow.sourcePlan.expectedRecordId, SHARED_BEAN_RECORD);
  assert.notEqual(green.id, yellow.id);
  assert.match(green.lockedIdentity.fr, /Haricots verts/i);
  assert.match(yellow.lockedIdentity.fr, /Haricots jaunes/i);
});

test('green, red and yellow peppers use distinct CNF records', () => {
  for (const [id, recordId] of Object.entries(PEPPER_RECORDS)) {
    const entry = batch.foods.find((f) => f.id === id);
    assert.ok(entry, id);
    assert.equal(entry.sourcePlan.expectedRecordId, recordId);
  }
  assert.equal(new Set(Object.values(PEPPER_RECORDS)).size, 3);
});

test('legacy bone broth is renamed, sourced and historized as vegetable broth', () => {
  const entry = batch.foods.find((f) => f.id === 'legumes-homemade-bone-broth');
  assert.equal(entry.operation, 'update');
  assert.equal(entry.id, 'legumes-homemade-bone-broth');
  assert.match(entry.lockedIdentity.fr, /Bouillon de légumes/i);
  assert.match(entry.lockedIdentity.en, /Vegetable broth/i);
  assert.equal(entry.sourcePlan.expectedRecordId, '7378');
  assert.equal(entry.classification.exchangeProfileId, 'vegetable-broth');
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-veg-broth',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  const food = result.payload.foods.find((f) => f.id === 'legumes-homemade-bone-broth');
  assert.equal(food.names.fr, entry.lockedIdentity.fr);
  assert.equal(food.source.recordId, '7378');
  assert.equal(food.status, 'verified');
  assert.ok((food.history || []).some((h) => h.action === 'verify' && h.transactionId));
  assert.ok(
    (food.history || []).some(
      (h) => h.path === 'names.fr' || (h.patches || []).some?.(() => false) || h.action === 'update'
    )
  );
});

test('seventh add is refused', () => {
  const bad = clone(batch);
  bad.foods.push({
    ...clone(batch.foods.find((f) => f.operation === 'add')),
    id: 'legumes-extra-should-fail',
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
  assert.equal(baseline.protectedFoodCount, 181);
  const next = clone(payload);
  const protectedFood = next.foods.find((f) => !batch.scope.allowedFoodIds.includes(f.id));
  assert.ok(protectedFood);
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

test('each vegetable has conversion and distinct verify transaction', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-veg-36',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.applied.length, 36);
  const txs = new Set(result.applied.map((a) => a.transactionId));
  assert.equal(txs.size, 36);
  for (const row of result.preview.foods) {
    assert.ok(row.conversion);
  }
});

test('apply in memory yields 217 foods, 36 verified vegetables, 74 verified global', () => {
  const beforeProtected = buildBatchScopeBaseline(payload, batch);
  const protectedSample = clone(
    payload.foods.find((f) => !batch.scope.allowedFoodIds.includes(f.id))
  );
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-veg-36-b',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.payload.foods.length, 217);
  const vegetables = result.payload.foods.filter((f) => f.displayCategory === 'legumes');
  assert.equal(vegetables.length, 36);
  assert.equal(vegetables.filter((f) => f.status === 'verified').length, 36);
  assert.equal(result.payload.foods.filter((f) => f.status === 'verified').length, 74);
  const afterSample = result.payload.foods.find((f) => f.id === protectedSample.id);
  assert.equal(stableEqual(protectedSample, afterSample), true);
  const afterProtected = checkBatchScope(beforeProtected, result.payload, batch);
  assert.equal(afterProtected.ok, true);
  assert.equal(afterProtected.protectedFoodCount, 181);
  for (const add of result.applied.filter((a) => a.operation === 'add')) {
    assert.equal(add.startedUnverified, true);
  }
});

test('no open ERROR remains on applied vegetables', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-veg-36-c',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  for (const row of result.applied) {
    const food = result.payload.foods.find((f) => f.id === row.id);
    assert.equal(food.status, 'verified');
    assert.deepEqual(openErrorCodes(food), []);
  }
});

test('green/yellow beans share record but have distinct verify transactions', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-veg-beans',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  const green = result.applied.find((a) => a.id === 'legumes-yellow-or-green-beans');
  const yellow = result.applied.find((a) => a.id === 'legumes-yellow-snap-beans');
  assert.equal(green.selectedRecordId, SHARED_BEAN_RECORD);
  assert.equal(yellow.selectedRecordId, SHARED_BEAN_RECORD);
  assert.notEqual(green.transactionId, yellow.transactionId);
});

test('expectedRecordId nonexistent is refused', () => {
  const plan = {
    ...batch.foods[0].sourcePlan,
    expectedRecordId: '99999999',
  };
  const selection = selectCnfRecord(cnfFoods, plan);
  assert.equal(selection.ok, false);
  assert.equal(selection.code, CNF_SELECTION_ERROR_CODES.EXPECTED_CNF_RECORD_NOT_FOUND);
});

test('dry-run CLI does not modify production food bank', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'veg-dry-'));
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
  if (!fs.existsSync(PRE_APPLY_PATH) && livePayload.foods.length !== 211) {
    return;
  }
  const base =
    livePayload.foods.length === 211
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

test('live bank matches post-apply vegetable totals when already applied', () => {
  if (livePayload.foods.length !== 217) return;
  const vegetables = livePayload.foods.filter((f) => f.displayCategory === 'legumes');
  assert.equal(vegetables.length, 36);
  assert.equal(vegetables.filter((f) => f.status === 'verified').length, 36);
  assert.equal(livePayload.foods.filter((f) => f.status === 'verified').length, 74);
  for (const food of vegetables) {
    assert.deepEqual(openErrorCodes(food), []);
    assert.ok(food.source?.recordId);
  }
});
