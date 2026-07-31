import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  MOYENNES,
  CATS,
  MACRO_PRESETS,
  FEATURE_DA_ENABLED,
  FORBIDDEN_PDF_MARKERS,
  PROFILE_STORAGE_KEY_PREFIX,
  MEAL_COUNT,
  lbsToKg,
  weightToKg,
  heightToMeters,
  computeEerTdee,
  computeProteinGrams,
  computeMacroTargets,
  computeBanqueTotals,
  computeHydration,
  migrateProfilData,
  createEmptyJourData,
  assertNoForbiddenPdfContent,
  evaluatePlanCompleteness,
  distribuerPortions,
  scorePortions,
  suggestBanque,
  adjustComplementaryCustomMacro,
  kcalFromMacros,
  profileStorageKey,
  PDF_VARIANCE_THRESHOLDS,
  isJourClientPlanConfigured,
  computePlannedTotalsFromRepartition,
  reconcilePlanTotals,
} from '../src/lib/coach-calculator-engine.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const categoryMapping = JSON.parse(
  readFileSync(join(__dirname, '../src/data/category-mapping.json'), 'utf8'),
);

const maleProfile = {
  sexe: 'H',
  age: 30,
  poidsKg: weightToKg(185, 'lbs'),
  hauteurM: heightToMeters({ unit: 'cm', cm: 180 }),
  activite: 'modere',
};

const femaleProfile = {
  sexe: 'F',
  age: 30,
  poidsKg: weightToKg(185, 'lbs'),
  hauteurM: heightToMeters({ unit: 'cm', cm: 180 }),
  activite: 'modere',
};

test('MOYENNES match calculatorLegacyMoyennes in category-mapping', () => {
  const legacy = categoryMapping.calculatorLegacyMoyennes.MOYENNES;
  assert.deepEqual(MOYENNES, legacy);
});

test('male EER/TDEE uses IOM formula with male PA factors', () => {
  const { bmr, tdee } = computeEerTdee(maleProfile);
  assert.equal(Math.round(bmr), 2682);
  assert.equal(Math.round(tdee), 3259);
});

test('female EER/TDEE uses IOM formula with female PA factors', () => {
  const { bmr, tdee } = computeEerTdee(femaleProfile);
  assert.equal(Math.round(bmr), 2239);
  assert.equal(Math.round(tdee), 2804);
});

test('weight and height unit conversions', () => {
  assert.equal(Math.round(lbsToKg(185) * 10) / 10, 83.9);
  assert.equal(weightToKg(80, 'kg'), 80);
  assert.equal(heightToMeters({ unit: 'cm', cm: 180 }), 1.8);
  assert.equal(Math.round(heightToMeters({ unit: 'ft', ft: 5, in: 11 }) * 1000) / 1000, 1.803);
});

test('five goal multipliers scale TDEE targets', () => {
  const { tdee } = computeEerTdee(maleProfile);
  const multipliers = [0.8, 0.9, 1, 1.1, 1.2];
  const goalKcals = multipliers.map((m) => Math.round(tdee * m));
  const actual = multipliers.map((goalMultiplier) =>
    computeMacroTargets({
      tdee,
      goalMultiplier,
      weightKg: maleProfile.poidsKg,
      macroRatio: '25,45,30',
    }).kcal,
  );
  for (let i = 1; i < actual.length; i++) {
    assert.ok(actual[i] >= actual[i - 1] - 2);
  }
  assert.deepEqual(goalKcals, [2607, 2933, 3259, 3585, 3911]);
});

test('eight macro presets are defined with correct ratios', () => {
  assert.equal(MACRO_PRESETS.length, 8);
  const ratios = MACRO_PRESETS.map((p) => p.ratio);
  assert.deepEqual(ratios, [
    '30,40,30',
    '40,35,25',
    '25,45,30',
    '33,33,33',
    '25,50,25',
    '20,55,25',
    '15,60,25',
    '45,35,20',
  ]);
});

test('eight presets produce distinct carb and fat gram targets', () => {
  const { tdee } = computeEerTdee(maleProfile);
  const splits = MACRO_PRESETS.map((preset) => {
    const t = computeMacroTargets({
      tdee,
      goalMultiplier: 1,
      weightKg: maleProfile.poidsKg,
      macroRatio: preset.ratio,
    });
    return `${t.glu}/${t.lip}`;
  });
  assert.equal(new Set(splits).size, 8);
});

test('custom macros adjust complement to sum 100 with protein share', () => {
  const proPct = 25;
  const fromG = adjustComplementaryCustomMacro('G', 45, proPct);
  assert.equal(fromG.customG + fromG.customL + proPct, 100);
  const fromL = adjustComplementaryCustomMacro('L', 30, proPct);
  assert.equal(fromL.customG + fromL.customL + proPct, 100);
});

test('protein gkg mode rounds kg * gPerKg with minimum 2 g/kg', () => {
  assert.equal(
    computeProteinGrams({ mode: 'gkg', weightKg: 80, gPerKg: 2, goalKcal: 2500 }),
    160,
  );
  assert.equal(
    computeProteinGrams({ mode: 'gkg', weightKg: 80, gPerKg: 1.5, goalKcal: 2500 }),
    160,
  );
});

test('protein pct mode rounds kcal * pct / 100 / 4', () => {
  assert.equal(
    computeProteinGrams({ mode: 'pct', weightKg: 80, pct: 25, goalKcal: 2500 }),
    156,
  );
});

test('rest day carb cycling reduces glucides and increases lipids', () => {
  const { tdee } = computeEerTdee(maleProfile);
  const base = computeMacroTargets({
    tdee,
    goalMultiplier: 1,
    weightKg: maleProfile.poidsKg,
    macroRatio: '25,45,30',
    isRestDay: false,
  });
  const rest = computeMacroTargets({
    tdee,
    goalMultiplier: 1,
    weightKg: maleProfile.poidsKg,
    macroRatio: '25,45,30',
    isRestDay: true,
  });
  assert.ok(rest.glu < base.glu);
  assert.ok(rest.lip > base.lip);
  assert.equal(rest.pro, base.pro);
});

test('banque totals from portions * MOYENNES', () => {
  const banque = { pro: '2', fec: '3', leg: '2', fru: '1', lai: '1', lip: '1', whey: '0.5' };
  const totals = computeBanqueTotals(banque);
  let pro = 0;
  let glu = 0;
  let lip = 0;
  for (const cat of CATS) {
    const val = parseFloat(banque[cat]) || 0;
    pro += val * MOYENNES[cat].p;
    glu += val * MOYENNES[cat].g;
    lip += val * MOYENNES[cat].l;
  }
  assert.equal(totals.pro, Math.round(pro));
  assert.equal(totals.glu, Math.round(glu));
  assert.equal(totals.lip, Math.round(lip));
  assert.equal(totals.kcal, kcalFromMacros(totals.pro, totals.glu, totals.lip));
});

test('hydration is 1 L per 1000 kcal plus manual add', () => {
  assert.deepEqual(computeHydration(3258, 0), { auto: 3.3, ajout: 0, total: 3.3 });
  assert.deepEqual(computeHydration(3258, 0.5), { auto: 3.3, ajout: 0.5, total: 3.8 });
  assert.deepEqual(computeHydration(0, 1), { auto: 0, ajout: 1, total: 1 });
});

test('migrate legacy single-day profile to version 2 with jours', () => {
  const legacy = {
    nom: 'Xavier',
    sexe: 'H',
    banque: { pro: '3', fec: '4', leg: '2', fru: '1', lai: '1', lip: '1', whey: '0' },
    repartition: { 0: '1' },
    heureEntrainement: '18:00',
    typeJour: 'entrainement',
  };
  const migrated = migrateProfilData(legacy);
  assert.equal(migrated.version, 2);
  assert.ok(migrated.jours.entrainement);
  assert.ok(migrated.jours.repos);
  assert.equal(migrated.jours.entrainement.banque.pro, '3');
  assert.equal(migrated.jours.entrainement.heureEntrainement, '18:00');
  assert.equal(migrated.activeJour, 'entrainement');
  assert.equal(migrated.jours.repos.banque.pro, '0');
});

test('migrate preserves existing dual-day profile', () => {
  const dual = {
    version: 2,
    jours: {
      entrainement: { ...createEmptyJourData(), banque: { ...createEmptyJourData().banque, pro: '5' } },
      repos: createEmptyJourData(),
    },
  };
  const migrated = migrateProfilData(dual);
  assert.equal(migrated.jours.entrainement.banque.pro, '5');
  assert.equal(migrated.version, 2);
});

test('FEATURE_DA_ENABLED is false', () => {
  assert.equal(FEATURE_DA_ENABLED, false);
});

test('forbidden PDF markers throw on client-facing text', () => {
  assert.doesNotThrow(() => assertNoForbiddenPdfContent('Plan alimentaire KR Kinetics'));
  for (const marker of FORBIDDEN_PDF_MARKERS) {
    assert.throws(
      () => assertNoForbiddenPdfContent(`Section interne ${marker} visible`),
      /Forbidden PDF marker/,
    );
  }
});

test('profile storage key uses athlete_ prefix', () => {
  assert.equal(PROFILE_STORAGE_KEY_PREFIX, 'athlete_');
  assert.equal(profileStorageKey('Xavier'), 'athlete_Xavier');
});

test('distribuerPortions uses half-portion remainder algorithm', () => {
  const weights = [0.3, 0.05, 0.25, 0.1, 0.25, 0.05];
  const portions = distribuerPortions(5, weights);
  assert.equal(portions.length, MEAL_COUNT);
  assert.equal(portions.reduce((a, b) => a + b, 0), 5);
  assert.ok(portions.every((p) => p % 0.5 === 0));
});

test('suggestBanque returns scored portions near targets', () => {
  const targets = { kcal: 2800, pro: 170, glu: 300, lip: 80 };
  const suggested = suggestBanque(targets);
  assert.ok(suggested);
  for (const cat of CATS) assert.ok(typeof suggested[cat] === 'number');
  const score = scorePortions(suggested, targets);
  assert.ok(Number.isFinite(score));
});

test('empty rest day is not client-PDF configured', () => {
  assert.equal(isJourClientPlanConfigured(createEmptyJourData()), false);
  const banqueOnly = createEmptyJourData();
  banqueOnly.banque.pro = '4';
  assert.equal(isJourClientPlanConfigured(banqueOnly), false);
  const byMeals = createEmptyJourData();
  byMeals.repartition['0'] = '2';
  assert.equal(isJourClientPlanConfigured(byMeals), true);
});

test('reconcilePlanTotals exposes target/planned/variance with explicit thresholds', () => {
  assert.deepEqual(PDF_VARIANCE_THRESHOLDS, { kcal: 50, pro: 5, glu: 5, lip: 5 });
  const banque = { pro: '10', fec: '16.5', leg: '2', fru: '2.5', lai: '1.5', lip: '11.5', whey: '0' };
  const banqueTotals = computeBanqueTotals(banque);
  const repartition = {};
  for (let i = 0; i < MEAL_COUNT * CATS.length; i += 1) repartition[i] = '0';
  // Place banque portions into meals unevenly to exercise per-meal rounding
  repartition['0'] = '3';
  repartition['14'] = '4';
  repartition['28'] = '3'; // pro 10
  repartition['1'] = '5';
  repartition['15'] = '6';
  repartition['29'] = '5.5'; // fec 16.5
  repartition['2'] = '1';
  repartition['16'] = '1'; // leg 2
  repartition['3'] = '1';
  repartition['17'] = '1.5'; // fru 2.5
  repartition['4'] = '0.5';
  repartition['18'] = '1'; // lai 1.5
  repartition['5'] = '4';
  repartition['19'] = '4';
  repartition['33'] = '3.5'; // lip 11.5
  const planned = computePlannedTotalsFromRepartition(repartition);
  const targets = { kcal: 3238, pro: 168, glu: 385, lip: 114 };
  const recon = reconcilePlanTotals({ targets, banqueTotals, plannedTotals: planned });
  assert.equal(recon.target.kcal, 3238);
  assert.equal(recon.planned.kcal, planned.kcal);
  assert.equal(recon.varianceVsTarget.kcal, planned.kcal - targets.kcal);
  assert.equal(typeof recon.origin, 'string');
  assert.ok(recon.origin.includes('arrondi'));
  assert.equal(recon.thresholds.kcal, 50);
  // Planned may differ from banque solely due to per-meal macro rounding
  assert.equal(
    recon.plannedVsBanque.kcal,
    planned.kcal - banqueTotals.kcal,
  );
});

test('evaluatePlanCompleteness mirrors evaluerJourData rules', () => {
  const empty = createEmptyJourData();
  const incomplete = evaluatePlanCompleteness({
    jourData: empty,
    targets: { kcal: 2500, pro: 160, glu: 280, lip: 70 },
  });
  assert.equal(incomplete.canExport, false);
  assert.ok(incomplete.errors.includes('Banque vide.'));

  const jourData = createEmptyJourData();
  jourData.banque = { pro: '2', fec: '3', leg: '2', fru: '1', lai: '1', lip: '1', whey: '0' };
  jourData.repartition['0'] = '2';
  jourData.repartition['7'] = '3';
  const complete = evaluatePlanCompleteness({
    jourData,
    targets: computeBanqueTotals(jourData.banque),
  });
  assert.equal(complete.canExport, false);
  assert.ok(complete.errors.some((e) => e.startsWith('Répartition incomplète')));
});
