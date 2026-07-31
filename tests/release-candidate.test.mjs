import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CALCULATION_MODEL_VERSIONS,
  resolveCalculationModelVersion,
} from '../src/lib/calculation-models.mjs';
import {
  assertForbiddenMergesRespected,
  assertMandatorySpecialCases,
  assertUniqueFullCoverage,
  buildLegacyContext,
  buildRollupIndex,
  roundPreviewNutrients,
} from '../src/lib/hybrid-rollup-adapter.mjs';
import { calculatePlan, compareLegacyAndHybrid } from '../src/lib/calculation-engine.mjs';
import {
  PROTECTED_RC_BASELINE,
  assertProtectedFilesUnchanged,
  hashFile,
} from '../src/lib/rc-data-protection.mjs';
import { releaseCandidateGeneratedAt } from '../src/lib/rc-determinism.mjs';
import {
  defaultFoodIdResolver,
  runAcceptanceScenarios,
  TYPICAL_DAY_PORTIONS,
} from '../src/lib/rc-scenarios.mjs';
import { roundHalfAwayFromZero } from '../src/lib/descriptive-stats.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

function loadContext() {
  const foodsPayload = readJson('src/data/food-equivalents.json');
  const categoryMapping = readJson('src/data/category-mapping.json');
  const proposal = readJson('reports/exchange-profile-decision/exchange-rollup-proposal.json');
  const rollupIndex = buildRollupIndex(proposal);
  return {
    foodsPayload,
    categoryMapping,
    proposal,
    rollupIndex,
    legacyRefs: buildLegacyContext(categoryMapping),
    foodsById: new Map(foodsPayload.foods.map((food) => [food.id, food])),
  };
}

test('protected nutrition files match RC baseline hashes', () => {
  assertProtectedFilesUnchanged();
  for (const [file, expected] of Object.entries(PROTECTED_RC_BASELINE)) {
    assert.equal(hashFile(file), expected, file);
  }
});

test('287/287 unique rollup assignments and 28 rollups', () => {
  const { rollupIndex, foodsPayload } = loadContext();
  assert.equal(foodsPayload.foods.length, 287);
  assertUniqueFullCoverage(rollupIndex, 287, 28);
  assert.equal(rollupIndex.byFoodId.size, 287);
  assert.equal(rollupIndex.byRollupId.size, 28);
});

test('mandatory special cases and forbidden merges', () => {
  const { rollupIndex } = loadContext();
  assertMandatorySpecialCases(rollupIndex);
  assertForbiddenMergesRespected(rollupIndex);
});

test('missing calculationModelVersion falls back to legacy-a without migration', () => {
  assert.equal(resolveCalculationModelVersion({}), CALCULATION_MODEL_VERSIONS.LEGACY_A);
  assert.equal(resolveCalculationModelVersion({ calculationModelVersion: null }), CALCULATION_MODEL_VERSIONS.LEGACY_A);
  const ctx = loadContext();
  const result = calculatePlan({
    entries: [{ type: 'group', group: 'protein', portions: 1 }],
  }, ctx);
  assert.equal(result.calculationModelVersion, CALCULATION_MODEL_VERSIONS.LEGACY_A);
});

test('legacy-a is bit-for-bit with MOYENNES for typical day', () => {
  const ctx = loadContext();
  const entries = Object.entries(TYPICAL_DAY_PORTIONS)
    .filter(([, n]) => n > 0)
    .map(([group, portions]) => ({ type: 'group', group, portions }));
  const result = calculatePlan({
    calculationModelVersion: CALCULATION_MODEL_VERSIONS.LEGACY_A,
    entries,
  }, ctx);
  // 4*9 + 4*3 + 3*2 + 2*1 + 2*7 + 3*1 = 36+12+6+2+14+3 = 73 protein
  assert.equal(result.totals.proteinG, 73);
  assert.equal(result.totals.carbsG, 149);
  assert.equal(result.totals.fatG, 38);
  assert.equal(result.totals.fiberG, null);
});

test('null nutrients are preserved (never coerced to 0)', () => {
  const ctx = loadContext();
  const result = calculatePlan({
    calculationModelVersion: CALCULATION_MODEL_VERSIONS.LEGACY_A,
    entries: [{ type: 'group', group: 'protein', portions: 2 }],
  }, ctx);
  assert.equal(result.totals.fiberG, null);
  assert.equal(result.totals.declaredKcal, null);
});

test('deterministic rounding policy for hybrid preview', () => {
  assert.equal(roundHalfAwayFromZero(1.25, 1), 1.3);
  assert.equal(roundHalfAwayFromZero(1.24, 1), 1.2);
  assert.equal(roundHalfAwayFromZero(15.5, 0), 16);
  const rounded = roundPreviewNutrients({
    proteinG: 1.25,
    carbsG: 15.4,
    fiberG: 1.24,
    fatG: 4.95,
    declaredKcal: 55.5,
  });
  assert.deepEqual(rounded, {
    proteinG: 1.3,
    carbsG: 15,
    fiberG: 1.2,
    fatG: 5,
    declaredKcal: 56,
  });
});

test('Core Power, whey, barley, goat, fresh cheese, fatty protein cases', () => {
  const ctx = loadContext();
  const cases = [
    ['produits-laitiers-bottle-core-power-fairlife', 'rollup-dairy-protein-rtd'],
    ['autres-sources-proteinees-scoop-whey-protein', 'rollup-whey-powders'],
    ['feculents-cooked-barley', 'rollup-starch-cereal'],
    ['produits-laitiers-goat-milk-whole', 'rollup-dairy-milk-yogurt'],
    ['produits-laitiers-cottage-cheese', 'rollup-dairy-fresh-cheese'],
    ['poissons-fruits-mer-mackerel', 'rollup-protein-fatty'],
  ];
  for (const [foodId, rollupId] of cases) {
    assert.equal(ctx.rollupIndex.byFoodId.get(foodId).exchangeRollupId, rollupId);
  }
  assert.notEqual(ctx.rollupIndex.byFoodId.get('feculents-cooked-barley').exchangeRollupId, 'rollup-protein-bars');
  assert.notEqual(ctx.rollupIndex.byFoodId.get('produits-laitiers-goat-milk-whole').exchangeRollupId, 'rollup-dairy-plant-drink');
  assert.equal(ctx.rollupIndex.byRollupId.get('rollup-whey-powders').calculatorBridge.calculatorGroup, 'whey');
});

test('insufficient sample actionable plan falls back to legacy-a explicitly', () => {
  const ctx = loadContext();
  const hybrid = calculatePlan({
    calculationModelVersion: CALCULATION_MODEL_VERSIONS.HYBRID_DA_RC,
    actionable: true,
    entries: [{ type: 'food', foodId: 'produits-laitiers-bottle-core-power-fairlife', portions: 1 }],
  }, ctx);
  assert.equal(hybrid.fallbacks.length, 1);
  assert.equal(hybrid.lineItems[0].fallbackApplied, true);
  assert.equal(hybrid.lineItems[0].nutrients.proteinG, ctx.legacyRefs.dairy.proteinG);
  assert.ok(hybrid.warnings.some((warning) => warning.code === 'insufficient_sample'));
});

test('A ↔ D/A round-trip preserves A inputs and A totals', () => {
  const ctx = loadContext();
  const entries = Object.entries(TYPICAL_DAY_PORTIONS)
    .filter(([, n]) => n > 0)
    .map(([group, portions]) => ({ type: 'group', group, portions }));
  const a1 = calculatePlan({ calculationModelVersion: 'legacy-a', entries }, ctx);
  compareLegacyAndHybrid(entries, ctx);
  const a2 = calculatePlan({ calculationModelVersion: 'legacy-a', entries }, ctx);
  assert.deepEqual(a2.totals, a1.totals);
  assert.deepEqual(entries, Object.entries(TYPICAL_DAY_PORTIONS)
    .filter(([, n]) => n > 0)
    .map(([group, portions]) => ({ type: 'group', group, portions })));
});

test('acceptance scenarios all PASS', () => {
  const ctx = loadContext();
  const report = runAcceptanceScenarios(ctx, { foodIdResolver: defaultFoodIdResolver });
  assert.equal(report.failed, 0, JSON.stringify(report.scenarios.filter((row) => row.result === 'FAIL'), null, 2));
  assert.equal(report.passed, 10);
});

test('hybrid-da-rc is never implied as production default in package scripts', () => {
  const pkg = readJson('package.json');
  assert.ok(pkg.scripts['rc:preview']);
  assert.ok(pkg.scripts['rc:verify']);
  // Normal generate/test scripts must not force hybrid preview as default calculator mode.
  assert.doesNotMatch(pkg.scripts.generate || '', /hybrid-da-rc/);
  assert.doesNotMatch(pkg.scripts.test || '', /calculationModelVersion=hybrid/);
});

test('release-candidate generatedAt is deterministic from nutrition version meta', () => {
  const versionMeta = readJson('src/data/nutrition-data-version.json');
  const a = releaseCandidateGeneratedAt(versionMeta);
  const b = releaseCandidateGeneratedAt(versionMeta);
  assert.equal(a, b);
  assert.equal(a, versionMeta.lastModifiedAt);
  assert.notEqual(a, new Date().toISOString());
});
