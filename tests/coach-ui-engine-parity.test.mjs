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
  createEmptyJourData as engineCreateEmptyJourData,
  createEmptyJourData,
  kcalFromMacros as engineKcalFromMacros,
  macroPercentagesFromGrams as engineMacroPercentagesFromGrams,
  getPortionTotals as engineGetPortionTotals,
  computePlannedTotalsFromRepartition as engineComputePlannedTotalsFromRepartition,
  isJourClientPlanConfigured as engineIsJourClientPlanConfigured,
  normalizeProteinesPct as engineNormalizeProteinesPct,
  normalizeMacroPct as engineNormalizeMacroPct,
  roundHalf as engineRoundHalf,
  distribuerPortions as engineDistribuerPortions,
  scorePortions as engineScorePortions,
  suggestBanque as engineSuggestBanque,
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

/** Legacy UI createEmptyJourData */
function uiCreateEmptyJourData() {
  const banque = {};
  const repartition = {};
  CATS.forEach((cat) => { banque[cat] = '0'; });
  for (let i = 0; i < MEAL_COUNT * CATS.length; i++) repartition[i] = '0';
  return {
    banque,
    repartition,
    heureEntrainement: '17:30',
    repartitionSelonEntrainement: true,
    eauLitres: '0',
    eauAjout: '0',
    eauManuel: false,
  };
}

function uiNormalizeProteinesPct(value) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return 25;
  return Math.min(50, Math.max(10, Math.round(n)));
}

function uiNormalizeMacroPct(value) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return 45;
  return Math.min(80, Math.max(5, Math.round(n)));
}

function uiRoundHalf(n) {
  return Math.max(0, Math.round(n * 2) / 2);
}

function uiDistribuerPortions(total, weights) {
  if (total <= 0) return new Array(MEAL_COUNT).fill(0);
  const raw = weights.map((w) => total * w);
  const portions = raw.map((v) => Math.floor(v * 2) / 2);
  let remain = Math.round((total - portions.reduce((a, b) => a + b, 0)) * 2) / 2;
  const order = raw.map((v, i) => ({ i, frac: v - portions[i] }))
    .sort((a, b) => b.frac - a.frac || b.i - a.i);
  let step = 0;
  while (remain >= 0.5 && step < 24) {
    portions[order[step % MEAL_COUNT].i] += 0.5;
    remain -= 0.5;
    step += 1;
  }
  return portions;
}

function uiScorePortions(portions, targets) {
  const t = uiGetPortionTotals(portions);
  const tol = { pro: 5, glu: 5, lip: 5, kcal: 50 };
  let score = Math.abs(t.pro - targets.pro) + Math.abs(t.glu - targets.glu) + Math.abs(t.lip - targets.lip);
  score += Math.abs(t.kcal - targets.kcal) * 0.1;
  if (Math.abs(t.pro - targets.pro) > tol.pro) score += 20;
  if (Math.abs(t.glu - targets.glu) > tol.glu) score += 20;
  if (Math.abs(t.lip - targets.lip) > tol.lip) score += 20;
  if (Math.abs(t.kcal - targets.kcal) > tol.kcal) score += 30;
  return score;
}

function uiSuggestBanque(targets) {
  if (!targets || targets.kcal === 0) return null;
  const tweaks = [-1, -0.5, 0, 0.5, 1];
  let best = null;
  let bestScore = Infinity;
  for (let leg = 1.5; leg <= 3; leg += 0.5) {
    for (let fru = 1; fru <= 3; fru += 0.5) {
      for (let lai = 0.5; lai <= 2; lai += 0.5) {
        const seed = { leg, fru, lai, whey: 0, pro: 0, fec: 0, lip: 0 };
        let used = uiGetPortionTotals(seed);
        seed.fec = uiRoundHalf((targets.glu - used.glu) / MOYENNES.fec.g);
        used = uiGetPortionTotals(seed);
        seed.pro = uiRoundHalf((targets.pro - used.pro) / MOYENNES.pro.p);
        used = uiGetPortionTotals(seed);
        seed.lip = uiRoundHalf((targets.lip - used.lip) / MOYENNES.lip.l);
        for (const dp of tweaks) {
          for (const df of tweaks) {
            for (const dl of tweaks) {
              for (const dw of [0, 0.5, 1]) {
                const trial = {
                  leg,
                  fru,
                  lai,
                  pro: Math.max(0, seed.pro + dp),
                  fec: Math.max(0, seed.fec + df),
                  lip: Math.max(0, seed.lip + dl),
                  whey: Math.max(0, seed.whey + dw),
                };
                const s = uiScorePortions(trial, targets);
                if (s < bestScore) {
                  bestScore = s;
                  best = trial;
                }
              }
            }
          }
        }
      }
    }
  }
  return best;
}

test('parity: createEmptyJourData structure and defaults', () => {
  assert.deepEqual(uiCreateEmptyJourData(), engineCreateEmptyJourData());
});

test('parity: normalizeProteinesPct and normalizeMacroPct', () => {
  for (const v of [null, undefined, '', 'abc', 9, 10, 25, 50, 51, 5.4, '30']) {
    assert.equal(uiNormalizeProteinesPct(v), engineNormalizeProteinesPct(v), `prot pct ${v}`);
  }
  for (const v of [null, undefined, '', 'x', 4, 5, 45, 80, 81, 12.6, '40']) {
    assert.equal(uiNormalizeMacroPct(v), engineNormalizeMacroPct(v), `macro pct ${v}`);
  }
});

test('parity: roundHalf and distribuerPortions', () => {
  for (const n of [-1, 0, 0.24, 0.25, 0.75, 1.1, 2.5]) {
    assert.equal(uiRoundHalf(n), engineRoundHalf(n), `roundHalf ${n}`);
  }
  const weights = [0.2, 0.2, 0.15, 0.15, 0.15, 0.15];
  assert.deepEqual(uiDistribuerPortions(0, weights), engineDistribuerPortions(0, weights));
  assert.deepEqual(uiDistribuerPortions(10, weights), engineDistribuerPortions(10, weights));
  assert.deepEqual(uiDistribuerPortions(7.5, weights), engineDistribuerPortions(7.5, weights));
});

test('parity: scorePortions and suggestBanque', () => {
  const targets = { pro: 160, glu: 300, lip: 80, kcal: 2560 };
  const empty = Object.fromEntries(CATS.map((c) => [c, 0]));
  assert.equal(
    uiScorePortions(empty, targets),
    engineScorePortions(empty, targets),
  );
  const trial = { ...empty, pro: 8, fec: 10, leg: 2, fru: 2, lai: 1, lip: 4, whey: 0 };
  assert.equal(
    uiScorePortions(trial, targets),
    engineScorePortions(trial, targets),
  );
  assert.equal(uiSuggestBanque({ kcal: 0 }), null);
  assert.equal(engineSuggestBanque({ kcal: 0 }), null);
  assert.deepEqual(uiSuggestBanque(targets), engineSuggestBanque(targets));
});
