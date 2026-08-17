import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIntakeAnthropometricsView,
  cmToImperial,
  convertHeightUnit,
  imperialToCm,
  lbToKg,
  normalizeIntakeAnthropometrics,
  sanitizeIntakeAnthropometrics,
  validateIntakeAnthropometrics,
} from '../../src/coach/intake/intake-anthropometrics.mjs';

const IMPERIAL_SAMPLE = Object.freeze({
  age_years: '34',
  height_unit: 'imperial',
  height_feet: '5',
  height_inches: '10',
  weight_lb: '185',
});

test('imperial 5 ft 10 in converts to about 177.8 cm', () => {
  assert.equal(Number(imperialToCm(5, 10).toFixed(1)), 177.8);
});

test('178 cm converts to a coherent 5 ft 10 in', () => {
  assert.deepEqual(cmToImperial(178), { feet: 5, inches: 10 });
});

test('weight conversion uses the canonical pound factor', () => {
  assert.equal(Number(lbToKg(185).toFixed(1)), 83.9);
});

test('11 inches is valid and 12 inches is invalid', () => {
  assert.equal(validateIntakeAnthropometrics({
    ...IMPERIAL_SAMPLE,
    height_inches: '11',
  }).ok, true);
  assert.equal(validateIntakeAnthropometrics({
    ...IMPERIAL_SAMPLE,
    height_inches: '12',
  }).ok, false);
  assert.equal(validateIntakeAnthropometrics({
    ...IMPERIAL_SAMPLE,
    height_inches: '12',
  }).errors.height_inches, 'out_of_range');
});

test('non-numeric age and negative weight are invalid', () => {
  assert.equal(validateIntakeAnthropometrics({
    ...IMPERIAL_SAMPLE,
    age_years: 'trente-quatre',
  }).errors.age_years, 'not_integer');
  assert.equal(validateIntakeAnthropometrics({
    ...IMPERIAL_SAMPLE,
    weight_lb: '-10',
  }).errors.weight_lb, 'out_of_range');
});

test('imperial sample validates, sanitizes, and normalizes for draft/submit', () => {
  assert.equal(validateIntakeAnthropometrics(IMPERIAL_SAMPLE).ok, true);
  const saved = sanitizeIntakeAnthropometrics({
    ...IMPERIAL_SAMPLE,
    height_cm: '190',
    objective_primary: 'Perte de masse adipeuse',
  });
  assert.equal(saved.height_cm, undefined);
  assert.equal(saved.height_feet, '5');
  const restored = normalizeIntakeAnthropometrics(saved);
  assert.equal(restored.ageYears, 34);
  assert.equal(restored.heightFeet, 5);
  assert.equal(restored.heightInches, 10);
  assert.equal(restored.weightLb, 185);
  assert.equal(restored.heightOriginalUnit, 'imperial');
});

test('metric 178 cm validates and submits without a second height system', () => {
  const metric = {
    age_years: '34',
    height_unit: 'metric',
    height_cm: '178',
    height_feet: '6',
    height_inches: '2',
    weight_lb: '185',
  };
  assert.equal(validateIntakeAnthropometrics(metric).ok, true);
  const saved = sanitizeIntakeAnthropometrics(metric);
  assert.equal(saved.height_feet, undefined);
  assert.equal(saved.height_inches, undefined);
  assert.equal(saved.height_cm, '178');
  const view = buildIntakeAnthropometricsView(saved);
  assert.equal(view.heightPrimary, '178 cm');
  assert.equal(view.heightSecondary, '5 pi 10 po');
});

test('unit switch imperial -> metric -> imperial does not silently drop values', () => {
  const toMetric = convertHeightUnit('imperial', {
    height_feet: '5',
    height_inches: '10',
  });
  assert.equal(toMetric.height_cm, '178');
  const back = convertHeightUnit('metric', { height_cm: toMetric.height_cm });
  assert.equal(back.height_feet, '5');
  assert.equal(back.height_inches, '10');
});

test('legacy answers without anthropometrics stay empty — no fake zeros', () => {
  assert.equal(normalizeIntakeAnthropometrics({
    email: 'legacy@example.com',
    objective_primary: 'Perte de masse adipeuse',
  }), null);
  assert.equal(buildIntakeAnthropometricsView({}), null);
  assert.equal(normalizeIntakeAnthropometrics({
    age_years: '0',
    weight_lb: '0',
    height_cm: '0',
  }), null);
});
