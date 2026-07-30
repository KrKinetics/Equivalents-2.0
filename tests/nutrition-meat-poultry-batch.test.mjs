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
  'meat-poultry-complete-individual-validation-37-foods.json'
);
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const CNF_PATH = path.join(ROOT, 'src', 'sources', 'normalized', 'cnf-2026-foods.json');
const PRE_APPLY_PATH = path.join(
  ROOT,
  'reports',
  'batches',
  'meat-poultry-complete-individual-validation-37-foods',
  'pre-apply-payload.json'
);
const CHICKEN_BREAST_ID = 'viandes-volaille-chicken-breast';

const batch = JSON.parse(fs.readFileSync(BATCH_PATH, 'utf8'));
const livePayload = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const payload =
  livePayload.foods.length === Number(batch.scope.existingFoodCount)
    ? livePayload
    : fs.existsSync(PRE_APPLY_PATH)
      ? JSON.parse(fs.readFileSync(PRE_APPLY_PATH, 'utf8'))
      : livePayload;
const cnfFoods = JSON.parse(fs.readFileSync(CNF_PATH, 'utf8')).foods;

const GROUND_BEEF_IDS = [
  'viandes-volaille-extra-lean-ground-beef',
  'viandes-volaille-lean-ground-beef',
  'viandes-volaille-medium-ground-beef',
  'viandes-volaille-regular-ground-beef',
];
const BEEF_CUT_IDS = [
  'viandes-volaille-beef',
  'viandes-volaille-extra-lean-sirloin-steak',
  'viandes-volaille-beef-tenderloin-steak',
  'viandes-volaille-beef-ribeye-steak',
];
const PORK_IDS = [
  'viandes-volaille-pork',
  'viandes-volaille-pork-tenderloin',
  'viandes-volaille-pork-centre-chop',
  'viandes-volaille-pork-shoulder',
];
const DELI_BACON_IDS = [
  'viandes-volaille-deli-meats',
  'viandes-volaille-extra-lean-smoked-turkey',
  'viandes-volaille-bacon-cooked',
  'viandes-volaille-turkey-bacon',
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

test('meat-poultry batch contains 27 updates and 10 adds', () => {
  assert.equal(batch.foods.filter((f) => f.operation === 'update').length, 27);
  assert.equal(batch.foods.filter((f) => f.operation === 'add').length, 10);
  assert.equal(batch.scope.batchFoodCount, 37);
  assert.equal(batch.scope.expectedFinalFoodCount, 257);
  assert.equal(batch.scope.protectedFoodCount, 220);
  assert.equal(batch.scope.newFoodCount, 10);
});

test('meat-poultry batch scope arithmetic and allowed ids', () => {
  assert.equal(batch.scope.existingFoodCount + batch.scope.newFoodCount, 257);
  assert.equal(batch.scope.allowedFoodIds.length, 37);
  assert.equal(new Set(batch.foods.map((f) => f.id)).size, 37);
  assert.equal(batch.scope.allowedFoodIds.includes(CHICKEN_BREAST_ID), false);
});

test('each meat-poultry food has expectedRecordId that exists and matches selection', () => {
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

test('four ground beef classes use distinct CNF records', () => {
  const records = GROUND_BEEF_IDS.map((id) => entry(id).sourcePlan.expectedRecordId);
  assert.equal(new Set(records).size, 4);
  assert.equal(entry('viandes-volaille-extra-lean-ground-beef').sourcePlan.expectedRecordId, '4998');
  assert.equal(entry('viandes-volaille-lean-ground-beef').sourcePlan.expectedRecordId, '5009');
  assert.equal(entry('viandes-volaille-medium-ground-beef').sourcePlan.expectedRecordId, '4995');
  assert.equal(entry('viandes-volaille-regular-ground-beef').sourcePlan.expectedRecordId, '5010');
  const regular = selectCnfRecord(
    cnfFoods,
    entry('viandes-volaille-regular-ground-beef').sourcePlan
  );
  assert.equal(regular.ok, true, regular.message);
  assert.equal(regular.selectedRecordId, '5010');
  assert.match(
    cnfFoods.find((f) => String(f.recordId) === '5010').descriptionEn || '',
    /not rinsed/i
  );
});

test('chicken thigh without skin and with skin are distinct', () => {
  const noSkin = entry('viandes-volaille-chicken-thigh');
  const withSkin = entry('viandes-volaille-chicken-thigh-with-skin');
  assert.notEqual(noSkin.sourcePlan.expectedRecordId, withSkin.sourcePlan.expectedRecordId);
  assert.equal(noSkin.sourcePlan.expectedRecordId, '854');
  assert.equal(withSkin.sourcePlan.expectedRecordId, '851');
  assert.match(noSkin.lockedIdentity.fr, /viande seulement/i);
  assert.match(withSkin.lockedIdentity.fr, /viande et peau/i);
});

test('composite beef, sirloin, tenderloin and ribeye are distinct', () => {
  const records = BEEF_CUT_IDS.map((id) => entry(id).sourcePlan.expectedRecordId);
  assert.equal(new Set(records).size, 4);
  assert.equal(entry('viandes-volaille-beef').sourcePlan.expectedRecordId, '6172');
  assert.equal(entry('viandes-volaille-extra-lean-sirloin-steak').sourcePlan.expectedRecordId, '6146');
  assert.equal(entry('viandes-volaille-beef-tenderloin-steak').sourcePlan.expectedRecordId, '6134');
  assert.equal(entry('viandes-volaille-beef-ribeye-steak').sourcePlan.expectedRecordId, '6069');
  assert.match(entry('viandes-volaille-extra-lean-sirloin-steak').lockedIdentity.fr, /surlonge/i);
});

test('pork variants are distinct', () => {
  const records = PORK_IDS.map((id) => entry(id).sourcePlan.expectedRecordId);
  assert.equal(new Set(records).size, 4);
  assert.equal(entry('viandes-volaille-pork').sourcePlan.expectedRecordId, '1894');
  assert.equal(entry('viandes-volaille-pork-tenderloin').sourcePlan.expectedRecordId, '1932');
  assert.match(entry('viandes-volaille-pork').lockedIdentity.fr, /côtes de dos/i);
  assert.match(entry('viandes-volaille-pork-tenderloin').lockedIdentity.fr, /filet/i);
});

test('ham, smoked turkey, pork bacon and turkey bacon are distinct', () => {
  const records = DELI_BACON_IDS.map((id) => entry(id).sourcePlan.expectedRecordId);
  assert.equal(new Set(records).size, 4);
  assert.equal(entry('viandes-volaille-deli-meats').sourcePlan.expectedRecordId, '1148');
  assert.equal(entry('viandes-volaille-extra-lean-smoked-turkey').sourcePlan.expectedRecordId, '5598');
  assert.equal(entry('viandes-volaille-bacon-cooked').sourcePlan.expectedRecordId, '5405');
  assert.equal(entry('viandes-volaille-turkey-bacon').sourcePlan.expectedRecordId, '5462');
  assert.match(entry('viandes-volaille-deli-meats').lockedIdentity.fr, /jambon/i);
  assert.match(entry('viandes-volaille-extra-lean-smoked-turkey').lockedIdentity.fr, /dinde fumée/i);
  assert.doesNotMatch(
    entry('viandes-volaille-extra-lean-smoked-turkey').lockedIdentity.fr,
    /extra-maigre/i
  );
  assert.equal(entry('viandes-volaille-natural-beef-jerky').canonicalPortion.grams, 20);
});

test('eleventh add is refused', () => {
  const bad = clone(batch);
  bad.foods.push({
    ...clone(batch.foods.find((f) => f.operation === 'add')),
    id: 'viandes-volaille-extra-should-fail',
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
  assert.equal(baseline.protectedFoodCount, 220);
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

test('chicken breast remains strictly unchanged after apply', () => {
  const before = clone(payload.foods.find((f) => f.id === CHICKEN_BREAST_ID));
  assert.ok(before);
  assert.equal(before.status, 'verified');
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-meat-37-breast',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  const after = result.payload.foods.find((f) => f.id === CHICKEN_BREAST_ID);
  assert.equal(stableEqual(before, after), true);
});

test('each meat-poultry food has conversion and distinct verify transaction', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-meat-37',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.applied.length, 37);
  assert.equal(new Set(result.applied.map((a) => a.transactionId)).size, 37);
  for (const row of result.preview.foods) {
    assert.ok(row.conversion);
  }
});

test('apply in memory yields 257 foods, 38 verified meat, 201 verified global', () => {
  const beforeProtected = buildBatchScopeBaseline(payload, batch);
  const breastBefore = clone(payload.foods.find((f) => f.id === CHICKEN_BREAST_ID));
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-meat-37-b',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.payload.foods.length, 257);
  const meat = result.payload.foods.filter((f) => f.displayCategory === 'viandes_volaille');
  assert.equal(meat.length, 38);
  assert.equal(meat.filter((f) => f.status === 'verified').length, 38);
  assert.equal(result.payload.foods.filter((f) => f.status === 'verified').length, 201);
  assert.equal(
    stableEqual(breastBefore, result.payload.foods.find((f) => f.id === CHICKEN_BREAST_ID)),
    true
  );
  const afterProtected = checkBatchScope(beforeProtected, result.payload, batch);
  assert.equal(afterProtected.ok, true);
  assert.equal(afterProtected.protectedFoodCount, 220);
  for (const add of result.applied.filter((a) => a.operation === 'add')) {
    assert.equal(add.startedUnverified, true);
  }
});

test('no open ERROR remains on applied meat-poultry foods', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-meat-37-c',
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
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'meat-dry-'));
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
  if (!fs.existsSync(PRE_APPLY_PATH) && livePayload.foods.length !== 247) {
    return;
  }
  const base =
    livePayload.foods.length === 247
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

test('live bank matches post-apply meat-poultry totals when already applied', () => {
  if (livePayload.foods.length !== 257) return;
  const meat = livePayload.foods.filter((f) => f.displayCategory === 'viandes_volaille');
  assert.equal(meat.length, 38);
  assert.equal(meat.filter((f) => f.status === 'verified').length, 38);
  assert.equal(livePayload.foods.filter((f) => f.status === 'verified').length, 201);
  for (const food of meat) {
    assert.deepEqual(openErrorCodes(food), []);
    assert.ok(food.source?.recordId);
  }
  if (fs.existsSync(PRE_APPLY_PATH)) {
    const pre = JSON.parse(fs.readFileSync(PRE_APPLY_PATH, 'utf8'));
    assert.equal(
      stableEqual(
        pre.foods.find((f) => f.id === CHICKEN_BREAST_ID),
        livePayload.foods.find((f) => f.id === CHICKEN_BREAST_ID)
      ),
      true
    );
  }
});
