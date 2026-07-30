import test from 'node:test';
import assert from 'node:assert/strict';
import { mad, percentile } from '../src/lib/descriptive-stats.mjs';
import { analyzeCohort, loadLegacyReferences } from '../src/lib/exchange-profile-analysis.mjs';

const food = (id, nutrients, status = 'verified') => ({ id, names: { fr: id, en: id }, nutrients, status });

test('percentile uses linear interpolation and ignores null without coercion', () => {
  assert.equal(percentile([null, 0, 10, 20], 0.25), 5);
  assert.equal(percentile([], 0.5), null);
});

test('MAD is the median absolute deviation', () => {
  assert.equal(mad([1, 1, 2, 2, 4]), 1);
  assert.equal(mad([null]), null);
});

test('cohort never treats null nutrients as zero', () => {
  const result = analyzeCohort([food('a', { proteinG: null }), food('b', { proteinG: 10 })], { level: 'test', id: 'x' });
  assert.equal(result.nutrients.proteinG.numericCount, 1);
  assert.equal(result.nutrients.proteinG.nullCount, 1);
  assert.equal(result.nutrients.proteinG.mean, 10);
  assert.deepEqual(result.nutrients.proteinG.nullFoodIds, ['a']);
});

test('medoid selection is deterministic on ties', () => {
  const nutrients = { proteinG: 10, carbsG: 2, fiberG: null, fatG: 1, declaredKcal: 60 };
  const result = analyzeCohort([food('z', nutrients), food('a', nutrients)], { level: 'test', id: 'tie' });
  assert.equal(result.medoid.id, 'a');
});

test('legacy references come only from mapping payload', () => {
  const refs = loadLegacyReferences({
    calculatorLegacyMoyennes: { MOYENNES: { pro: { p: 9, g: 0, l: 2 } }, mappingToCalculationGroup: { pro: 'protein' } },
    MOYENNES: { pro: { p: 999, g: 999, l: 999 } },
  });
  assert.equal(refs.protein.proteinG, 9);
  assert.equal(refs.protein.fiberG, null);
  assert.equal(refs.protein.source, 'calculatorLegacyMoyennes');
});

test('cohort counts total, verified, numeric and null values', () => {
  const result = analyzeCohort([
    food('a', { carbsG: 2 }),
    food('b', { carbsG: null }),
    food('c', { carbsG: 7 }, 'pending'),
  ], { level: 'test', id: 'counts' });
  assert.equal(result.totalCount, 3);
  assert.equal(result.verifiedCount, 2);
  assert.equal(result.nutrients.carbsG.numericCount, 1);
  assert.equal(result.nutrients.carbsG.nullCount, 1);
});
