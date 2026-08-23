/**
 * Characterization tests for Coach plan completeness / totals reconciliation.
 * Expected values are locked from the pre-Lot-2 engine behavior.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATS,
  MEAL_COUNT,
  MOYENNES,
  PDF_VARIANCE_THRESHOLDS,
  createEmptyJourData,
  computeBanqueTotals,
  computePlannedTotalsFromRepartition,
  evaluatePlanCompleteness,
  isJourClientPlanConfigured,
  reconcilePlanTotals,
  kcalFromMacros,
} from '../src/lib/coach-calculator-engine.mjs';
import {
  PDF_VARIANCE_THRESHOLDS as DOMAIN_THRESHOLDS,
  evaluatePlanCompleteness as domainEvaluatePlanCompleteness,
  reconcilePlanTotals as domainReconcilePlanTotals,
  computePlannedTotalsFromRepartition as domainComputePlannedTotalsFromRepartition,
  isJourClientPlanConfigured as domainIsJourClientPlanConfigured,
  computeBanqueTotals as domainComputeBanqueTotals,
  MOYENNES as DOMAIN_MOYENNES,
} from '../src/coach/domain/plans.mjs';
import { kcalFromMacros as domainKcalFromMacros } from '../src/coach/calculations/macros.mjs';

function fillBanqueIntoMealZero(jourData) {
  for (const cat of CATS) {
    const idx = 0 * CATS.length + CATS.indexOf(cat);
    jourData.repartition[String(idx)] = String(jourData.banque[cat] ?? '0');
  }
}

test('plan completeness: empty plan', () => {
  const empty = createEmptyJourData();
  const result = evaluatePlanCompleteness({
    jourData: empty,
    targets: { kcal: 2500, pro: 160, glu: 280, lip: 70 },
  });
  assert.deepEqual(result, {
    errors: ['Banque vide.'],
    warnings: [],
    canExport: false,
  });
});

test('plan completeness: missing targets', () => {
  const empty = createEmptyJourData();
  const result = evaluatePlanCompleteness({
    jourData: empty,
    targets: { kcal: 0, pro: 0, glu: 0, lip: 0 },
    targetsReady: false,
  });
  assert.deepEqual(result.errors, ['Profil incomplet (cibles).', 'Banque vide.']);
  assert.equal(result.canExport, false);
});

test('plan completeness: partial distribution', () => {
  const partial = createEmptyJourData();
  partial.banque = { pro: '2', fec: '3', leg: '2', fru: '1', lai: '1', lip: '1', whey: '0' };
  partial.repartition['0'] = '2';
  partial.repartition['7'] = '3';
  const result = evaluatePlanCompleteness({
    jourData: partial,
    targets: computeBanqueTotals(partial.banque),
  });
  assert.equal(result.canExport, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, [
    'Répartition partielle (pro, fec, leg, fru, lai, lip) — le PDF utilisera uniquement les portions inscrites.',
  ]);
});

test('plan completeness: under- and over-distributed portions are both non-blocking', () => {
  const day = createEmptyJourData();
  day.banque = { pro: '15.5', fec: '12.5', leg: '2', fru: '3', lai: '1', lip: '6.5', whey: '0' };
  const meals = [
    [0, 1, 0, 1, 2, 2, 0],
    [0, 1, 0, 1, 0, 0, 2],
    [7, 3, 1, 0, 0, 1, 0],
    [0, 1, 0, 1, 0, 0, 0],
    [7, 3, 1, 0, 0, 1, 0],
    [0, 2, 0, 0, 0, 1, 2],
    [0, 0, 0, 0, 0, 0, 0],
  ];
  day.repartition = meals.flat().map(String);

  const result = evaluatePlanCompleteness({
    jourData: day,
    targets: computeBanqueTotals(day.banque),
  });

  assert.equal(result.canExport, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, [
    'Répartition partielle (pro, fec, lai, lip) — le PDF utilisera uniquement les portions inscrites.',
  ]);
});

test('plan completeness: complete plan can export', () => {
  const complete = createEmptyJourData();
  complete.banque = { pro: '2', fec: '3', leg: '2', fru: '1', lai: '1', lip: '1', whey: '0' };
  fillBanqueIntoMealZero(complete);
  const result = evaluatePlanCompleteness({
    jourData: complete,
    targets: computeBanqueTotals(complete.banque),
  });
  assert.deepEqual(result, { errors: [], warnings: [], canExport: true });
});

test('plan completeness: banque without meals', () => {
  const banqueOnly = createEmptyJourData();
  banqueOnly.banque.pro = '4';
  assert.equal(isJourClientPlanConfigured(banqueOnly), false);
  const result = evaluatePlanCompleteness({
    jourData: banqueOnly,
    targets: { kcal: 200, pro: 36, glu: 0, lip: 8 },
  });
  assert.equal(result.canExport, false);
  assert.ok(result.warnings.includes(
    'Répartition partielle (pro) — le PDF utilisera uniquement les portions inscrites.',
  ));
  assert.ok(result.errors.includes('Repas non distribués.'));
});

test('plan completeness: nullish/absent banque values coerce like parseFloat', () => {
  const nullish = createEmptyJourData();
  nullish.banque = { pro: null, fec: undefined, leg: '', fru: '0', lai: '1', lip: '0', whey: '0' };
  nullish.repartition['4'] = '1';
  assert.deepEqual(computeBanqueTotals(nullish.banque), { pro: 7, glu: 10, lip: 2, kcal: 86 });
  const result = evaluatePlanCompleteness({
    jourData: nullish,
    targets: { kcal: 120, pro: 7, glu: 10, lip: 2 },
  });
  assert.deepEqual(result, { errors: [], warnings: [], canExport: true });
});

test('plan completeness: banque/target variance warning thresholds', () => {
  const j = createEmptyJourData();
  j.banque = { pro: '20', fec: '20', leg: '2', fru: '2', lai: '1', lip: '10', whey: '0' };
  fillBanqueIntoMealZero(j);
  const result = evaluatePlanCompleteness({
    jourData: j,
    targets: { kcal: 1000, pro: 50, glu: 50, lip: 20 },
  });
  assert.deepEqual(result.warnings, ['Écart banque/cibles.']);
  assert.equal(result.canExport, true);
  assert.deepEqual(result.errors, []);
});

test('reconcilePlanTotals: known banque/planned rounding case', () => {
  assert.deepEqual(PDF_VARIANCE_THRESHOLDS, { kcal: 50, pro: 5, glu: 5, lip: 5 });
  const banque = { pro: '10', fec: '16.5', leg: '2', fru: '2.5', lai: '1.5', lip: '11.5', whey: '0' };
  const banqueTotals = computeBanqueTotals(banque);
  assert.deepEqual(banqueTotals, { pro: 168, glu: 387, lip: 114, kcal: 3246 });

  const repartition = {};
  for (let i = 0; i < MEAL_COUNT * CATS.length; i += 1) repartition[i] = '0';
  repartition['0'] = '3';
  repartition['14'] = '4';
  repartition['28'] = '3';
  repartition['1'] = '5';
  repartition['15'] = '6';
  repartition['29'] = '5.5';
  repartition['2'] = '1';
  repartition['16'] = '1';
  repartition['3'] = '1';
  repartition['17'] = '1.5';
  repartition['4'] = '0.5';
  repartition['18'] = '1';
  repartition['5'] = '4';
  repartition['19'] = '4';
  repartition['33'] = '3.5';

  const planned = computePlannedTotalsFromRepartition(repartition);
  assert.deepEqual(planned, { pro: 169, glu: 387, lip: 114, kcal: 3250 });

  const targets = { kcal: 3238, pro: 168, glu: 385, lip: 114 };
  const recon = reconcilePlanTotals({ targets, banqueTotals, plannedTotals: planned });
  assert.deepEqual(recon.varianceVsTarget, { kcal: 12, pro: 1, glu: 2, lip: 0 });
  assert.deepEqual(recon.banqueVsTarget, { kcal: 8, pro: 0, glu: 2, lip: 0 });
  assert.deepEqual(recon.plannedVsBanque, { kcal: 4, pro: 1, glu: 0, lip: 0 });
  assert.equal(recon.withinThreshold, true);
  assert.match(recon.origin, /arrondi/);
});

test('reconcilePlanTotals: positive and negative variances', () => {
  const over = reconcilePlanTotals({
    targets: { kcal: 100, pro: 10, glu: 10, lip: 4 },
    banqueTotals: { kcal: 200, pro: 20, glu: 20, lip: 8 },
    plannedTotals: { kcal: 250, pro: 25, glu: 25, lip: 10 },
  });
  assert.equal(over.withinThreshold, false);
  assert.deepEqual(over.varianceVsTarget, { kcal: 150, pro: 15, glu: 15, lip: 6 });

  const under = reconcilePlanTotals({
    targets: { kcal: 200, pro: 20, glu: 20, lip: 8 },
    banqueTotals: { kcal: 100, pro: 10, glu: 10, lip: 4 },
    plannedTotals: { kcal: 90, pro: 9, glu: 9, lip: 4 },
  });
  assert.equal(under.withinThreshold, false);
  assert.deepEqual(under.varianceVsTarget, { kcal: -110, pro: -11, glu: -11, lip: -4 });
});

test('domain plans/macros modules are re-exported by the engine', () => {
  assert.equal(domainEvaluatePlanCompleteness, evaluatePlanCompleteness);
  assert.equal(domainReconcilePlanTotals, reconcilePlanTotals);
  assert.equal(domainComputePlannedTotalsFromRepartition, computePlannedTotalsFromRepartition);
  assert.equal(domainIsJourClientPlanConfigured, isJourClientPlanConfigured);
  assert.equal(domainComputeBanqueTotals, computeBanqueTotals);
  assert.equal(DOMAIN_THRESHOLDS, PDF_VARIANCE_THRESHOLDS);
  assert.equal(DOMAIN_MOYENNES, MOYENNES);
  assert.equal(domainKcalFromMacros, kcalFromMacros);
});

test('reconcilePlanTotals does not mutate input objects', () => {
  const targets = { kcal: 100, pro: 10, glu: 10, lip: 10 };
  const banqueTotals = { kcal: 90, pro: 9, glu: 9, lip: 9 };
  const plannedTotals = { kcal: 95, pro: 9, glu: 10, lip: 9 };
  const before = {
    targets: JSON.stringify(targets),
    banqueTotals: JSON.stringify(banqueTotals),
    plannedTotals: JSON.stringify(plannedTotals),
  };
  reconcilePlanTotals({ targets, banqueTotals, plannedTotals });
  assert.equal(JSON.stringify(targets), before.targets);
  assert.equal(JSON.stringify(banqueTotals), before.banqueTotals);
  assert.equal(JSON.stringify(plannedTotals), before.plannedTotals);
});
