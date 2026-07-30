import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  auditDataset,
  auditFood,
  canMarkVerified,
  getResolutionState,
  validateSource,
} from '../src/lib/food-audit-core.mjs';
import { applyFoodChange } from '../src/lib/food-change.mjs';
import { computeFoodsDataHash } from '../src/lib/data-hash.mjs';
import { assertApplyGovernance, bumpSemver } from '../src/lib/dataset-governance.mjs';
import { validateReviewImport } from '../src/lib/review-import.mjs';
import { calculateGroupStatistics } from '../src/lib/group-statistics.mjs';
import {
  parsePortion,
  parsePortionLabel,
  shortName,
  stripProteinAmountHints,
} from '../src/lib/legacy-portion-parser.mjs';
import {
  EXPECTED_CATEGORY_COUNTS,
  MANUAL_STATUSES,
  SOURCE_TYPES,
  TOTAL_FOODS_EXPECTED,
} from '../src/lib/nutrition-constants.mjs';
import { validateFoodEquivalentsPayload } from '../src/lib/schema-validate.mjs';
import { getFoodStatus } from '../src/lib/food-status.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const VERSION_PATH = path.join(ROOT, 'src', 'data', 'nutrition-data-version.json');
const REPORT_PATH = path.join(ROOT, 'reports', 'food-equivalents-audit.json');
const REAL_PATHS = [DATA_PATH, VERSION_PATH, REPORT_PATH];
const beforeHashes = new Map(REAL_PATHS.map((file) => [file, hashFile(file)]));
const realPayload = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cleanFood(overrides = {}) {
  const food = {
    id: 'clean-food',
    displayCategory: 'feculents',
    calculationGroup: 'starch',
    exchangeProfileId: null,
    classificationStatus: 'approved',
    names: { fr: 'Quinoa cuit', en: 'Cooked quinoa' },
    portion: {
      labelFr: '100 g de quinoa cuit',
      labelEn: '100 g cooked quinoa',
      amount: 100,
      unit: 'g',
      grams: 100,
      preparationState: 'cooked',
      brandSpecific: false,
      brand: null,
    },
    nutrients: {
      proteinG: 4,
      carbsG: 21,
      fiberG: 2,
      fatG: 2,
      saturatedFatG: 0.2,
      polyunsaturatedFatG: 1,
      monounsaturatedFatG: 0.6,
      declaredKcal: 118,
    },
    legacySource: { reference: 'legacy', referenceId: 'test[0]' },
    source: {
      type: 'canadian_nutrient_file',
      name: 'Canadian Nutrient File',
      recordId: 'CNF-123',
      url: null,
      doi: null,
      accessedAt: '2026-07-29',
      servingDescription: '100 g cooked',
      nutrientsBasis: 'as_consumed',
      notes: null,
      brand: null,
      productName: null,
      labelServingSize: null,
      evidenceRef: null,
    },
    status: 'unverified',
    version: 1,
    verification: {
      status: 'unverified',
      verifiedAt: null,
      verifiedBy: null,
      datasetVersion: null,
    },
    auditResolutions: [],
    history: [],
  };
  return Object.assign(food, clone(overrides));
}

function makeSandbox(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `equiv-alim-${name}-`));
  const data = path.join(root, 'food-equivalents.json');
  const version = path.join(root, 'nutrition-data-version.json');
  const reports = path.join(root, 'reports');
  const backups = path.join(root, 'backups');
  const review = path.join(root, 'food-data-review-data.js');
  fs.copyFileSync(DATA_PATH, data);
  fs.copyFileSync(VERSION_PATH, version);
  fs.mkdirSync(reports, { recursive: true });
  fs.mkdirSync(backups, { recursive: true });
  return {
    root,
    data,
    version,
    reports,
    backups,
    review,
    env: {
      ...process.env,
      PROJECT_ROOT: ROOT,
      FOOD_DATA_PATH: data,
      VERSION_DATA_PATH: version,
      REPORTS_DIR: reports,
      BACKUPS_DIR: backups,
      REVIEW_DATA_PATH: review,
    },
  };
}

function runScript(relativePath, args, sandbox) {
  return spawnSync(process.execPath, [path.join(ROOT, relativePath), ...args], {
    cwd: ROOT,
    env: sandbox.env,
    encoding: 'utf8',
  });
}

after(() => {
  for (const file of REAL_PATHS) {
    assert.equal(hashFile(file), beforeHashes.get(file), `test suite modified ${file}`);
  }
});

test('real dataset has exactly 207 foods', () => {
  assert.equal(realPayload.foods.length, TOTAL_FOODS_EXPECTED);
  assert.equal(TOTAL_FOODS_EXPECTED, 207);
});

test('real dataset has exact category counts', () => {
  const counts = realPayload.foods.reduce((result, food) => {
    result[food.displayCategory] = (result[food.displayCategory] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, EXPECTED_CATEGORY_COUNTS);
});

test('real dataset has complete English names and labels', () => {
  for (const food of realPayload.foods) {
    assert.ok(food.names?.en, `missing English name: ${food.id}`);
    assert.ok(food.portion?.labelEn, `missing English portion: ${food.id}`);
  }
});

test('real dataset IDs are unique', () => {
  const ids = realPayload.foods.map((food) => food.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('shortName preserves percentage descriptors', () => {
  assert.match(shortName('125 ml 100% pure fruit juice, no added sugar', 'en'), /100%\s*pure fruit juice/i);
  assert.doesNotMatch(shortName('125 ml 100% pure fruit juice, no added sugar', 'en'), /^%/);
  for (const label of [
    '100 g 0% plain Skyr',
    '125 g 0% plain Greek yogurt',
    '100 ml 1-2% yogurt, no added sugar (100 g)',
    '125 ml 1% cottage cheese',
    '100 g 2% cottage cheese',
  ]) {
    assert.match(shortName(label, 'en'), /\d(?:-\d)?%/);
  }
});

test('shortName strips count portions but preserves pita dimensions', () => {
  assert.equal(shortName('1 œuf entier', 'fr'), 'œuf entier');
  assert.equal(shortName('1 whole egg', 'en'), 'whole egg');
  assert.match(shortName('1 10.2 cm (4 in) wheat pita', 'en'), /10\.2 cm wheat pita/);
});

test('PB2, raisins, rice cakes, and Core Power parse correctly', () => {
  assert.equal(shortName('1,5 c. à table de PB2', 'fr'), 'PB2');
  assert.equal(shortName('1.5 tbsp PB2', 'en'), 'PB2');
  assert.deepEqual(
    (({ amount, unit }) => ({ amount, unit }))(parsePortion('1,5 c. à table de PB2', '1.5 tbsp PB2')),
    { amount: 1.5, unit: 'tbsp' }
  );
  assert.deepEqual(
    (({ amount, unit, grams }) => ({ amount, unit, grams }))(parsePortionLabel('15 gros raisins (75 g)')),
    { amount: 15, unit: 'count', grams: 75 }
  );
  assert.deepEqual(
    (({ amount, unit, grams }) => ({ amount, unit, grams }))(parsePortionLabel('2 Galettes de riz (~20 g)')),
    { amount: 2, unit: 'count', grams: 20 }
  );
  assert.doesNotMatch(
    stripProteinAmountHints('100 ml de Core Power, Fairlife (42 g prot./bouteille)'),
    /42/
  );
  assert.deepEqual(
    (({ amount, unit, grams }) => ({ amount, unit, grams }))(
      parsePortionLabel('100 ml de Core Power, Fairlife (42 g prot./bouteille)')
    ),
    { amount: 100, unit: 'ml', grams: null }
  );
  assert.deepEqual(
    (({ amount, unit, grams }) => ({ amount, unit, grams }))(
      parsePortionLabel('½ bouteille de Core Power, Fairlife (26 g prot./bouteille)')
    ),
    { amount: 0.5, unit: 'bottle', grams: null }
  );
});

test('verified is never a manual status', () => {
  assert.deepEqual(MANUAL_STATUSES, ['unverified', 'rejected']);
  assert.equal(MANUAL_STATUSES.includes('verified'), false);
});

test('legacy and type-plus-name-only sources cannot verify', () => {
  const legacy = cleanFood({
    source: { type: null, name: null },
  });
  assert.equal(validateSource(legacy).ok, false);
  assert.equal(canMarkVerified(legacy), false);

  for (const type of SOURCE_TYPES) {
    const food = cleanFood({ source: { type, name: 'Named source' } });
    assert.equal(validateSource(food).ok, false, `${type} type+name unexpectedly valid`);
    assert.equal(canMarkVerified(food), false, `${type} type+name unexpectedly verifiable`);
  }
});

test('every source type reports its missing required fields', () => {
  const expected = {
    canadian_nutrient_file: [
      'INSUFFICIENT_SOURCE', 'SOURCE_RECORD_ID_MISSING', 'SOURCE_ACCESS_DATE_MISSING',
      'SOURCE_SERVING_MISSING', 'SOURCE_BASIS_MISSING',
    ],
    usda_fooddata_central: [
      'INSUFFICIENT_SOURCE', 'SOURCE_RECORD_ID_MISSING', 'SOURCE_ACCESS_DATE_MISSING',
      'SOURCE_SERVING_MISSING', 'SOURCE_BASIS_MISSING',
    ],
    manufacturer_label: [
      'INSUFFICIENT_SOURCE', 'SOURCE_SERVING_MISSING', 'SOURCE_ACCESS_DATE_MISSING',
      'SOURCE_EVIDENCE_MISSING',
    ],
    manufacturer_website: [
      'INSUFFICIENT_SOURCE', 'SOURCE_URL_OR_RECORD_MISSING', 'SOURCE_ACCESS_DATE_MISSING',
      'SOURCE_SERVING_MISSING',
    ],
    peer_reviewed_reference: [
      'INSUFFICIENT_SOURCE', 'SOURCE_URL_OR_RECORD_MISSING', 'SOURCE_ACCESS_DATE_MISSING',
      'SOURCE_SERVING_MISSING',
    ],
    other_authoritative: [
      'INSUFFICIENT_SOURCE', 'SOURCE_URL_OR_RECORD_MISSING', 'SOURCE_ACCESS_DATE_MISSING',
    ],
  };
  assert.deepEqual([...SOURCE_TYPES].sort(), Object.keys(expected).sort());
  for (const type of SOURCE_TYPES) {
    const result = validateSource(cleanFood({ source: { type } }));
    const codes = new Set(result.alerts.map((alert) => alert.code));
    assert.equal(result.ok, false, `${type} unexpectedly valid`);
    for (const code of expected[type]) assert.ok(codes.has(code), `${type} missing ${code}`);
  }
});

test('quinoa legacy signature blocks verification while corrected quinoa can verify', () => {
  const legacy = cleanFood({
    nutrients: {
      proteinG: 8,
      carbsG: 1,
      fiberG: 1,
      fatG: 2,
      saturatedFatG: 0,
      polyunsaturatedFatG: 0,
      monounsaturatedFatG: 0,
      declaredKcal: 116,
    },
  });
  assert.ok(auditFood(legacy).alerts.some((alert) => alert.code === 'SUSPECT_CASE'));

  const corrected = cleanFood();
  const result = auditFood(corrected);
  assert.equal(result.alerts.some((alert) => alert.code === 'SUSPECT_CASE'), false);
  assert.equal(result.errorCount, 0, JSON.stringify(result.alerts));
  assert.equal(canMarkVerified(corrected, result.alerts), true);
});

test('duplicate IDs mark both audit items through the UI-shared engine', () => {
  const first = cleanFood({ id: 'x' });
  const second = cleanFood({ id: 'x', names: { fr: 'Deux', en: 'Two' } });
  const reviewTest = { auditDataset };
  const result = reviewTest.auditDataset([first, second]);
  assert.equal(result.items.length, 2);
  assert.ok(result.items.every((item) => item.alerts.some((alert) => alert.code === 'DUPLICATE_ID')));

  const app = fs.readFileSync(path.join(ROOT, 'tools', 'food-data-review-app.js'), 'utf8');
  assert.match(app, /window\.__REVIEW_TEST__\s*=\s*\{[\s\S]*auditDataset/);
});

test('status mismatch is a blocking audit alert', () => {
  const food = cleanFood();
  food.status = 'rejected';
  food.verification.status = 'unverified';
  const result = auditFood(food);
  assert.ok(result.alerts.some((alert) => alert.code === 'STATUS_MISMATCH'));
  assert.equal(result.errorCount > 0, true);
});

test('one verified food cannot approve an otherwise approved group', () => {
  const verified = cleanFood({
    id: 'verified',
    status: 'verified',
    verification: {
      status: 'verified',
      verifiedAt: '2026-07-29T00:00:00.000Z',
      verifiedBy: 'Reviewer',
      datasetVersion: '1.0.0',
    },
  });
  const pending = [1, 2, 3].map((number) => cleanFood({ id: `pending-${number}` }));
  const stats = calculateGroupStatistics('starch', [verified, ...pending], {
    id: 'starch',
    approved: true,
    referenceProfile: { proteinG: 4, carbsG: 21, fiberG: 2, fatG: 2, kcal: 118 },
    tolerances: { proteinG: 2, carbsG: 4, fatG: 2, kcal: 15 },
    approvalCriteria: {
      minVerifiedCount: null,
      minCoveragePercent: 0,
      requireAllActiveFoodsVerified: false,
      requireNoFoodsOutsideTolerance: false,
    },
  }, { status: 'approved' });
  assert.equal(stats.referenceProfileApproved, true);
  assert.equal(stats.approved, false);
  assert.ok(stats.approvalBlockers.includes('minVerifiedCount_null'));
});

test('bootstrap refuses a populated temporary target without --force', () => {
  const sandbox = makeSandbox('bootstrap');
  const before = hashFile(sandbox.data);
  const result = runScript('scripts/bootstrap-from-legacy.mjs', [], sandbox);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Refusing to overwrite/i);
  assert.equal(hashFile(sandbox.data), before);
  assert.deepEqual(fs.readdirSync(sandbox.backups), []);
});

test('data:apply dry-run writes nothing and real apply creates only temporary backups', () => {
  const sandbox = makeSandbox('apply');
  const incoming = path.join(sandbox.root, 'incoming.json');
  const applicablePayload = clone(realPayload);
  for (const food of applicablePayload.foods) {
    if (food.portion.unit === 'scoop' && food.portion.grams == null) {
      food.portion.grams = 30;
      food.version = (food.version || 1) + 1;
      food.history = [
        ...(food.history || []),
        {
          timestamp: new Date().toISOString(),
          by: 'test',
          action: 'update',
          path: 'portion.grams',
          oldValue: null,
          newValue: 30,
          reason: 'test scoop grams',
          versionBefore: food.version - 1,
          versionAfter: food.version,
        },
      ];
    }
  }
  applicablePayload.meta.baseDataHash = computeFoodsDataHash(
    JSON.parse(fs.readFileSync(sandbox.data, 'utf8')).foods
  );
  applicablePayload.meta.exportDataHash = computeFoodsDataHash(applicablePayload.foods);
  applicablePayload.meta.exportedAt = new Date().toISOString();
  applicablePayload.meta.exportedBy = 'test';
  applicablePayload.meta.sourceDatasetVersion = '1.0.0';
  fs.writeFileSync(incoming, JSON.stringify(applicablePayload), 'utf8');
  const targetBefore = hashFile(sandbox.data);
  const versionBefore = hashFile(sandbox.version);

  const dryRun = runScript('scripts/apply-food-equivalents.mjs', ['--dry-run', incoming], sandbox);
  assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
  assert.match(dryRun.stdout, /no files written/i);
  assert.equal(hashFile(sandbox.data), targetBefore);
  assert.equal(hashFile(sandbox.version), versionBefore);
  assert.deepEqual(fs.readdirSync(sandbox.backups), []);

  const apply = runScript('scripts/apply-food-equivalents.mjs', [incoming], sandbox);
  assert.equal(apply.status, 0, apply.stderr || apply.stdout);
  assert.ok(fs.readdirSync(sandbox.backups).some((name) => name.includes('pre-apply')));
  assert.ok(fs.existsSync(path.join(sandbox.reports, 'food-equivalents-audit.json')));
  assert.ok(fs.existsSync(sandbox.review));
});

test('non-numeric protein is rejected by payload validation and apply', () => {
  const invalid = clone(realPayload);
  invalid.foods[0].nutrients.proteinG = 'abc';
  const validation = validateFoodEquivalentsPayload(invalid);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => /number/.test(error.message)));

  const sandbox = makeSandbox('invalid');
  const incoming = path.join(sandbox.root, 'invalid.json');
  fs.writeFileSync(incoming, JSON.stringify(invalid), 'utf8');
  const targetBefore = hashFile(sandbox.data);
  const result = runScript('scripts/apply-food-equivalents.mjs', [incoming], sandbox);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Invalid JSON/i);
  assert.equal(hashFile(sandbox.data), targetBefore);
  assert.deepEqual(fs.readdirSync(sandbox.backups), []);
});

test('audit does not mutate nutrients and writes only sandbox outputs', () => {
  const sandbox = makeSandbox('audit');
  const nutrientsBefore = JSON.stringify(
    JSON.parse(fs.readFileSync(sandbox.data, 'utf8')).foods.map((food) => food.nutrients)
  );
  const result = runScript('scripts/audit-food-equivalents.mjs', [], sandbox);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const nutrientsAfter = JSON.stringify(
    JSON.parse(fs.readFileSync(sandbox.data, 'utf8')).foods.map((food) => food.nutrients)
  );
  assert.equal(nutrientsAfter, nutrientsBefore);
  assert.ok(fs.existsSync(path.join(sandbox.reports, 'food-equivalents-audit.json')));
  assert.ok(fs.existsSync(sandbox.review));
});

test('dataset approval refuses the current sandbox dataset', () => {
  const sandbox = makeSandbox('approval');
  const before = hashFile(sandbox.version);
  const result = runScript('scripts/approve-dataset.mjs', ['--by', 'Test Reviewer'], sandbox);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /approval refused/i);
  assert.equal(hashFile(sandbox.version), before);
});

test('foodsWithWarnings counts all warning foods and warning-only remains disjoint from errors', () => {
  const result = auditDataset(realPayload.foods);
  const warningFoods = result.items.filter((item) => item.warningCount > 0).length;
  const warningOnlyFoods = result.items.filter(
    (item) => item.errorCount === 0 && item.warningCount > 0
  ).length;
  assert.equal(result.summary.foodsWithWarnings, warningFoods);
  assert.equal(result.summary.foodsWithWarnings, 207);
  assert.equal(result.summary.foodsWithWarningsOnly, warningOnlyFoods);
});

test('absurd CNF source values are refused by validateSource and schema', () => {
  const absurd = {
    type: 'canadian_nutrient_file',
    name: 'x',
    recordId: 'x',
    accessedAt: 'not-a-date',
    servingDescription: 'x',
    nutrientsBasis: 'banana',
  };
  const result = validateSource(cleanFood({ source: absurd }));
  assert.equal(result.ok, false);
  const codes = new Set(result.alerts.map((a) => a.code));
  assert.ok(codes.has('INSUFFICIENT_SOURCE') || codes.has('SOURCE_RECORD_ID_MISSING'));
  assert.ok(codes.has('SOURCE_ACCESS_DATE_MISSING'));
  assert.ok(codes.has('SOURCE_SERVING_MISSING'));
  assert.ok(codes.has('SOURCE_BASIS_MISSING'));

  const payload = clone(realPayload);
  payload.foods[0] = cleanFood({ id: payload.foods[0].id, source: absurd });
  // keep required structural fields from original id path — cleanFood replaces fully
  payload.foods[0].id = realPayload.foods[0].id;
  payload.foods[0].legacySectionKey = realPayload.foods[0].legacySectionKey;
  payload.foods[0].legacyIndex = realPayload.foods[0].legacyIndex;
  const validation = validateFoodEquivalentsPayload(payload);
  assert.equal(validation.ok, false);
  assert.ok(
    validation.errors.some((e) => /nutrientsBasis|accessedAt|enum|pattern/i.test(`${e.path} ${e.message}`))
  );
});

test('resolution without fieldsHash does not neutralize KCAL_DIFF_HIGH', () => {
  const food = cleanFood({
    nutrients: {
      proteinG: 4,
      carbsG: 21,
      fiberG: 2,
      fatG: 2,
      saturatedFatG: 0.2,
      polyunsaturatedFatG: 1,
      monounsaturatedFatG: 0.6,
      declaredKcal: 500,
    },
    auditResolutions: [
      {
        code: 'KCAL_DIFF_HIGH',
        reason: 'Label uses different rounding',
        approvedBy: 'Reviewer',
        approvedAt: '2026-07-29',
        sourceReferenceId: 'CNF-123',
        // fieldsHash intentionally omitted
      },
    ],
  });
  const state = getResolutionState(food, 'KCAL_DIFF_HIGH');
  assert.equal(state.status, 'invalid');
  const audited = auditFood(food);
  assert.ok(audited.alerts.some((a) => a.code === 'KCAL_DIFF_HIGH' && a.severity === 'ERROR'));
  assert.equal(audited.errorCount > 0, true);
  assert.equal(
    audited.alerts.find((a) => a.code === 'KCAL_DIFF_HIGH')?.resolutionStatus,
    'invalid'
  );
});

test('material nutrient edit auto-unverifies a verified food', () => {
  const food = cleanFood({
    status: 'verified',
    verification: {
      status: 'verified',
      verifiedAt: '2026-07-29T00:00:00.000Z',
      verifiedBy: 'Reviewer',
      datasetVersion: '1.0.0',
    },
  });
  assert.equal(getFoodStatus(food), 'verified');
  const result = applyFoodChange(food, {
    path: 'nutrients.proteinG',
    value: 5,
    by: 'coach',
    reason: 'manual correction draft',
  });
  assert.equal(result.unverified, true);
  assert.equal(getFoodStatus(food), 'unverified');
  assert.equal(food.nutrients.proteinG, 5);
  assert.ok(food.history.some((h) => h.action === 'auto_unverify'));
  assert.ok(
    food.history.some(
      (h) => h.previousVerification?.verifiedBy === 'Reviewer'
    )
  );
});

test('stale export cannot overwrite a newer base without --allow-stale', () => {
  const sandbox = makeSandbox('stale');
  const current = JSON.parse(fs.readFileSync(sandbox.data, 'utf8'));
  const staleExport = clone(current);
  staleExport.meta.baseDataHash = '0'.repeat(64);
  staleExport.meta.exportDataHash = computeFoodsDataHash(staleExport.foods);
  const incoming = path.join(sandbox.root, 'stale.json');
  fs.writeFileSync(incoming, JSON.stringify(staleExport), 'utf8');
  const before = hashFile(sandbox.data);
  const refused = runScript('scripts/apply-food-equivalents.mjs', [incoming], sandbox);
  assert.notEqual(refused.status, 0);
  assert.match(`${refused.stdout}\n${refused.stderr}`, /périmé|stale|baseDataHash/i);
  assert.equal(hashFile(sandbox.data), before);

  const governance = assertApplyGovernance(current, staleExport, {});
  assert.equal(governance.ok, false);
});

test('review import refuses duplicate IDs before initFrom', () => {
  const payload = {
    meta: { schemaVersion: 2, totalFoods: 2 },
    foods: [cleanFood({ id: 'dup' }), cleanFood({ id: 'dup', names: { fr: 'B', en: 'B' } })],
  };
  const gate = validateReviewImport(payload);
  assert.equal(gate.ok, false);
  assert.deepEqual(gate.duplicateIds, ['dup']);
  const app = fs.readFileSync(path.join(ROOT, 'tools', 'food-data-review-app.js'), 'utf8');
  assert.match(app, /validateReviewImport/);
  assert.match(app, /DUPLICATE_ID/);
});

test('schema rejects negative detailed fat components', () => {
  const payload = clone(realPayload);
  payload.foods[0].nutrients.saturatedFatG = -1;
  payload.foods[0].nutrients.polyunsaturatedFatG = -0.5;
  payload.foods[0].nutrients.monounsaturatedFatG = -2;
  const validation = validateFoodEquivalentsPayload(payload);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((e) => /saturatedFatG|minimum/i.test(`${e.path} ${e.message}`)));
});

test('semver bump policy helpers work', () => {
  assert.equal(bumpSemver('1.0.0', 'patch'), '1.0.1');
  assert.equal(bumpSemver('1.0.0', 'minor'), '1.1.0');
  assert.equal(bumpSemver('1.0.0', 'major'), '2.0.0');
});

test('production files retain their exact before-suite hashes', () => {
  for (const file of REAL_PATHS) {
    assert.equal(hashFile(file), beforeHashes.get(file), `unexpected production write: ${file}`);
  }
});
