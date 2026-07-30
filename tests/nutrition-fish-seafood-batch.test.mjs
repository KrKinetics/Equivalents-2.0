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
  'fish-seafood-complete-individual-validation-36-foods.json'
);
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const CNF_PATH = path.join(ROOT, 'src', 'sources', 'normalized', 'cnf-2026-foods.json');
const PRE_APPLY_PATH = path.join(
  ROOT,
  'reports',
  'batches',
  'fish-seafood-complete-individual-validation-36-foods',
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

const SALMON_IDS = [
  'poissons-fruits-mer-atlantic-salmon',
  'poissons-fruits-mer-sockeye-salmon',
  'poissons-fruits-mer-smoked-chinook-salmon',
  'poissons-fruits-mer-canned-pink-salmon',
];
const TUNA_IDS = [
  'poissons-fruits-mer-tuna',
  'poissons-fruits-mer-canned-tuna-in-water-drained',
  'poissons-fruits-mer-canned-white-tuna-water',
  'poissons-fruits-mer-canned-light-tuna-oil',
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

function entry(id) {
  return batch.foods.find((f) => f.id === id);
}

test('fish-seafood batch contains 26 updates and 10 adds', () => {
  assert.equal(batch.foods.filter((f) => f.operation === 'update').length, 26);
  assert.equal(batch.foods.filter((f) => f.operation === 'add').length, 10);
  assert.equal(batch.scope.batchFoodCount, 36);
  assert.equal(batch.scope.expectedFinalFoodCount, 247);
  assert.equal(batch.scope.protectedFoodCount, 211);
  assert.equal(batch.scope.newFoodCount, 10);
});

test('fish-seafood batch scope arithmetic and allowed ids', () => {
  assert.equal(batch.scope.existingFoodCount + batch.scope.newFoodCount, 247);
  assert.equal(batch.scope.allowedFoodIds.length, 36);
  assert.equal(new Set(batch.foods.map((f) => f.id)).size, 36);
});

test('each fish-seafood food has expectedRecordId that exists and matches selection', () => {
  const validation = validateApprovedBatch(batch, payload, { cnfFoods });
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  for (const row of validation.resolved) {
    assert.ok(row.entry.sourcePlan.expectedRecordId);
    assert.equal(row.result.expectedRecordId, row.entry.sourcePlan.expectedRecordId);
    assert.equal(row.result.selectedRecordId, row.result.expectedRecordId);
    assert.ok(
      cnfFoods.some((f) => String(f.recordId) === String(row.result.expectedRecordId))
    );
  }
});

test('salmon variants have distinct cards and CNF records', () => {
  const records = SALMON_IDS.map((id) => {
    const food = entry(id);
    assert.ok(food, id);
    return food.sourcePlan.expectedRecordId;
  });
  assert.equal(new Set(records).size, 4);
  assert.equal(entry('poissons-fruits-mer-atlantic-salmon').sourcePlan.expectedRecordId, '3183');
  assert.equal(entry('poissons-fruits-mer-sockeye-salmon').sourcePlan.expectedRecordId, '3053');
});

test('fresh and canned tuna variants are distinct', () => {
  const records = TUNA_IDS.map((id) => entry(id).sourcePlan.expectedRecordId);
  assert.equal(new Set(records).size, 4);
  assert.match(entry('poissons-fruits-mer-tuna').lockedIdentity.fr, /nageoires jaunes/i);
  assert.match(
    entry('poissons-fruits-mer-canned-tuna-in-water-drained').lockedIdentity.fr,
    /eau/i
  );
  assert.match(entry('poissons-fruits-mer-canned-light-tuna-oil').lockedIdentity.fr, /huile/i);
  assert.match(entry('poissons-fruits-mer-canned-white-tuna-water').lockedIdentity.fr, /blanc/i);
});

test('canned water and oil tuna forms are distinct', () => {
  const water = entry('poissons-fruits-mer-canned-tuna-in-water-drained');
  const oil = entry('poissons-fruits-mer-canned-light-tuna-oil');
  assert.notEqual(water.sourcePlan.expectedRecordId, oil.sourcePlan.expectedRecordId);
  assert.equal(water.sourcePlan.expectedRecordId, '3131');
  assert.equal(oil.sourcePlan.expectedRecordId, '3214');
});

test('shellfish and mollusks use exact preparation states', () => {
  assert.equal(entry('poissons-fruits-mer-shrimp').lockedIdentity.preparationState, 'cooked');
  assert.equal(entry('poissons-fruits-mer-crab').lockedIdentity.preparationState, 'cooked');
  assert.equal(entry('poissons-fruits-mer-snail').lockedIdentity.preparationState, 'raw');
  assert.equal(entry('poissons-fruits-mer-octopus').lockedIdentity.preparationState, 'cooked');
  assert.match(entry('poissons-fruits-mer-shrimp').lockedIdentity.fr, /vapeur|bouill/i);
  assert.match(entry('poissons-fruits-mer-snail').lockedIdentity.fr, /cru/i);
});

test('surimi does not use a real crab CNF record', () => {
  const surimi = entry('poissons-fruits-mer-surimi');
  const crab = entry('poissons-fruits-mer-crab');
  assert.notEqual(surimi.sourcePlan.expectedRecordId, crab.sourcePlan.expectedRecordId);
  assert.equal(surimi.sourcePlan.expectedRecordId, '3074');
  assert.equal(crab.sourcePlan.expectedRecordId, '3173');
  const surimiCnf = cnfFoods.find((f) => String(f.recordId) === '3074');
  assert.ok(surimiCnf);
  assert.doesNotMatch(surimiCnf.descriptionEn || '', /\bcrab\b/i);
});

test('anchovy uses olive oil drained record, not a water record', () => {
  const anchovy = entry('poissons-fruits-mer-canned-anchovies-in-water');
  assert.equal(anchovy.sourcePlan.expectedRecordId, '2985');
  assert.match(anchovy.lockedIdentity.fr, /huile d.olive/i);
  const cnf = cnfFoods.find((f) => String(f.recordId) === '2985');
  assert.match(cnf.descriptionEn || '', /olive oil/i);
  assert.doesNotMatch(cnf.descriptionEn || '', /\bin water\b/i);
});

test('eleventh add is refused', () => {
  const bad = clone(batch);
  bad.foods.push({
    ...clone(batch.foods.find((f) => f.operation === 'add')),
    id: 'poissons-fruits-mer-extra-should-fail',
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
  assert.equal(baseline.protectedFoodCount, 211);
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

test('each fish-seafood food has conversion and distinct verify transaction', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-fish-36',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.applied.length, 36);
  assert.equal(new Set(result.applied.map((a) => a.transactionId)).size, 36);
  for (const row of result.preview.foods) {
    assert.ok(row.conversion);
  }
});

test('apply in memory yields 247 foods, 36 verified fish, 164 verified global', () => {
  const beforeProtected = buildBatchScopeBaseline(payload, batch);
  const protectedSample = clone(
    payload.foods.find((f) => !batch.scope.allowedFoodIds.includes(f.id))
  );
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-fish-36-b',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.payload.foods.length, 247);
  const fish = result.payload.foods.filter((f) => f.displayCategory === 'poissons_fruits_mer');
  assert.equal(fish.length, 36);
  assert.equal(fish.filter((f) => f.status === 'verified').length, 36);
  assert.equal(result.payload.foods.filter((f) => f.status === 'verified').length, 164);
  const afterSample = result.payload.foods.find((f) => f.id === protectedSample.id);
  assert.equal(stableEqual(protectedSample, afterSample), true);
  const afterProtected = checkBatchScope(beforeProtected, result.payload, batch);
  assert.equal(afterProtected.ok, true);
  assert.equal(afterProtected.protectedFoodCount, 211);
  for (const add of result.applied.filter((a) => a.operation === 'add')) {
    assert.equal(add.startedUnverified, true);
  }
});

test('no open ERROR remains on applied fish-seafood foods', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-fish-36-c',
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
    ...batch.foods[0].sourcePlan,
    expectedRecordId: '99999999',
  };
  const selection = selectCnfRecord(cnfFoods, plan);
  assert.equal(selection.ok, false);
  assert.equal(selection.code, CNF_SELECTION_ERROR_CODES.EXPECTED_CNF_RECORD_NOT_FOUND);
});

test('dry-run CLI does not modify production food bank', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'fish-dry-'));
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
  if (!fs.existsSync(PRE_APPLY_PATH) && livePayload.foods.length !== 237) {
    return;
  }
  const base =
    livePayload.foods.length === 237
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

test('live bank matches post-apply fish-seafood totals when already applied', () => {
  if (livePayload.foods.length !== 247) return;
  const fish = livePayload.foods.filter((f) => f.displayCategory === 'poissons_fruits_mer');
  assert.equal(fish.length, 36);
  assert.equal(fish.filter((f) => f.status === 'verified').length, 36);
  assert.equal(livePayload.foods.filter((f) => f.status === 'verified').length, 164);
  for (const food of fish) {
    assert.deepEqual(openErrorCodes(food), []);
    assert.ok(food.source?.recordId);
  }
});
