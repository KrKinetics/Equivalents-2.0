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
  resolutionSnapshotHash,
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
import {
  diffMaterialData,
  validateVerifyTransition,
  validateVerifyTransaction,
} from '../src/lib/verification-integrity.mjs';
import { validateVerificationEligibility } from '../src/lib/verification-eligibility.mjs';
import {
  knownSourceReferenceIds,
  isValidApprovedAt,
  isValidIsoDateOnly,
  isValidIsoDateTime,
} from '../src/lib/source-validators.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const VERSION_PATH = path.join(ROOT, 'src', 'data', 'nutrition-data-version.json');
const GROUPS_PATH = path.join(ROOT, 'src', 'data', 'calculation-groups.json');
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

function payloadWithFoods(foods, meta = {}) {
  const hash = computeFoodsDataHash(foods);
  return {
    meta: {
      schemaVersion: 2,
      totalFoods: foods.length,
      baseDataHash: hash,
      exportDataHash: hash,
      ...meta,
    },
    foods,
  };
}

function asVerified(food, meta = {}) {
  const verifiedAt = meta.verifiedAt || '2026-07-29T00:00:00.000Z';
  const verifiedBy = meta.verifiedBy || 'Reviewer';
  const datasetVersion = meta.datasetVersion || '1.0.0';
  const versionAfter = Math.max(2, Number.isInteger(food.version) ? food.version : 2);
  const versionBefore = versionAfter - 1;
  const transactionId = meta.transactionId || `verify-${food.id}-${versionAfter}`;
  food.version = versionAfter;
  food.status = 'verified';
  food.verification = {
    status: 'verified',
    verifiedAt,
    verifiedBy,
    datasetVersion,
  };
  food.history = [
    ...(food.history || []),
    {
      timestamp: verifiedAt,
      by: verifiedBy,
      action: 'verify',
      transactionId,
      path: 'status',
      oldValue: 'unverified',
      newValue: 'verified',
      versionBefore,
      versionAfter,
    },
    {
      timestamp: verifiedAt,
      by: verifiedBy,
      action: 'verify',
      transactionId,
      path: 'verification.status',
      oldValue: 'unverified',
      newValue: 'verified',
      versionBefore,
      versionAfter,
    },
    {
      timestamp: verifiedAt,
      by: verifiedBy,
      action: 'verify',
      transactionId,
      path: 'verification.verifiedAt',
      oldValue: null,
      newValue: verifiedAt,
      versionBefore,
      versionAfter,
    },
    {
      timestamp: verifiedAt,
      by: verifiedBy,
      action: 'verify',
      transactionId,
      path: 'verification.verifiedBy',
      oldValue: null,
      newValue: verifiedBy,
      versionBefore,
      versionAfter,
    },
    {
      timestamp: verifiedAt,
      by: verifiedBy,
      action: 'verify',
      transactionId,
      path: 'verification.datasetVersion',
      oldValue: null,
      newValue: datasetVersion,
      versionBefore,
      versionAfter,
    },
  ];
  return food;
}

function appendVerifyTransaction(food, {
  verifiedAt,
  verifiedBy = 'Reviewer-2',
  datasetVersion = '1.0.1',
  transactionId = `verify-${food.id}-${verifiedAt}`,
} = {}) {
  const versionBefore = food.version;
  const versionAfter = versionBefore + 1;
  const previous = clone(food.verification);
  food.version = versionAfter;
  food.status = 'verified';
  food.verification = {
    status: 'verified',
    verifiedAt,
    verifiedBy,
    datasetVersion,
  };
  const values = [
    ['status', 'verified', 'verified'],
    ['verification.status', previous.status, 'verified'],
    ['verification.verifiedAt', previous.verifiedAt, verifiedAt],
    ['verification.verifiedBy', previous.verifiedBy, verifiedBy],
    ['verification.datasetVersion', previous.datasetVersion, datasetVersion],
  ];
  for (const [path, oldValue, newValue] of values) {
    food.history.push({
      timestamp: verifiedAt,
      by: verifiedBy,
      action: 'verify',
      transactionId,
      path,
      oldValue,
      newValue,
      versionBefore,
      versionAfter,
    });
  }
  return food;
}

function markVerifiedWithTransaction(food, {
  verifiedAt = '2026-07-29T08:00:00.000Z',
  verifiedBy = 'Eligibility Reviewer',
  datasetVersion = '1.0.1',
  transactionId = `verify-${food.id}-${verifiedAt}`,
} = {}) {
  applyFoodChange(food, {
    patches: [
      { path: 'status', value: 'verified' },
      { path: 'verification.status', value: 'verified' },
      { path: 'verification.verifiedAt', value: verifiedAt },
      { path: 'verification.verifiedBy', value: verifiedBy },
      { path: 'verification.datasetVersion', value: datasetVersion },
    ],
    by: verifiedBy,
    action: 'verify',
    transactionId,
    administrative: true,
    at: verifiedAt,
  });
  return food;
}

function makeSandbox(name, { copyGroups = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `equiv-alim-${name}-`));
  const data = path.join(root, 'food-equivalents.json');
  const version = path.join(root, 'nutrition-data-version.json');
  const reports = path.join(root, 'reports');
  const backups = path.join(root, 'backups');
  const releases = path.join(root, 'releases');
  const review = path.join(root, 'food-data-review-data.js');
  const groups = path.join(root, 'calculation-groups.json');
  fs.copyFileSync(DATA_PATH, data);
  fs.copyFileSync(VERSION_PATH, version);
  if (copyGroups) fs.copyFileSync(GROUPS_PATH, groups);
  fs.mkdirSync(reports, { recursive: true });
  fs.mkdirSync(backups, { recursive: true });
  fs.mkdirSync(releases, { recursive: true });
  return {
    root,
    data,
    version,
    reports,
    backups,
    releases,
    review,
    groups,
    env: {
      ...process.env,
      PROJECT_ROOT: ROOT,
      FOOD_DATA_PATH: data,
      VERSION_DATA_PATH: version,
      REPORTS_DIR: reports,
      BACKUPS_DIR: backups,
      RELEASES_DIR: releases,
      REVIEW_DATA_PATH: review,
      ...(copyGroups ? { GROUPS_DATA_PATH: groups } : {}),
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
  const food = asVerified(cleanFood());
  assert.equal(getFoodStatus(food), 'verified');
  assert.equal(food.verification.datasetVersion, '1.0.0');
  const result = applyFoodChange(food, {
    path: 'nutrients.proteinG',
    value: 5,
    by: 'coach',
    reason: 'manual correction draft',
  });
  assert.equal(result.unverified, true);
  assert.equal(getFoodStatus(food), 'unverified');
  assert.equal(food.nutrients.proteinG, 5);
  assert.equal(food.verification.verifiedAt, null);
  assert.equal(food.verification.verifiedBy, null);
  assert.equal(food.verification.datasetVersion, null);
  assert.ok(food.history.some((h) => h.action === 'auto_unverify'));
  assert.ok(
    food.history.some(
      (h) =>
        h.previousVerification?.verifiedBy === 'Reviewer' &&
        h.previousVerification?.datasetVersion === '1.0.0'
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

test('knownSourceReferenceIds excludes legacy and source.name', () => {
  const food = cleanFood({
    legacySource: { reference: 'Legacy Guide', referenceId: 'noix[0]' },
    source: {
      ...cleanFood().source,
      name: 'Canadian Nutrient File',
      recordId: 'CNF-123',
    },
  });
  const ids = knownSourceReferenceIds(food);
  assert.ok(ids.includes('CNF-123'));
  assert.equal(ids.includes('Canadian Nutrient File'), false);
  assert.equal(ids.includes('noix[0]'), false);
  assert.equal(ids.includes('Legacy Guide'), false);
});

test('legacySource and source.name cannot resolve KCAL_DIFF_HIGH; recordId can', () => {
  const base = cleanFood({
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
  });
  const fieldsHash = resolutionSnapshotHash('KCAL_DIFF_HIGH', base);
  const common = {
    code: 'KCAL_DIFF_HIGH',
    reason: 'documented',
    approvedBy: 'Reviewer',
    approvedAt: '2026-07-29',
    fieldsHash,
    createdAt: '2026-07-29T12:00:00.000Z',
    version: 1,
  };

  const legacyFood = clone(base);
  legacyFood.auditResolutions = [{ ...common, sourceReferenceId: 'test[0]' }];
  assert.equal(getResolutionState(legacyFood, 'KCAL_DIFF_HIGH').status, 'invalid');

  const nameFood = clone(base);
  nameFood.auditResolutions = [{ ...common, sourceReferenceId: 'Canadian Nutrient File' }];
  assert.equal(getResolutionState(nameFood, 'KCAL_DIFF_HIGH').status, 'invalid');

  const recordFood = clone(base);
  recordFood.auditResolutions = [{ ...common, sourceReferenceId: 'CNF-123' }];
  assert.equal(getResolutionState(recordFood, 'KCAL_DIFF_HIGH').status, 'resolved_documented');
  assert.equal(auditFood(recordFood).errorCount, 0);

  const noCreated = clone(base);
  noCreated.auditResolutions = [{ ...common, sourceReferenceId: 'CNF-123', createdAt: undefined }];
  delete noCreated.auditResolutions[0].createdAt;
  assert.equal(getResolutionState(noCreated, 'KCAL_DIFF_HIGH').status, 'invalid');

  const noVersion = clone(base);
  noVersion.auditResolutions = [{ ...common, sourceReferenceId: 'CNF-123' }];
  delete noVersion.auditResolutions[0].version;
  assert.equal(getResolutionState(noVersion, 'KCAL_DIFF_HIGH').status, 'invalid');
});

test('numeric validation rejects strings, negatives and non-finite values', () => {
  const cases = [
    { path: ['nutrients', 'proteinG'], value: 'abc', code: 'INVALID_NUMERIC_TYPE' },
    { path: ['nutrients', 'proteinG'], value: '5', code: 'INVALID_NUMERIC_TYPE' },
    { path: ['nutrients', 'saturatedFatG'], value: -1, code: 'NEGATIVE_VALUE' },
    { path: ['nutrients', 'polyunsaturatedFatG'], value: -1, code: 'NEGATIVE_VALUE' },
    { path: ['nutrients', 'monounsaturatedFatG'], value: -1, code: 'NEGATIVE_VALUE' },
    { path: ['portion', 'amount'], value: '100', code: 'INVALID_NUMERIC_TYPE' },
    { path: ['portion', 'grams'], value: Infinity, code: 'NON_FINITE_VALUE' },
  ];
  for (const { path: fieldPath, value, code } of cases) {
    const food = cleanFood();
    let cursor = food;
    for (let i = 0; i < fieldPath.length - 1; i += 1) cursor = cursor[fieldPath[i]];
    cursor[fieldPath[fieldPath.length - 1]] = value;
    const result = auditFood(food);
    assert.ok(
      result.alerts.some((a) => a.severity === 'ERROR' && a.code === code),
      `${fieldPath.join('.')}=${String(value)} expected ${code}, got ${JSON.stringify(result.alerts)}`
    );
    if (fieldPath[1] === 'proteinG' && value === 'abc') {
      assert.equal(canMarkVerified(food, result.alerts), false);
    }
  }
});

test('accessedAt 2026-02-30 produces a single deduped source alert', () => {
  const food = cleanFood({
    source: {
      ...cleanFood().source,
      accessedAt: '2026-02-30',
    },
  });
  const result = validateSource(food);
  const accessAlerts = result.alerts.filter((a) => a.code === 'SOURCE_ACCESS_DATE_MISSING');
  assert.equal(accessAlerts.length, 1);
});

test('exportDataHash mismatch is refused even with allow-stale', () => {
  const current = clone(realPayload);
  const incoming = clone(realPayload);
  incoming.meta.baseDataHash = computeFoodsDataHash(current.foods);
  incoming.meta.exportDataHash = 'deadbeef';
  const refused = assertApplyGovernance(current, incoming, {});
  assert.equal(refused.ok, false);
  assert.ok(refused.errors.some((e) => /EXPORT_HASH_MISMATCH/.test(e)));

  const stillRefused = assertApplyGovernance(current, incoming, {
    allowStale: true,
    staleReason: 'emergency',
  });
  assert.equal(stillRefused.ok, false);
  assert.ok(stillRefused.errors.some((e) => /EXPORT_HASH_MISMATCH/.test(e)));

  incoming.meta.exportDataHash = computeFoodsDataHash(incoming.foods);
  const ok = assertApplyGovernance(current, incoming, {});
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
});

test('history and auditResolutions are append-only', () => {
  const currentFood = cleanFood({
    id: 'hist-1',
    version: 2,
    history: [
      { timestamp: '2026-07-29T00:00:00.000Z', action: 'bootstrap_import', by: 'sys' },
    ],
    auditResolutions: [],
  });
  const current = { foods: [currentFood], meta: { schemaVersion: 2, totalFoods: 1 } };

  const rewritten = clone(current);
  rewritten.foods[0].history[0].action = 'tampered';
  rewritten.meta.baseDataHash = computeFoodsDataHash(current.foods);
  rewritten.meta.exportDataHash = computeFoodsDataHash(rewritten.foods);
  assert.equal(assertApplyGovernance(current, rewritten, {}).ok, false);

  const appended = clone(current);
  appended.foods[0].history.push({
    timestamp: '2026-07-29T01:00:00.000Z',
    action: 'update',
    by: 'coach',
    path: 'names.fr',
    oldValue: 'a',
    newValue: 'b',
    versionBefore: 2,
    versionAfter: 3,
  });
  appended.foods[0].version = 3;
  appended.meta.baseDataHash = computeFoodsDataHash(current.foods);
  appended.meta.exportDataHash = computeFoodsDataHash(appended.foods);
  assert.equal(assertApplyGovernance(current, appended, {}).ok, true);

  const withRes = clone(current);
  withRes.foods[0].auditResolutions = [
    {
      code: 'KCAL_DIFF_HIGH',
      reason: 'ok',
      approvedBy: 'A',
      approvedAt: '2026-07-29',
      sourceReferenceId: 'CNF-123',
      fieldsHash: 'kcal:4|21|2|118',
      createdAt: '2026-07-29T12:00:00.000Z',
      version: 1,
    },
  ];
  withRes.foods[0].version = 2;
  withRes.meta.baseDataHash = computeFoodsDataHash(current.foods);
  withRes.meta.exportDataHash = computeFoodsDataHash(withRes.foods);
  assert.equal(assertApplyGovernance(current, withRes, {}).ok, false, 'resolution without version bump');

  const withResOk = clone(withRes);
  withResOk.foods[0].version = 3;
  withResOk.foods[0].history.push({
    timestamp: '2026-07-29T02:00:00.000Z',
    action: 'document_audit_resolution',
    by: 'A',
    path: 'auditResolutions',
    versionBefore: 2,
    versionAfter: 3,
  });
  withResOk.meta.exportDataHash = computeFoodsDataHash(withResOk.foods);
  assert.equal(assertApplyGovernance(current, withResOk, {}).ok, true);

  const mutatedRes = clone(withResOk);
  mutatedRes.foods[0].auditResolutions[0].fieldsHash = 'changed';
  mutatedRes.meta.baseDataHash = computeFoodsDataHash(withResOk.foods);
  mutatedRes.meta.exportDataHash = computeFoodsDataHash(mutatedRes.foods);
  assert.equal(
    assertApplyGovernance(
      { foods: withResOk.foods, meta: { schemaVersion: 2, totalFoods: 1 } },
      mutatedRes,
      {}
    ).ok,
    false
  );
});

test('validateReviewImport refuses structural defects and accepts valid payload', () => {
  assert.equal(
    validateReviewImport({
      meta: { schemaVersion: 2, totalFoods: 1 },
      foods: [{ names: { fr: 'A', en: 'A' } }],
    }).ok,
    false
  );
  assert.equal(
    validateReviewImport({
      meta: { schemaVersion: 2, totalFoods: 1 },
      foods: [cleanFood({ version: 'abc' })],
    }).ok,
    false
  );
  const noNutrients = cleanFood();
  delete noNutrients.nutrients;
  assert.equal(
    validateReviewImport({ meta: { schemaVersion: 2, totalFoods: 1 }, foods: [noNutrients] }).ok,
    false
  );
  const mismatch = cleanFood({ status: 'verified', verification: { status: 'unverified' } });
  assert.equal(
    validateReviewImport({ meta: { schemaVersion: 2, totalFoods: 1 }, foods: [mismatch] }).ok,
    false
  );
  const valid = {
    meta: { schemaVersion: 2, totalFoods: 1, notes: [] },
    foods: [cleanFood({ id: 'valid-1' })],
  };
  assert.equal(validateReviewImport(valid).ok, true, JSON.stringify(validateReviewImport(valid)));
});

test('successful data:approve runs only inside sandbox releases dir', () => {
  const sandbox = makeSandbox('approve-ok', { copyGroups: true });
  const food = asVerified(
    cleanFood({
      id: 'approve-food-1',
      classificationStatus: 'approved',
    })
  );
  const payload = {
    meta: { schemaVersion: 2, totalFoods: 1, notes: [] },
    foods: [food],
  };
  const hash = computeFoodsDataHash(payload.foods);
  fs.writeFileSync(sandbox.data, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(
    sandbox.version,
    JSON.stringify(
      {
        version: '1.0.0',
        status: 'review',
        dataHash: hash,
        shortHash: hash.slice(0, 12),
        createdAt: '2026-07-29T00:00:00.000Z',
        approvedAt: null,
        approvedBy: null,
        previousVersion: null,
        changeSummary: 'sandbox ready',
        totalFoods: 1,
        verifiedFoods: 1,
        unverifiedFoods: 0,
      },
      null,
      2
    ),
    'utf8'
  );
  fs.writeFileSync(
    sandbox.groups,
    JSON.stringify(
      {
        meta: { schemaVersion: 2 },
        groups: [
          {
            id: 'starch',
            names: { fr: 'Féculents', en: 'Starches' },
            referenceProfile: {
              proteinG: 4,
              carbsG: 21,
              fiberG: 2,
              fatG: 2,
              kcal: 118,
            },
            tolerances: { proteinG: 2, carbsG: 4, fatG: 2, kcal: 15 },
            approvalCriteria: {
              minVerifiedCount: 1,
              minCoveragePercent: 100,
              requireAllActiveFoodsVerified: true,
              requireNoFoodsOutsideTolerance: false,
            },
            approved: true,
          },
        ],
      },
      null,
      2
    ),
    'utf8'
  );

  const realReleasesBefore = fs.existsSync(path.join(ROOT, 'releases', 'data'))
    ? fs.readdirSync(path.join(ROOT, 'releases', 'data')).filter((n) => n !== '.gitkeep')
    : [];
  const productionBefore = hashFile(DATA_PATH);
  const result = runScript(
    'scripts/approve-dataset.mjs',
    ['--by', 'Sandbox Reviewer', '--bump', 'patch'],
    sandbox
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const approvedVersion = JSON.parse(fs.readFileSync(sandbox.version, 'utf8'));
  assert.equal(approvedVersion.version, '1.0.1');
  assert.equal(approvedVersion.status, 'approved');
  const archive = path.join(sandbox.releases, '1.0.1');
  assert.ok(fs.existsSync(path.join(archive, 'food-equivalents.json')));
  assert.ok(fs.existsSync(path.join(archive, 'audit-report.json')));
  assert.ok(fs.existsSync(path.join(archive, 'release-manifest.json')));
  const manifest = JSON.parse(fs.readFileSync(path.join(archive, 'release-manifest.json'), 'utf8'));
  assert.equal(manifest.dataHash, hash);
  assert.ok(manifest.fileHashes['food-equivalents.json']);
  assert.ok(manifest.fileHashes['audit-report.json']);
  assert.ok(fs.readdirSync(sandbox.backups).some((n) => n.includes('pre-approve')));
  assert.equal(hashFile(DATA_PATH), productionBefore);
  const realReleasesAfter = fs.existsSync(path.join(ROOT, 'releases', 'data'))
    ? fs.readdirSync(path.join(ROOT, 'releases', 'data')).filter((n) => n !== '.gitkeep')
    : [];
  assert.deepEqual(realReleasesAfter, realReleasesBefore);
  const afterGit = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout;
  // Ignore this test file's own uncommitted edits by comparing production paths only
  assert.equal(hashFile(DATA_PATH), beforeHashes.get(DATA_PATH));
  assert.ok(!afterGit.includes('src/data/food-equivalents.json'));
});

test('verified without metadata is refused by audit, import, apply and approve', () => {
  const incomplete = cleanFood({
    id: 'verified-incomplete',
    status: 'verified',
    verification: {
      status: 'verified',
      verifiedAt: null,
      verifiedBy: null,
      datasetVersion: null,
    },
    history: [],
  });
  const audited = auditFood(incomplete);
  for (const code of [
    'VERIFICATION_DATE_MISSING',
    'VERIFICATION_REVIEWER_MISSING',
    'VERIFICATION_DATASET_VERSION_MISSING',
    'VERIFICATION_HISTORY_MISSING',
  ]) {
    assert.ok(
      audited.alerts.some((a) => a.code === code),
      `missing ${code} in ${JSON.stringify(audited.alerts)}`
    );
  }

  const payload = {
    meta: { schemaVersion: 2, totalFoods: 1, notes: [] },
    foods: [incomplete],
  };
  assert.equal(validateReviewImport(payload).ok, false);
  assert.equal(validateFoodEquivalentsPayload(payload).ok, false);

  const sandbox = makeSandbox('verified-incomplete');
  const current = JSON.parse(fs.readFileSync(sandbox.data, 'utf8'));
  const incoming = clone(current);
  incoming.foods[0] = {
    ...incoming.foods[0],
    ...incomplete,
    id: incoming.foods[0].id,
  };
  incoming.meta.baseDataHash = computeFoodsDataHash(current.foods);
  incoming.meta.exportDataHash = computeFoodsDataHash(incoming.foods);
  const incomingPath = path.join(sandbox.root, 'incoming.json');
  fs.writeFileSync(incomingPath, JSON.stringify(incoming), 'utf8');
  const apply = runScript('scripts/apply-food-equivalents.mjs', [incomingPath], sandbox);
  assert.notEqual(apply.status, 0);

  fs.writeFileSync(sandbox.data, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(
    sandbox.version,
    JSON.stringify(
      {
        version: '1.0.0',
        status: 'review',
        dataHash: computeFoodsDataHash(payload.foods),
        shortHash: 'abc',
        createdAt: '2026-07-29T00:00:00.000Z',
        totalFoods: 1,
        verifiedFoods: 1,
        unverifiedFoods: 0,
      },
      null,
      2
    ),
    'utf8'
  );
  const approve = runScript(
    'scripts/approve-dataset.mjs',
    ['--by', 'Reviewer', '--bump', 'patch'],
    sandbox
  );
  assert.notEqual(approve.status, 0);
});

test('legacy source plus fabricated complete verify is refused everywhere', () => {
  const legacy = cleanFood({
    id: 'legacy-fabricated-verify',
    source: Object.fromEntries(
      Object.keys(cleanFood().source).map((key) => [key, null])
    ),
  });
  const beforeAudit = auditFood(legacy);
  assert.equal(beforeAudit.errorCount, 0);
  assert.ok(beforeAudit.alerts.some((alert) => alert.code === 'LEGACY_SOURCE_ONLY'));

  const current = payloadWithFoods([clone(legacy)]);
  const incoming = clone(current);
  markVerifiedWithTransaction(incoming.foods[0], {
    transactionId: 'verify-legacy-source',
  });
  incoming.meta.exportDataHash = computeFoodsDataHash(incoming.foods);

  const audited = auditFood(incoming.foods[0]);
  assert.ok(audited.alerts.some((alert) => alert.code === 'INSUFFICIENT_SOURCE'));
  assert.ok(audited.alerts.some((alert) => alert.code === 'VERIFIED_WITH_OPEN_ERRORS'));
  assert.equal(canMarkVerified(incoming.foods[0], audited.alerts), false);
  assert.equal(validateReviewImport(incoming).ok, false);

  const governance = assertApplyGovernance(current, incoming);
  assert.equal(governance.ok, false);
  assert.match(governance.errors.join('\n'), /VERIFIED_WITH_OPEN_ERRORS.*INSUFFICIENT_SOURCE/);

  const sandbox = makeSandbox('legacy-verify');
  fs.writeFileSync(sandbox.data, JSON.stringify(current, null, 2), 'utf8');
  const incomingPath = path.join(sandbox.root, 'incoming.json');
  fs.writeFileSync(incomingPath, JSON.stringify(incoming, null, 2), 'utf8');
  const apply = runScript(
    'scripts/apply-food-equivalents.mjs',
    ['--dry-run', incomingPath],
    sandbox
  );
  assert.notEqual(apply.status, 0);
  assert.match(`${apply.stdout}\n${apply.stderr}`, /VERIFIED_WITH_OPEN_ERRORS/);
});

test('open KCAL_DIFF_HIGH blocks a fabricated complete verify', () => {
  const food = cleanFood({ id: 'open-kcal-verify' });
  food.nutrients.declaredKcal = 500;
  markVerifiedWithTransaction(food, { transactionId: 'verify-open-kcal' });
  const item = auditFood(food);
  const eligibility = validateVerificationEligibility(food, item, {
    sourceAuthoritative: validateSource(food).authoritative,
  });
  assert.equal(eligibility.ok, false);
  assert.ok(eligibility.codes.includes('KCAL_DIFF_HIGH'));
  assert.ok(item.alerts.some((alert) => alert.code === 'VERIFIED_WITH_OPEN_ERRORS'));
  assert.equal(validateReviewImport(payloadWithFoods([food])).ok, false);
});

test('documented current KCAL resolution permits verification when no ERROR remains', () => {
  const food = cleanFood({ id: 'resolved-kcal-verify' });
  food.nutrients.declaredKcal = 500;
  food.auditResolutions.push({
    code: 'KCAL_DIFF_HIGH',
    sourceReferenceId: food.source.recordId,
    fieldsHash: resolutionSnapshotHash('KCAL_DIFF_HIGH', food),
    approvedAt: '2026-07-29',
    approvedBy: 'Nutrition Reviewer',
    createdAt: '2026-07-29T07:00:00.000Z',
    version: 1,
    reason: 'Écart confirmé par la source authoritative.',
  });
  markVerifiedWithTransaction(food, { transactionId: 'verify-resolved-kcal' });
  const item = auditFood(food);
  assert.equal(item.errorCount, 0, JSON.stringify(item.alerts));
  assert.equal(canMarkVerified(food, item.alerts), true);
  assert.equal(validateReviewImport(payloadWithFoods([food])).ok, true);
});

test('verify transition refuses fabricated old status and reviewer values', () => {
  const currentFood = cleanFood({ id: 'false-old-values' });
  const incomingStatus = clone(currentFood);
  markVerifiedWithTransaction(incomingStatus, { transactionId: 'verify-false-status' });
  incomingStatus.history.find((entry) => entry.path === 'status').oldValue = 'rejected';
  const statusCheck = validateVerifyTransition(currentFood, incomingStatus);
  assert.equal(statusCheck.ok, false);
  assert.equal(statusCheck.code, 'VERIFICATION_HISTORY_OLD_VALUE_MISMATCH');

  const incomingReviewer = clone(currentFood);
  markVerifiedWithTransaction(incomingReviewer, {
    transactionId: 'verify-false-reviewer',
  });
  incomingReviewer.history.find(
    (entry) => entry.path === 'verification.verifiedBy'
  ).oldValue = 'Ancien coach';
  const reviewerCheck = validateVerifyTransition(currentFood, incomingReviewer);
  assert.equal(reviewerCheck.ok, false);
  assert.equal(reviewerCheck.code, 'VERIFICATION_HISTORY_OLD_VALUE_MISMATCH');
});

test('verify transactionId reuse is refused', () => {
  const transactionId = 'verify-reused-id';
  const currentFood = cleanFood({ id: 'reused-verify-id' });
  markVerifiedWithTransaction(currentFood, { transactionId });
  applyFoodChange(currentFood, {
    path: 'nutrients.proteinG',
    value: 5,
    by: 'Editor',
    at: '2026-07-29T09:00:00.000Z',
  });
  const incomingFood = clone(currentFood);
  markVerifiedWithTransaction(incomingFood, {
    transactionId,
    verifiedAt: '2026-07-29T10:00:00.000Z',
  });
  const validation = validateVerifyTransition(currentFood, incomingFood);
  assert.equal(validation.ok, false);
  assert.equal(validation.code, 'VERIFICATION_TRANSACTION_ID_REUSED');
});

test('non-contiguous verify entries are refused', () => {
  const food = cleanFood({ id: 'non-contiguous-verify' });
  markVerifiedWithTransaction(food, { transactionId: 'verify-not-contiguous' });
  food.history.splice(2, 0, {
    timestamp: '2026-07-29T08:00:00.000Z',
    by: 'Editor',
    action: 'update',
    path: 'auditResolutions',
    oldValue: [],
    newValue: [],
    versionBefore: 1,
    versionAfter: 2,
  });
  const validation = validateVerifyTransaction(food, { requireTransactionId: true });
  assert.equal(validation.ok, false);
  assert.equal(validation.code, 'VERIFICATION_TRANSACTION_NOT_CONTIGUOUS');
});

test('normal UI-style verify transaction has exact values and is importable/applicable', () => {
  const currentFood = cleanFood({ id: 'normal-ui-verify' });
  const current = payloadWithFoods([clone(currentFood)]);
  const incoming = clone(current);
  markVerifiedWithTransaction(incoming.foods[0], {
    transactionId: 'verify-normal-ui',
  });
  incoming.meta.exportDataHash = computeFoodsDataHash(incoming.foods);

  const transition = validateVerifyTransition(currentFood, incoming.foods[0]);
  assert.equal(transition.ok, true, transition.message);
  assert.equal(validateReviewImport(incoming).ok, true);
  assert.equal(assertApplyGovernance(current, incoming).ok, true);
});

test('generic verify history entry is refused', () => {
  const food = asVerified(cleanFood({ id: 'generic-verify' }));
  food.history = [
    {
      timestamp: food.verification.verifiedAt,
      by: food.verification.verifiedBy,
      action: 'verify',
      transactionId: 'generic',
      path: null,
      versionBefore: food.version - 1,
      versionAfter: food.version,
    },
  ];
  const validation = validateVerifyTransaction(food);
  assert.equal(validation.ok, false);
  assert.equal(validation.code, 'VERIFICATION_HISTORY_INCOMPLETE');
  assert.ok(
    auditFood(food).alerts.some((alert) => alert.code === 'VERIFICATION_HISTORY_INCOMPLETE')
  );
});

test('partial verify transaction is refused', () => {
  const food = asVerified(cleanFood({ id: 'partial-verify' }));
  food.history = food.history.filter(
    (entry) => entry.path === 'verification.verifiedAt'
  );
  const validation = validateVerifyTransaction(food);
  assert.equal(validation.ok, false);
  assert.equal(validation.code, 'VERIFICATION_HISTORY_INCOMPLETE');
});

test('material change with false history path is refused', () => {
  const currentFood = asVerified(cleanFood({ id: 'false-material-history' }));
  const current = { foods: [currentFood], meta: { schemaVersion: 2, totalFoods: 1 } };
  const incoming = clone(current);
  incoming.foods[0].nutrients.proteinG = 5;
  incoming.foods[0].version += 1;
  incoming.foods[0].history.push({
    timestamp: '2026-07-29T01:00:00.000Z',
    by: 'coach',
    action: 'update',
    path: 'names.fr',
    oldValue: incoming.foods[0].names.fr,
    newValue: `${incoming.foods[0].names.fr} faux`,
    versionBefore: currentFood.version,
    versionAfter: incoming.foods[0].version,
  });
  incoming.meta.baseDataHash = computeFoodsDataHash(current.foods);
  incoming.meta.exportDataHash = computeFoodsDataHash(incoming.foods);
  const result = assertApplyGovernance(current, incoming, {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /MATERIAL_CHANGE_HISTORY_MISMATCH/.test(error)));
  assert.deepEqual(diffMaterialData(currentFood, incoming.foods[0]), [
    { path: 'nutrients.proteinG', oldValue: 4, newValue: 5 },
  ]);
});

test('exact material history followed by generic verify is refused', () => {
  const currentFood = asVerified(cleanFood({ id: 'generic-reverify' }));
  const current = { foods: [currentFood], meta: { schemaVersion: 2, totalFoods: 1 } };
  const incoming = clone(current);
  incoming.foods[0].nutrients.proteinG = 5;
  incoming.foods[0].version += 1;
  incoming.foods[0].history.push({
    timestamp: '2026-07-29T01:00:00.000Z',
    by: 'coach',
    action: 'correction',
    path: 'nutrients.proteinG',
    oldValue: 4,
    newValue: 5,
    versionBefore: currentFood.version,
    versionAfter: incoming.foods[0].version,
  });
  incoming.foods[0].version += 1;
  incoming.foods[0].verification.verifiedAt = '2026-07-29T02:00:00.000Z';
  incoming.foods[0].verification.verifiedBy = 'Reviewer-2';
  incoming.foods[0].verification.datasetVersion = '1.0.1';
  incoming.foods[0].history.push({
    timestamp: incoming.foods[0].verification.verifiedAt,
    by: 'Reviewer-2',
    action: 'verify',
    transactionId: 'generic-reverify',
    path: null,
    versionBefore: incoming.foods[0].version - 1,
    versionAfter: incoming.foods[0].version,
  });
  incoming.meta.baseDataHash = computeFoodsDataHash(current.foods);
  incoming.meta.exportDataHash = computeFoodsDataHash(incoming.foods);
  const result = assertApplyGovernance(current, incoming, {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /VERIFICATION_HISTORY_INCOMPLETE/.test(error)));
});

test('exact material history followed by complete verify transaction is accepted', () => {
  const currentFood = asVerified(cleanFood({ id: 'complete-reverify' }));
  const current = { foods: [currentFood], meta: { schemaVersion: 2, totalFoods: 1 } };
  const incoming = clone(current);
  incoming.foods[0].nutrients.proteinG = 5;
  incoming.foods[0].version += 1;
  incoming.foods[0].history.push({
    timestamp: '2026-07-29T01:00:00.000Z',
    by: 'coach',
    action: 'correction',
    path: 'nutrients.proteinG',
    oldValue: 4,
    newValue: 5,
    versionBefore: currentFood.version,
    versionAfter: incoming.foods[0].version,
  });
  appendVerifyTransaction(incoming.foods[0], {
    verifiedAt: '2026-07-29T02:00:00.000Z',
  });
  incoming.meta.baseDataHash = computeFoodsDataHash(current.foods);
  incoming.meta.exportDataHash = computeFoodsDataHash(incoming.foods);
  const result = assertApplyGovernance(current, incoming, {});
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('verify transaction timestamp before material modification is refused', () => {
  const currentFood = asVerified(cleanFood({ id: 'early-reverify' }));
  const current = { foods: [currentFood], meta: { schemaVersion: 2, totalFoods: 1 } };
  const incoming = clone(current);
  incoming.foods[0].nutrients.proteinG = 5;
  incoming.foods[0].version += 1;
  incoming.foods[0].history.push({
    timestamp: '2026-07-29T03:00:00.000Z',
    by: 'coach',
    action: 'correction',
    path: 'nutrients.proteinG',
    oldValue: 4,
    newValue: 5,
    versionBefore: currentFood.version,
    versionAfter: incoming.foods[0].version,
  });
  appendVerifyTransaction(incoming.foods[0], {
    verifiedAt: '2026-07-29T02:00:00.000Z',
  });
  incoming.meta.baseDataHash = computeFoodsDataHash(current.foods);
  incoming.meta.exportDataHash = computeFoodsDataHash(incoming.foods);
  const result = assertApplyGovernance(current, incoming, {});
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((error) => /VERIFICATION_TRANSACTION_ORDER_INVALID/.test(error))
  );
  assert.ok(
    result.errors.some((error) => /VERIFIED_MATERIAL_CHANGE_WITHOUT_REVERIFY/.test(error))
  );
});

test('impossible calendar dates are refused', () => {
  assert.equal(isValidIsoDateOnly('2026-02-30'), false);
  assert.equal(isValidIsoDateTime('2026-02-30T12:00:00.000Z'), false);
  assert.equal(isValidIsoDateTime('2026-07-29T99:99:99Z'), false);
  assert.equal(isValidIsoDateTime('not-a-date'), false);
  assert.equal(isValidApprovedAt('2026-02-30'), false);
  assert.equal(isValidApprovedAt('2026-02-30T12:00:00.000Z'), false);

  const food = asVerified(cleanFood());
  food.verification.verifiedAt = '2026-02-30T12:00:00.000Z';
  food.history = food.history.map((h) =>
    h.path === 'verification.verifiedAt' ? { ...h, newValue: food.verification.verifiedAt } : h
  );
  assert.ok(auditFood(food).alerts.some((a) => a.code === 'VERIFICATION_DATE_INVALID'));
});

test('export resume preserves baseDataHash across a second session export', () => {
  const baseFoods = [cleanFood({ id: 'resume-a' })];
  const hashA = computeFoodsDataHash(baseFoods);

  const sessionB = {
    meta: {
      schemaVersion: 2,
      totalFoods: 1,
      notes: [],
      baseDataHash: hashA,
    },
    foods: clone(baseFoods),
  };
  sessionB.foods[0].names.fr = 'Quinoa modifié';
  sessionB.foods[0].version = 2;
  sessionB.foods[0].history.push({
    timestamp: '2026-07-29T03:00:00.000Z',
    by: 'coach',
    action: 'update',
    path: 'names.fr',
    oldValue: 'Quinoa cuit',
    newValue: 'Quinoa modifié',
    versionBefore: 1,
    versionAfter: 2,
  });
  const hashB = computeFoodsDataHash(sessionB.foods);
  sessionB.meta.exportDataHash = hashB;
  sessionB.meta.exportedAt = '2026-07-29T03:00:00.000Z';
  sessionB.meta.exportedBy = 'coach';

  // Simulate initFrom resume: export hash matches → keep baseDataHash = hash(A)
  assert.equal(sessionB.meta.exportDataHash, hashB);
  const resumedBase = sessionB.meta.baseDataHash;
  assert.equal(resumedBase, hashA);

  const sessionB2 = clone(sessionB);
  sessionB2.foods[0].names.en = 'Modified quinoa';
  sessionB2.foods[0].version = 3;
  sessionB2.foods[0].history.push({
    timestamp: '2026-07-29T04:00:00.000Z',
    by: 'coach',
    action: 'update',
    path: 'names.en',
    oldValue: 'Cooked quinoa',
    newValue: 'Modified quinoa',
    versionBefore: 2,
    versionAfter: 3,
  });
  sessionB2.meta.baseDataHash = resumedBase;
  sessionB2.meta.exportDataHash = computeFoodsDataHash(sessionB2.foods);
  assert.equal(sessionB2.meta.baseDataHash, hashA);

  const current = { foods: baseFoods, meta: { schemaVersion: 2, totalFoods: 1 } };
  const gate = assertApplyGovernance(current, sessionB2, {});
  assert.equal(gate.ok, true, JSON.stringify(gate.errors));
});

test('rejected food with incomplete nutrition does not block approval', () => {
  const sandbox = makeSandbox('approve-rejected', { copyGroups: true });
  const verified = asVerified(cleanFood({ id: 'ok-active', classificationStatus: 'approved' }));
  const rejected = cleanFood({
    id: 'rejected-incomplete',
    status: 'rejected',
    verification: {
      status: 'rejected',
      verifiedAt: null,
      verifiedBy: null,
      datasetVersion: null,
    },
    classificationStatus: 'pending',
    nutrients: {
      proteinG: null,
      carbsG: null,
      fiberG: null,
      fatG: null,
      saturatedFatG: null,
      polyunsaturatedFatG: null,
      monounsaturatedFatG: null,
      declaredKcal: null,
    },
  });
  const audited = auditDataset([verified, rejected]);
  assert.ok(audited.summary.rejectedFoodsWithBlockingErrors >= 1);
  assert.equal(audited.summary.activeFoodsWithBlockingErrors, 0);
  assert.equal(audited.summary.activeBlockingErrorCount, 0);
  assert.equal(audited.summary.unverifiedFoods, 0);

  const payload = {
    meta: { schemaVersion: 2, totalFoods: 2, notes: [] },
    foods: [verified, rejected],
  };
  const hash = computeFoodsDataHash(payload.foods);
  fs.writeFileSync(sandbox.data, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(
    sandbox.version,
    JSON.stringify(
      {
        version: '1.0.0',
        status: 'review',
        dataHash: hash,
        shortHash: hash.slice(0, 12),
        createdAt: '2026-07-29T00:00:00.000Z',
        totalFoods: 2,
        verifiedFoods: 1,
        unverifiedFoods: 0,
      },
      null,
      2
    ),
    'utf8'
  );
  fs.writeFileSync(
    sandbox.groups,
    JSON.stringify(
      {
        meta: { schemaVersion: 2 },
        groups: [
          {
            id: 'starch',
            names: { fr: 'Féculents', en: 'Starches' },
            referenceProfile: {
              proteinG: 4,
              carbsG: 21,
              fiberG: 2,
              fatG: 2,
              kcal: 118,
            },
            tolerances: { proteinG: 2, carbsG: 4, fatG: 2, kcal: 15 },
            approvalCriteria: {
              minVerifiedCount: 1,
              minCoveragePercent: 100,
              requireAllActiveFoodsVerified: true,
              requireNoFoodsOutsideTolerance: false,
            },
            approved: true,
          },
        ],
      },
      null,
      2
    ),
    'utf8'
  );
  const result = runScript(
    'scripts/approve-dataset.mjs',
    ['--by', 'Sandbox Reviewer', '--bump', 'patch'],
    sandbox
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const auditResult = runScript('scripts/audit-food-equivalents.mjs', [], sandbox);
  assert.equal(auditResult.status, 0, auditResult.stderr || auditResult.stdout);
  const auditedVersion = JSON.parse(fs.readFileSync(sandbox.version, 'utf8'));
  const auditReport = JSON.parse(
    fs.readFileSync(path.join(sandbox.reports, 'food-equivalents-audit.json'), 'utf8')
  );
  assert.equal(auditedVersion.status, 'approved');
  assert.equal(auditedVersion.rejectedFoods, 1);
  assert.equal(auditedVersion.unverifiedFoods, 0);
  assert.ok(auditedVersion.rejectedBlockingErrorCount > 0);
  assert.equal(auditedVersion.activeBlockingErrorCount, 0);
  assert.ok(
    auditReport.items
      .find((item) => item.id === 'rejected-incomplete')
      ?.alerts.some((alert) => alert.severity === 'ERROR')
  );
});

test('complete A to B to C apply cycle works without allow-stale', () => {
  const sandbox = makeSandbox('apply-cycle');
  const baseA = JSON.parse(fs.readFileSync(sandbox.data, 'utf8'));
  const hashA = computeFoodsDataHash(baseA.foods);

  const exportB = clone(baseA);
  const foodB = exportB.foods[0];
  const oldFr = foodB.names.fr;
  const versionA = foodB.version;
  foodB.names.fr = `${oldFr} B`;
  foodB.version = versionA + 1;
  foodB.history.push({
    timestamp: '2026-07-29T06:00:00.000Z',
    by: 'cycle-test',
    action: 'update',
    path: 'names.fr',
    oldValue: oldFr,
    newValue: foodB.names.fr,
    versionBefore: versionA,
    versionAfter: foodB.version,
  });
  const hashB = computeFoodsDataHash(exportB.foods);
  exportB.meta.baseDataHash = hashA;
  exportB.meta.exportDataHash = hashB;
  exportB.meta.exportedAt = '2026-07-29T06:00:00.000Z';
  exportB.meta.exportedBy = 'cycle-test';
  const pathB = path.join(sandbox.root, 'export-b.json');
  fs.writeFileSync(pathB, JSON.stringify(exportB), 'utf8');

  const applyB = runScript('scripts/apply-food-equivalents.mjs', [pathB], sandbox);
  assert.equal(applyB.status, 0, applyB.stderr || applyB.stdout);
  const appliedB = JSON.parse(fs.readFileSync(sandbox.data, 'utf8'));
  assert.equal(appliedB.meta.baseDataHash, hashB);
  assert.equal(appliedB.meta.exportDataHash, hashB);
  assert.equal(appliedB.meta.lastAppliedFromBaseDataHash, hashA);
  assert.equal(appliedB.meta.lastAppliedExportDataHash, hashB);

  const exportC = clone(appliedB);
  const foodC = exportC.foods[0];
  const oldEn = foodC.names.en;
  const versionB = foodC.version;
  foodC.names.en = `${oldEn} C`;
  foodC.version = versionB + 1;
  foodC.history.push({
    timestamp: '2026-07-29T07:00:00.000Z',
    by: 'cycle-test',
    action: 'correction',
    path: 'names.en',
    oldValue: oldEn,
    newValue: foodC.names.en,
    versionBefore: versionB,
    versionAfter: foodC.version,
  });
  const hashC = computeFoodsDataHash(exportC.foods);
  exportC.meta.baseDataHash = hashB;
  exportC.meta.exportDataHash = hashC;
  exportC.meta.exportedAt = '2026-07-29T07:00:00.000Z';
  exportC.meta.exportedBy = 'cycle-test';
  const pathC = path.join(sandbox.root, 'export-c.json');
  fs.writeFileSync(pathC, JSON.stringify(exportC), 'utf8');

  const applyC = runScript('scripts/apply-food-equivalents.mjs', [pathC], sandbox);
  assert.equal(applyC.status, 0, applyC.stderr || applyC.stdout);
  const appliedC = JSON.parse(fs.readFileSync(sandbox.data, 'utf8'));
  assert.equal(appliedC.meta.baseDataHash, hashC);
  assert.equal(appliedC.meta.exportDataHash, hashC);
  assert.equal(appliedC.meta.lastAppliedFromBaseDataHash, hashB);
  assert.equal(appliedC.foods[0].names.en, foodC.names.en);
});

test('data:apply rolls back food and version when post-apply audit fails', () => {
  const sandbox = makeSandbox('apply-rollback');
  const beforeFood = hashFile(sandbox.data);
  const beforeVersion = hashFile(sandbox.version);
  const incoming = clone(JSON.parse(fs.readFileSync(sandbox.data, 'utf8')));
  const oldName = incoming.foods[0].names.fr;
  incoming.foods[0].names.fr = `${incoming.foods[0].names.fr} rollback-test`;
  incoming.foods[0].version = (incoming.foods[0].version || 1) + 1;
  incoming.foods[0].history = [
    ...(incoming.foods[0].history || []),
    {
      timestamp: '2026-07-29T05:00:00.000Z',
      by: 'test',
      action: 'update',
      path: 'names.fr',
      oldValue: oldName,
      newValue: incoming.foods[0].names.fr,
      versionBefore: incoming.foods[0].version - 1,
      versionAfter: incoming.foods[0].version,
    },
  ];
  incoming.meta.baseDataHash = computeFoodsDataHash(
    JSON.parse(fs.readFileSync(sandbox.data, 'utf8')).foods
  );
  incoming.meta.exportDataHash = computeFoodsDataHash(incoming.foods);
  const incomingPath = path.join(sandbox.root, 'incoming-rollback.json');
  fs.writeFileSync(incomingPath, JSON.stringify(incoming), 'utf8');

  const artifactPaths = [
    path.join(sandbox.reports, 'food-equivalents-audit.json'),
    path.join(sandbox.reports, 'food-equivalents-audit.html'),
    path.join(sandbox.reports, 'food-equivalents-audit.csv'),
    sandbox.review,
  ];
  artifactPaths.forEach((artifact, index) => {
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, `before-${index}`, 'utf8');
  });

  const failingAudit = path.join(sandbox.root, 'failing-audit.mjs');
  fs.writeFileSync(
    failingAudit,
    `import fs from 'fs';
import path from 'path';
const files = [
  path.join(process.env.REPORTS_DIR, 'food-equivalents-audit.json'),
  path.join(process.env.REPORTS_DIR, 'food-equivalents-audit.html'),
  path.join(process.env.REPORTS_DIR, 'food-equivalents-audit.csv'),
  process.env.REVIEW_DATA_PATH,
];
for (const file of files) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'failed-apply-output', 'utf8');
}
process.exit(1);
`,
    'utf8'
  );
  sandbox.env.AUDIT_SCRIPT_PATH = failingAudit;

  const result = runScript('scripts/apply-food-equivalents.mjs', [incomingPath], sandbox);
  assert.notEqual(result.status, 0);
  assert.equal(hashFile(sandbox.data), beforeFood);
  assert.equal(hashFile(sandbox.version), beforeVersion);
  artifactPaths.forEach((artifact, index) => {
    assert.equal(fs.readFileSync(artifact, 'utf8'), `before-${index}`);
  });
});

test('production files retain their exact before-suite hashes', () => {
  for (const file of REAL_PATHS) {
    assert.equal(hashFile(file), beforeHashes.get(file), `unexpected production write: ${file}`);
  }
});
