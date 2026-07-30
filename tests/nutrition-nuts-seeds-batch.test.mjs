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
  'nuts-seeds-complete-individual-validation-31-foods.json'
);
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const CNF_PATH = path.join(ROOT, 'src', 'sources', 'normalized', 'cnf-2026-foods.json');
const PRE_APPLY_PATH = path.join(
  ROOT,
  'reports',
  'batches',
  'nuts-seeds-complete-individual-validation-31-foods',
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

const VARIANT_PAIRS = [
  ['noix-graines-peanuts', 'noix-graines-peanuts-dry-roasted-unsalted'],
  ['noix-graines-oil-roasted-pecans', 'noix-graines-pecans-dried'],
  ['noix-graines-raw-pistachios', 'noix-graines-pistachios-dry-roasted'],
  ['noix-graines-roasted-pumpkin-seeds', 'noix-graines-pumpkin-seeds-dried'],
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

test('nuts-seeds batch contains 21 updates and 10 adds', () => {
  assert.equal(batch.foods.filter((f) => f.operation === 'update').length, 21);
  assert.equal(batch.foods.filter((f) => f.operation === 'add').length, 10);
  assert.equal(batch.scope.batchFoodCount, 31);
  assert.equal(batch.scope.expectedFinalFoodCount, 227);
  assert.equal(batch.scope.protectedFoodCount, 196);
  assert.equal(batch.scope.newFoodCount, 10);
  assert.equal(batch.scope.allowedFoodIds.includes('noix-graines-almonds'), false);
});

test('nuts-seeds batch scope arithmetic and allowed ids', () => {
  assert.equal(batch.scope.existingFoodCount + batch.scope.newFoodCount, 227);
  assert.equal(batch.scope.allowedFoodIds.length, 31);
  assert.equal(new Set(batch.foods.map((f) => f.id)).size, 31);
  for (const entry of batch.foods) {
    assert.equal(batch.scope.allowedFoodIds.includes(entry.id), true);
  }
});

test('each nuts-seeds food has expectedRecordId that exists and matches selection', () => {
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

test('peanut butter and almond butter use distinct CNF records', () => {
  const peanut = batch.foods.find((f) => f.id === 'noix-graines-peanut-almond-butter');
  const almond = batch.foods.find((f) => f.id === 'noix-graines-almond-butter-plain');
  assert.equal(peanut.operation, 'update');
  assert.equal(almond.operation, 'add');
  assert.match(peanut.lockedIdentity.fr, /Beurre d.arachide/i);
  assert.match(almond.lockedIdentity.fr, /Beurre d.amandes/i);
  assert.notEqual(peanut.sourcePlan.expectedRecordId, almond.sourcePlan.expectedRecordId);
  assert.equal(peanut.sourcePlan.expectedRecordId, '6289');
  assert.equal(almond.sourcePlan.expectedRecordId, '2605');
});

test('raw/roasted variant pairs keep distinct food cards and records', () => {
  for (const [leftId, rightId] of VARIANT_PAIRS) {
    const left = batch.foods.find((f) => f.id === leftId);
    const right = batch.foods.find((f) => f.id === rightId);
    assert.ok(left, leftId);
    assert.ok(right, rightId);
    assert.notEqual(left.id, right.id);
    assert.notEqual(left.sourcePlan.expectedRecordId, right.sourcePlan.expectedRecordId);
  }
});

test('edamame uses protein, granola and chestnuts use starch', () => {
  const edamame = batch.foods.find((f) => f.id === 'noix-graines-cup-soybeans-or-edamame');
  const granola = batch.foods.find((f) => f.id === 'noix-graines-homemade-protein-granola');
  const chestnuts = batch.foods.find((f) => f.id === 'noix-graines-roasted-chestnuts');
  const soyNuts = batch.foods.find((f) => f.id === 'noix-graines-roasted-soy-nuts-unsalted');
  assert.equal(edamame.classification.calculationGroup, 'protein');
  assert.equal(soyNuts.classification.calculationGroup, 'protein');
  assert.equal(granola.classification.calculationGroup, 'starch');
  assert.equal(chestnuts.classification.calculationGroup, 'starch');
  assert.match(edamame.lockedIdentity.fr, /Edamames/i);
  assert.match(granola.lockedIdentity.fr, /^Granola maison$/i);
});

test('almonds remain outside batch and protected', () => {
  const baseline = buildBatchScopeBaseline(payload, batch);
  assert.equal(baseline.protectedFoodIds.includes('noix-graines-almonds'), true);
  assert.equal(baseline.protectedFoodCount, 196);
  const almonds = payload.foods.find((f) => f.id === 'noix-graines-almonds');
  assert.equal(almonds.status, 'verified');
});

test('eleventh add is refused', () => {
  const bad = clone(batch);
  bad.foods.push({
    ...clone(batch.foods.find((f) => f.operation === 'add')),
    id: 'noix-graines-extra-should-fail',
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
  assert.equal(baseline.protectedFoodCount, 196);
  const next = clone(payload);
  const almonds = next.foods.find((f) => f.id === 'noix-graines-almonds');
  almonds.nutrients.proteinG = Number(almonds.nutrients.proteinG || 0) + 1;
  const check = checkBatchScope(baseline, next, batch);
  assert.equal(check.ok, false);
  assert.match(check.errors.join('\n'), /Protected foods hash mismatch|hash mismatch/);
});

test('deletion outside batch is refused', () => {
  const baseline = buildBatchScopeBaseline(payload, batch);
  const next = clone(payload);
  next.foods = next.foods.filter((f) => f.id !== 'noix-graines-almonds');
  const check = checkBatchScope(baseline, next, batch);
  assert.equal(check.ok, false);
  assert.match(check.errors.join('\n'), /Protected food removed/);
});

test('each nuts-seeds food has conversion and distinct verify transaction', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-nuts-31',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.applied.length, 31);
  const txs = new Set(result.applied.map((a) => a.transactionId));
  assert.equal(txs.size, 31);
  for (const row of result.preview.foods) {
    assert.ok(row.conversion);
  }
});

test('apply in memory yields 227 foods, 32 verified nuts, 105 verified global, almonds unchanged', () => {
  const beforeAlmonds = clone(payload.foods.find((f) => f.id === 'noix-graines-almonds'));
  const beforeProtected = buildBatchScopeBaseline(payload, batch);
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-nuts-31-b',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.payload.foods.length, 227);
  const nuts = result.payload.foods.filter((f) => f.displayCategory === 'noix_graines');
  assert.equal(nuts.length, 32);
  assert.equal(nuts.filter((f) => f.status === 'verified').length, 32);
  assert.equal(result.payload.foods.filter((f) => f.status === 'verified').length, 105);
  const afterAlmonds = result.payload.foods.find((f) => f.id === 'noix-graines-almonds');
  assert.equal(stableEqual(beforeAlmonds, afterAlmonds), true);
  const afterProtected = checkBatchScope(beforeProtected, result.payload, batch);
  assert.equal(afterProtected.ok, true);
  assert.equal(afterProtected.protectedFoodCount, 196);
  for (const add of result.applied.filter((a) => a.operation === 'add')) {
    assert.equal(add.startedUnverified, true);
  }
});

test('no open ERROR remains on applied nuts-seeds foods', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-nuts-31-c',
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
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'nuts-dry-'));
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
  if (!fs.existsSync(PRE_APPLY_PATH) && livePayload.foods.length !== 217) {
    return;
  }
  const base =
    livePayload.foods.length === 217
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

test('live bank matches post-apply nuts-seeds totals when already applied', () => {
  if (livePayload.foods.length !== 227) return;
  const nuts = livePayload.foods.filter((f) => f.displayCategory === 'noix_graines');
  assert.equal(nuts.length, 32);
  assert.equal(nuts.filter((f) => f.status === 'verified').length, 32);
  assert.equal(livePayload.foods.filter((f) => f.status === 'verified').length, 105);
  for (const food of nuts) {
    assert.deepEqual(openErrorCodes(food), []);
    assert.ok(food.source?.recordId);
  }
});
