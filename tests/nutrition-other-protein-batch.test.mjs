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
import {
  convertManufacturerLabelToCanonicalPortion,
  resolveManufacturerConversionFactor,
  validateManufacturerStoredAgainstConversion,
  MANUFACTURER_ERROR_CODES,
} from '../src/lib/nutrition-batch-math.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATCH_PATH = path.join(
  ROOT,
  'src',
  'data',
  'approved-batches',
  'other-protein-sources-complete-individual-validation-25-foods.json'
);
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const CNF_PATH = path.join(ROOT, 'src', 'sources', 'normalized', 'cnf-2026-foods.json');
const PRE_APPLY_PATH = path.join(
  ROOT,
  'reports',
  'batches',
  'other-protein-sources-complete-individual-validation-25-foods',
  'pre-apply-payload.json'
);
const MFR_DIR = path.join(ROOT, 'src', 'sources', 'manufacturer');

const FAIRLIFE_IDS = [
  'autres-sources-proteinees-core-power-fairlife',
  'autres-sources-proteinees-core-power-fairlife-elite-vanilla-42g',
];

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

test('other-protein batch contains 15 updates and 10 adds', () => {
  assert.equal(batch.foods.filter((f) => f.operation === 'update').length, 15);
  assert.equal(batch.foods.filter((f) => f.operation === 'add').length, 10);
  assert.equal(batch.scope.batchFoodCount, 25);
  assert.equal(batch.scope.expectedFinalFoodCount, 267);
  assert.equal(batch.scope.protectedFoodCount, 242);
  assert.equal(cnfEntries.length, 12);
  assert.equal(mfrEntries.length, 13);
});

test('other-protein scope arithmetic and fairlife stay outside batch', () => {
  assert.equal(batch.scope.existingFoodCount + batch.scope.newFoodCount, 267);
  assert.equal(batch.scope.allowedFoodIds.length, 25);
  for (const id of FAIRLIFE_IDS) {
    assert.equal(batch.scope.allowedFoodIds.includes(id), false);
    assert.ok(batch.scope.protectedVerifiedFoodIds.includes(id));
  }
});

test('12 CNF foods have expectedRecordId that exists and matches selection', () => {
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

test('13 manufacturer foods have distinct evidence files', () => {
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
  assert.equal(paths.size, 13);
});

test('manufacturer units g ml scoop tbsp wrap and bar are supported', () => {
  const cases = [
    [{ amount: 50, unit: 'g' }, { amount: 50, unit: 'g' }],
    [{ amount: 325, unit: 'ml' }, { amount: 100, unit: 'ml' }],
    [{ amount: 1, unit: 'scoop' }, { amount: 0.5, unit: 'scoop' }],
    [{ amount: 2, unit: 'tbsp' }, { amount: 3, unit: 'tbsp' }],
    [{ amount: 2, unit: 'wraps' }, { amount: 2, unit: 'wraps' }],
    [{ amount: 1, unit: 'bar' }, { amount: 0.5, unit: 'bar' }],
    [{ amount: 2, unit: 'scoops' }, { amount: 1, unit: 'scoop' }],
  ];
  for (const [label, canon] of cases) {
    const resolved = resolveManufacturerConversionFactor(label, canon);
    assert.equal(resolved.ok, true, resolved.message);
  }
});

test('incompatible manufacturer conversion fails explicitly', () => {
  const resolved = resolveManufacturerConversionFactor(
    { amount: 1, unit: 'scoop' },
    { amount: 100, unit: 'ml', grams: null }
  );
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, MANUFACTURER_ERROR_CODES.MANUFACTURER_CONVERSION_UNSUPPORTED);
});

test('undeclared manufacturer nutrient remains null and null-to-zero fails', () => {
  const conversion = convertManufacturerLabelToCanonicalPortion(
    {
      declaredKcal: 100,
      proteinG: 20,
      carbsG: 0,
      fiberG: null,
      fatG: 1,
      saturatedFatG: null,
      polyunsaturatedFatG: null,
      monounsaturatedFatG: null,
    },
    { amount: 2, unit: 'tbsp' },
    { amount: 2, unit: 'tbsp' }
  );
  assert.equal(conversion.storedRounded.fiberG, null);
  assert.ok(conversion.undeclaredNutrients.includes('fiberG'));
  const coerced = validateManufacturerStoredAgainstConversion(
    { ...conversion.storedRounded, fiberG: 0 },
    conversion
  );
  assert.equal(coerced.ok, false);
  assert.ok(
    coerced.errors.some(
      (e) => e.code === MANUFACTURER_ERROR_CODES.MANUFACTURER_UNKNOWN_COERCED_TO_ZERO
    )
  );
});

test('PB2 2 tbsp to 3 tbsp yields 90 kcal and 9 g protein', () => {
  const pb2 = entry('autres-sources-proteinees-5-tbsp-pb2').manufacturerLabel;
  const conversion = convertManufacturerLabelToCanonicalPortion(
    pb2.labelNutrients,
    pb2.labelServing,
    entry('autres-sources-proteinees-5-tbsp-pb2').canonicalPortion
  );
  assert.equal(conversion.storedRounded.declaredKcal, 90);
  assert.equal(conversion.storedRounded.proteinG, 9);
  assert.equal(conversion.storedRounded.fatG, 2.3);
  assert.equal(conversion.storedRounded.polyunsaturatedFatG, null);
});

test('Egglife keeps official 2 wraps portion', () => {
  const food = entry('autres-sources-proteinees-egglife-wrap');
  assert.equal(food.canonicalPortion.amount, 2);
  assert.match(food.canonicalPortion.unit, /wrap/i);
  assert.equal(food.manufacturerLabel.labelServing.amount, 2);
});

test('Casein 34 g to 17 g is exact half portion', () => {
  const food = entry('autres-sources-proteinees-scoop-micellar-casein');
  const conversion = convertManufacturerLabelToCanonicalPortion(
    food.manufacturerLabel.labelNutrients,
    food.manufacturerLabel.labelServing,
    food.canonicalPortion
  );
  assert.equal(conversion.factor, 0.5);
  assert.equal(conversion.storedRounded.declaredKcal, 60);
  assert.equal(conversion.storedRounded.proteinG, 12);
});

test('Carnivor 33.9 g to 16.95 g is exact half portion', () => {
  const food = entry('autres-sources-proteinees-scoop-beef-protein-isolate');
  const conversion = convertManufacturerLabelToCanonicalPortion(
    food.manufacturerLabel.labelNutrients,
    food.manufacturerLabel.labelServing,
    food.canonicalPortion
  );
  assert.equal(conversion.factor, 0.5);
  assert.equal(conversion.storedRounded.declaredKcal, 60);
  assert.equal(conversion.storedRounded.proteinG, 11.5);
});

test('Quest 60 g to 30 g is exact half bar', () => {
  const food = entry('autres-sources-proteinees-performance-protein-bar');
  const conversion = convertManufacturerLabelToCanonicalPortion(
    food.manufacturerLabel.labelNutrients,
    food.manufacturerLabel.labelServing,
    food.canonicalPortion
  );
  assert.equal(conversion.factor, 0.5);
  assert.equal(conversion.storedRounded.declaredKcal, 85);
  assert.equal(conversion.storedRounded.proteinG, 10);
});

test('Vital Proteins 20 g to 10 g is exact half portion', () => {
  const food = entry('autres-sources-proteinees-hydrolyzed-collagen');
  const conversion = convertManufacturerLabelToCanonicalPortion(
    food.manufacturerLabel.labelNutrients,
    food.manufacturerLabel.labelServing,
    food.canonicalPortion
  );
  assert.equal(conversion.factor, 0.5);
  assert.equal(conversion.storedRounded.declaredKcal, 35);
  assert.equal(conversion.storedRounded.proteinG, 9);
  assert.equal(food.classification.exchangeProfileId, 'protein-collagen-incomplete');
  assert.equal(food.classification.calculationGroup, 'protein');
});

test('Premier Protein 325 ml to 100 ml uses volume ratio without weight estimate', () => {
  const food = entry('autres-sources-proteinees-premier-protein-chocolate-peanut-butter');
  assert.equal(food.canonicalPortion.grams, null);
  const conversion = convertManufacturerLabelToCanonicalPortion(
    food.manufacturerLabel.labelNutrients,
    food.manufacturerLabel.labelServing,
    food.canonicalPortion
  );
  assert.equal(conversion.method, 'same_unit');
  assert.equal(conversion.storedRounded.declaredKcal, 49);
  assert.equal(conversion.storedRounded.proteinG, 9.2);
});

test('firm, extra-firm and silken tofu are distinct', () => {
  const ids = [
    'autres-sources-proteinees-firm-tofu',
    'autres-sources-proteinees-extra-firm-tofu',
    'autres-sources-proteinees-silken-firm-tofu',
  ];
  const records = ids.map((id) => entry(id).sourcePlan.expectedRecordId);
  assert.equal(new Set(records).size, 3);
});

test('fermented and cooked tempeh are distinct', () => {
  const fermented = entry('autres-sources-proteinees-tempeh');
  const cooked = entry('autres-sources-proteinees-cooked-tempeh');
  assert.notEqual(fermented.sourcePlan.expectedRecordId, cooked.sourcePlan.expectedRecordId);
});

test('eleventh add is refused', () => {
  const bad = clone(batch);
  bad.foods.push({
    ...clone(batch.foods.find((f) => f.operation === 'add')),
    id: 'autres-sources-proteinees-extra-should-fail',
  });
  const result = validateApprovedBatch(bad, payload, { cnfFoods });
  assert.equal(result.ok, false);
});

test('modification outside batch is refused by scope check', () => {
  const baseline = buildBatchScopeBaseline(payload, batch);
  assert.equal(baseline.protectedFoodCount, 242);
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

test('both fairlife products remain byte-identical after apply', () => {
  const before = Object.fromEntries(
    FAIRLIFE_IDS.map((id) => [id, clone(payload.foods.find((f) => f.id === id))])
  );
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-other-protein-fairlife',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  for (const id of FAIRLIFE_IDS) {
    assert.equal(
      stableEqual(before[id], result.payload.foods.find((f) => f.id === id)),
      true,
      id
    );
  }
});

test('each other-protein food has conversion and distinct verify transaction', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-other-protein-25',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.applied.length, 25);
  assert.equal(new Set(result.applied.map((a) => a.transactionId)).size, 25);
  for (const row of result.preview.foods) {
    assert.ok(row.conversion);
  }
});

test('apply in memory yields 267 foods, 27 verified other-protein, 226 verified global', () => {
  const beforeProtected = buildBatchScopeBaseline(payload, batch);
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-other-protein-25-b',
  });
  assert.equal(result.ok, true, result.errors?.join('\n'));
  assert.equal(result.payload.foods.length, 267);
  const cat = result.payload.foods.filter(
    (f) => f.displayCategory === 'autres_sources_proteinees'
  );
  assert.equal(cat.length, 27);
  assert.equal(cat.filter((f) => f.status === 'verified').length, 27);
  assert.equal(result.payload.foods.filter((f) => f.status === 'verified').length, 226);
  const afterProtected = checkBatchScope(beforeProtected, result.payload, batch);
  assert.equal(afterProtected.ok, true);
  assert.equal(afterProtected.protectedFoodCount, 242);
  for (const add of result.applied.filter((a) => a.operation === 'add')) {
    assert.equal(add.startedUnverified, true);
  }
});

test('no open ERROR remains on applied other-protein foods', () => {
  const result = applyApprovedBatch(batch, payload, {
    cnfFoods,
    datasetVersion: 'test-other-protein-25-c',
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
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'other-protein-dry-'));
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
  if (!fs.existsSync(PRE_APPLY_PATH) && livePayload.foods.length !== 257) {
    return;
  }
  const base =
    livePayload.foods.length === 257
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

test('live bank matches post-apply other-protein totals when already applied', () => {
  if (livePayload.foods.length !== 267) return;
  const cat = livePayload.foods.filter(
    (f) => f.displayCategory === 'autres_sources_proteinees'
  );
  assert.equal(cat.length, 27);
  assert.equal(cat.filter((f) => f.status === 'verified').length, 27);
  assert.equal(livePayload.foods.filter((f) => f.status === 'verified').length, 226);
  if (fs.existsSync(PRE_APPLY_PATH)) {
    const pre = JSON.parse(fs.readFileSync(PRE_APPLY_PATH, 'utf8'));
    for (const id of FAIRLIFE_IDS) {
      assert.equal(
        stableEqual(
          pre.foods.find((f) => f.id === id),
          livePayload.foods.find((f) => f.id === id)
        ),
        true,
        id
      );
    }
  }
});
