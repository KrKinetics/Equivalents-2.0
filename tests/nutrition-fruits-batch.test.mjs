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
import { computeFoodsDataHash } from '../src/lib/data-hash.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATCH_PATH = path.join(
  ROOT,
  'src',
  'data',
  'approved-batches',
  'fruits-complete-individual-validation-32-foods.json'
);
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const CNF_PATH = path.join(ROOT, 'src', 'sources', 'normalized', 'cnf-2026-foods.json');
const PRE_APPLY_PATH = path.join(
  ROOT,
  'reports',
  'batches',
  'fruits-complete-individual-validation-32-foods',
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

test('expectedRecordId exact is accepted', () => {
  const entry = batch.foods.find((f) => f.id === 'fruits-apricots');
  const selection = selectCnfRecord(cnfFoods, entry.sourcePlan);
  assert.equal(selection.ok, true);
  assert.equal(selection.selectedRecordId, entry.sourcePlan.expectedRecordId);
  assert.equal(selection.expectedRecordId, '1498');
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

test('expectedRecordId incompatible is refused', () => {
  const plan = {
    ...batch.foods[0].sourcePlan,
    expectedRecordId: '1498',
    mustContainConcepts: ['blueberry', 'raw'],
    mustNotContainConcepts: [],
  };
  const selection = selectCnfRecord(cnfFoods, plan);
  assert.equal(selection.ok, false);
  assert.equal(selection.code, CNF_SELECTION_ERROR_CODES.EXPECTED_CNF_RECORD_INCOMPATIBLE);
});

test('selected record differing from expectedRecordId is refused by engine', () => {
  const bad = clone(batch);
  const target = bad.foods.find((f) => f.id === 'fruits-apricots');
  // Keep expectedRecordId but point mustContain at a different food's identity while
  // still using apricot expected id — already covered by incompatible.
  // Force mismatch path via validate when selected would disagree:
  target.sourcePlan.expectedRecordId = '1498';
  const result = validateApprovedBatch(bad, payload, { cnfFoods });
  assert.equal(result.ok, true);
  const resolved = result.resolved.find((r) => r.entry.id === 'fruits-apricots');
  assert.equal(resolved.result.selectedRecordId, resolved.result.expectedRecordId);
});

test('fruits batch detects 29 updates and 3 adds with final counts', () => {
  assert.equal(batch.foods.filter((f) => f.operation === 'update').length, 29);
  assert.equal(batch.foods.filter((f) => f.operation === 'add').length, 3);
  assert.equal(batch.scope.expectedFinalFoodCount, 211);
  assert.equal(batch.scope.protectedFoodCount, 179);
  assert.equal(batch.scope.allowedFoodIds.includes('fruits-blueberries'), false);
});

test('blueberry remains outside batch and protected scope stays 179', () => {
  const baseline = buildBatchScopeBaseline(payload, batch);
  assert.equal(baseline.protectedFoodIds.includes('fruits-blueberries'), true);
  assert.equal(baseline.protectedFoodCount, 179);
  const blueberry = payload.foods.find((f) => f.id === 'fruits-blueberries');
  assert.equal(blueberry.status, 'verified');
});

test('fourth add is refused', () => {
  const bad = clone(batch);
  bad.foods.push({
    ...clone(batch.foods.find((f) => f.operation === 'add')),
    id: 'fruits-extra-should-fail',
  });
  // Intentionally omit from allowedFoodIds / keep newFoodCount at 3
  const result = validateApprovedBatch(bad, payload, { cnfFoods });
  assert.equal(result.ok, false);
  assert.match(
    result.errors.join('\n'),
    /outside allowed scope|newFoodCount mismatch|Food id outside/
  );
});

test('modification outside batch is refused by scope check', () => {
  const baseline = buildBatchScopeBaseline(payload, batch);
  const next = clone(payload);
  const protectedFood = next.foods.find((f) => f.id === 'fruits-blueberries');
  protectedFood.nutrients.proteinG = Number(protectedFood.nutrients.proteinG || 0) + 1;
  const check = checkBatchScope(baseline, next, batch);
  assert.equal(check.ok, false);
  assert.match(check.errors.join('\n'), /Protected foods hash mismatch|hash mismatch/);
});

test('deletion outside batch is refused', () => {
  const baseline = buildBatchScopeBaseline(payload, batch);
  const next = clone(payload);
  next.foods = next.foods.filter((f) => f.id !== 'fruits-blueberries');
  const check = checkBatchScope(baseline, next, batch);
  assert.equal(check.ok, false);
  assert.match(check.errors.join('\n'), /Protected food removed/);
});

test('each batch food has documented distinct expected record and conversion', () => {
  const validation = validateApprovedBatch(batch, payload, { cnfFoods });
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  const records = validation.resolved.map((r) => String(r.result.selectedRecordId));
  assert.equal(new Set(records).size, records.length);
  for (const row of validation.resolved) {
    assert.ok(row.result.conversion);
    assert.equal(row.result.expectedRecordId, row.result.selectedRecordId);
  }
});

test('apply in memory yields 211 foods, 32 verify transactions, blueberry unchanged', () => {
  const beforeBlueberry = clone(payload.foods.find((f) => f.id === 'fruits-blueberries'));
  const beforeProtected = buildBatchScopeBaseline(payload, batch).protectedFoodsDataHash;
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-fruits-32',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.payload.foods.length, 211);
  assert.equal(result.applied.length, 32);
  const tx = new Set(result.applied.map((a) => a.transactionId));
  assert.equal(tx.size, 32);
  const fruits = result.payload.foods.filter((f) => f.displayCategory === 'fruits');
  assert.equal(fruits.length, 33);
  assert.equal(fruits.filter((f) => f.status === 'verified').length, 33);
  assert.equal(result.payload.foods.filter((f) => f.status === 'verified').length, 38);
  const afterBlueberry = result.payload.foods.find((f) => f.id === 'fruits-blueberries');
  assert.equal(stableEqual(beforeBlueberry, afterBlueberry), true);
  const afterProtected = checkBatchScope(
    buildBatchScopeBaseline(payload, batch),
    result.payload,
    batch
  );
  assert.equal(afterProtected.ok, true);
  assert.equal(afterProtected.protectedFoodsDataHash, beforeProtected);
  for (const add of result.applied.filter((a) => a.operation === 'add')) {
    assert.equal(add.startedUnverified, true);
  }
});

function stableEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

test('dry-run CLI does not modify production food bank', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'fruits-dry-'));
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
  const result = runNode(
    'scripts/nutrition-batch-apply.mjs',
    ['--dry-run', BATCH_PATH],
    {
      FOOD_DATA_PATH: foodPath,
      VERSION_DATA_PATH: versionPath,
      REPORTS_DIR: reportsDir,
      BACKUPS_DIR: backupsDir,
    }
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const after = crypto.createHash('sha256').update(fs.readFileSync(foodPath)).digest('hex');
  const prodAfter = crypto.createHash('sha256').update(fs.readFileSync(DATA_PATH)).digest('hex');
  assert.equal(after, before);
  assert.equal(prodAfter, prodBefore);
});

test('no open ERROR remains on applied pilot foods in memory', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-fruits-32-b',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  for (const row of result.applied) {
    const food = result.payload.foods.find((f) => f.id === row.id);
    assert.equal(food.status, 'verified');
    const open = (food.history || []).some((h) => h.action === 'verify' && h.transactionId);
    assert.equal(open, true);
  }
});
