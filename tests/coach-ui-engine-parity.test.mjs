/**
 * Lot 5 Option A — parity between legacy UI implementations and shared engine.
 * Proves identical results before removing local UI copies.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATS,
  MEAL_COUNT,
  MOYENNES,
  createEmptyJourData,
  kcalFromMacros as engineKcalFromMacros,
  macroPercentagesFromGrams as engineMacroPercentagesFromGrams,
  getPortionTotals as engineGetPortionTotals,
  computePlannedTotalsFromRepartition as engineComputePlannedTotalsFromRepartition,
  isJourClientPlanConfigured as engineIsJourClientPlanConfigured,
} from '../src/lib/coach-calculator-engine.mjs';

/** Legacy UI copy — coach-calculator/index.html kcalFromMacros */
function uiKcalFromMacros(pro, glu, lip) {
  return Math.round(pro * 4 + glu * 4 + lip * 9);
}

/** Legacy UI copy — coach-calculator/index.html macroPercentagesFromGrams */
function uiMacroPercentagesFromGrams(pro, glu, lip) {
  const total = uiKcalFromMacros(pro || 0, glu || 0, lip || 0);
  if (!total) return { pro: 0, glu: 0, lip: 0 };
  const proPct = Math.round(((pro || 0) * 4 / total) * 100);
  const gluPct = Math.round(((glu || 0) * 4 / total) * 100);
  return { pro: proPct, glu: gluPct, lip: Math.max(0, 100 - proPct - gluPct) };
}

/** Legacy UI copy — coach-calculator/index.html getPortionTotals */
function uiGetPortionTotals(portions) {
  let pro = 0;
  let glu = 0;
  let lip = 0;
  CATS.forEach((cat) => {
    const v = portions[cat] || 0;
    pro += v * MOYENNES[cat].p;
    glu += v * MOYENNES[cat].g;
    lip += v * MOYENNES[cat].l;
  });
  return { pro, glu, lip, kcal: uiKcalFromMacros(pro, glu, lip) };
}

/** Legacy UI copy — getJourSnapshot planned-total aggregation */
function uiGetRepValueFromData(repartition, mealIdx, cat) {
  const idx = mealIdx * CATS.length + CATS.indexOf(cat);
  return parseFloat(repartition[idx]) || 0;
}

function uiComputePlannedTotalsFromRepartition(repartition) {
  let totalPro = 0;
  let totalGlu = 0;
  let totalLip = 0;
  for (let i = 0; i < MEAL_COUNT; i++) {
    let rPro = 0;
    let rGlu = 0;
    let rLip = 0;
    CATS.forEach((cat) => {
      const val = uiGetRepValueFromData(repartition, i, cat);
      rPro += val * MOYENNES[cat].p;
      rGlu += val * MOYENNES[cat].g;
      rLip += val * MOYENNES[cat].l;
    });
    const rKcal = uiKcalFromMacros(rPro, rGlu, rLip);
    rPro = Math.round(rPro);
    rGlu = Math.round(rGlu);
    rLip = Math.round(rLip);
    if (rKcal > 0) {
      totalPro += rPro;
      totalGlu += rGlu;
      totalLip += rLip;
    }
  }
  return {
    pro: totalPro,
    glu: totalGlu,
    lip: totalLip,
    kcal: uiKcalFromMacros(totalPro, totalGlu, totalLip),
  };
}

/** Legacy UI copy — client-fixes isJourClientPlanConfigured */
function uiIsJourClientPlanConfigured(jourData) {
  const data = jourData || createEmptyJourData();
  for (let i = 0; i < MEAL_COUNT * CATS.length; i++) {
    if ((parseFloat(data.repartition && data.repartition[i]) || 0) > 0) return true;
  }
  return false;
}

function emptyRepartition() {
  const repartition = {};
  for (let i = 0; i < MEAL_COUNT * CATS.length; i++) repartition[i] = '0';
  return repartition;
}

function setMeal(repartition, mealIdx, portionsByCat) {
  for (const cat of CATS) {
    const idx = mealIdx * CATS.length + CATS.indexOf(cat);
    repartition[idx] = String(portionsByCat[cat] ?? 0);
  }
}

test('parity: kcalFromMacros identical across scenarios', () => {
  const cases = [
    [0, 0, 0],
    [166, 403, 91],
    [1, 1, 1],
    [10.4, 20.6, 3.2],
    [-1, 0, 0],
    [null, undefined, 0],
    ['12', '8', '3'],
  ];
  for (const [pro, glu, lip] of cases) {
    const ui = uiKcalFromMacros(pro, glu, lip);
    const engine = engineKcalFromMacros(pro, glu, lip);
    assert.equal(ui, engine, `kcal(${pro},${glu},${lip})`);
    assert.equal(typeof ui, typeof engine);
  }
});

test('parity: macroPercentagesFromGrams identical and sum to 100 when kcal > 0', () => {
  const cases = [
    [0, 0, 0],
    [166, 403, 91],
    [50, 50, 50],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [12.5, 40.25, 7.75],
    [null, 10, 5],
  ];
  for (const [pro, glu, lip] of cases) {
    const ui = uiMacroPercentagesFromGrams(pro, glu, lip);
    const engine = engineMacroPercentagesFromGrams(pro, glu, lip);
    assert.deepEqual(ui, engine, `pct(${pro},${glu},${lip})`);
    if (engineKcalFromMacros(pro || 0, glu || 0, lip || 0) > 0) {
      assert.equal(ui.pro + ui.glu + ui.lip, 100);
    }
  }
});

test('parity: getPortionTotals empty / single / multi category', () => {
  const empty = Object.fromEntries(CATS.map((c) => [c, 0]));
  assert.deepEqual(uiGetPortionTotals(empty), engineGetPortionTotals(empty));

  const single = { ...empty, pro: 2 };
  assert.deepEqual(uiGetPortionTotals(single), engineGetPortionTotals(single));

  const multi = { ...empty, pro: 2, fec: 3, leg: 1, fru: 2, lai: 1, lip: 2, whey: 0.5 };
  assert.deepEqual(uiGetPortionTotals(multi), engineGetPortionTotals(multi));

  const decimal = { ...empty, fec: 1.5, lip: 0.5 };
  assert.deepEqual(uiGetPortionTotals(decimal), engineGetPortionTotals(decimal));
});

test('parity: computePlannedTotalsFromRepartition (getJourSnapshot aggregation)', () => {
  const empty = emptyRepartition();
  assert.deepEqual(
    uiComputePlannedTotalsFromRepartition(empty),
    engineComputePlannedTotalsFromRepartition(empty),
  );

  const oneMeal = emptyRepartition();
  setMeal(oneMeal, 0, { pro: 2, fec: 1 });
  assert.deepEqual(
    uiComputePlannedTotalsFromRepartition(oneMeal),
    engineComputePlannedTotalsFromRepartition(oneMeal),
  );

  const multiMeal = emptyRepartition();
  setMeal(multiMeal, 0, { pro: 2, fec: 2, fru: 1 });
  setMeal(multiMeal, 2, { lai: 1, lip: 2 });
  setMeal(multiMeal, 5, { whey: 1, leg: 2 });
  assert.deepEqual(
    uiComputePlannedTotalsFromRepartition(multiMeal),
    engineComputePlannedTotalsFromRepartition(multiMeal),
  );

  const stringNums = emptyRepartition();
  setMeal(stringNums, 1, { pro: '1.5', fec: '2', lip: '0.5' });
  assert.deepEqual(
    uiComputePlannedTotalsFromRepartition(stringNums),
    engineComputePlannedTotalsFromRepartition(stringNums),
  );

  const nullish = emptyRepartition();
  nullish[0] = null;
  nullish[1] = undefined;
  nullish[2] = '';
  assert.deepEqual(
    uiComputePlannedTotalsFromRepartition(nullish),
    engineComputePlannedTotalsFromRepartition(nullish),
  );
});

test('parity: isJourClientPlanConfigured empty / banque-only / with meals', () => {
  assert.equal(uiIsJourClientPlanConfigured(undefined), engineIsJourClientPlanConfigured(undefined));
  assert.equal(uiIsJourClientPlanConfigured(null), engineIsJourClientPlanConfigured(null));

  const empty = createEmptyJourData();
  assert.equal(uiIsJourClientPlanConfigured(empty), false);
  assert.equal(engineIsJourClientPlanConfigured(empty), false);

  const banqueOnly = createEmptyJourData();
  banqueOnly.banque.pro = '5';
  assert.equal(uiIsJourClientPlanConfigured(banqueOnly), false);
  assert.equal(engineIsJourClientPlanConfigured(banqueOnly), false);

  const withMeal = createEmptyJourData();
  withMeal.repartition[0] = '2';
  assert.equal(uiIsJourClientPlanConfigured(withMeal), true);
  assert.equal(engineIsJourClientPlanConfigured(withMeal), true);

  const zeroStrings = createEmptyJourData();
  for (let i = 0; i < MEAL_COUNT * CATS.length; i++) zeroStrings.repartition[i] = '0';
  assert.equal(uiIsJourClientPlanConfigured(zeroStrings), false);
  assert.equal(engineIsJourClientPlanConfigured(zeroStrings), false);
});
