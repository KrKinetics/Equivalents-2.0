/**
 * Voluntarily regenerate Phase 2B golden fixtures from the CURRENT engine.
 *
 * SAFETY:
 * - Refuses to run unless COACH_REGENERATE_GOLDEN=1
 * - Never invoked by npm test / CI ordinary paths
 * - Changing golden outputs requires explicit métier review
 *
 * Does not modify nutrition formulas — only captures current outputs.
 *
 * Usage:
 *   COACH_REGENERATE_GOLDEN=1 node scripts/regenerate-golden-fixtures.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOYENNES,
  MACRO_PRESETS,
  PDF_VARIANCE_THRESHOLDS,
  FORBIDDEN_PDF_MARKERS,
  weightToKg,
  heightToMeters,
  computeEerTdee,
  computeNasem2023Eer,
  computeIom2005Eer,
  computeMacroTargets,
  computeProteinGrams,
  computeBanqueTotals,
  computeHydration,
  suggestBanque,
  scorePortions,
  distribuerPortions,
  computePlannedTotalsFromRepartition,
  reconcilePlanTotals,
  CATS,
  MEAL_COUNT,
  kcalFromMacros,
  assertNoForbiddenPdfContent,
} from '../src/lib/coach-calculator-engine.mjs';
import { BRANDS } from '../src/coach/branding/brands.mjs';
import { ORG_SLUG_TO_BRAND_ID } from '../src/coach/workspace/org-brand.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'tests', 'fixtures', 'golden');
const CONTRACT_VERSION = '2B.1';

function assertRegenerateAllowed() {
  if (process.env.COACH_REGENERATE_GOLDEN !== '1') {
    console.error(
      'Refusing golden regeneration. Set COACH_REGENERATE_GOLDEN=1 intentionally.\n'
      + 'Golden fixtures are immutable by default; updates require explicit métier review.',
    );
    process.exit(2);
  }
  if (process.env.CI === 'true' || process.env.VERCEL === '1') {
    console.error('Refusing golden regeneration in CI/Vercel environments.');
    process.exit(2);
  }
}

function writeJson(name, value) {
  const abs = path.join(outDir, name);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return abs;
}

function roundTdee(result) {
  return {
    bmr: Math.round(result.bmr),
    tdee: Math.round(result.tdee),
    method: result.method,
  };
}

function buildEerCases() {
  const cases = [
    {
      id: 'nasem-male-30-modere-kr',
      brand: 'kr',
      locale: 'fr',
      engine: 'computeEerTdee',
      input: {
        sexe: 'H', age: 30, poidsKg: weightToKg(185, 'lbs'), hauteurM: 1.8,
        activite: 'modere', method: 'nasem2023',
      },
    },
    {
      id: 'nasem-female-37-modere-elevate',
      brand: 'elevate',
      locale: 'en',
      engine: 'computeEerTdee',
      input: {
        sexe: 'F', age: 37, poidsKg: 63.5029, hauteurM: 1.6,
        activite: 'modere', method: 'nasem2023',
      },
    },
    {
      id: 'nasem-male-40-modere',
      brand: 'kr',
      locale: 'fr',
      engine: 'computeEerTdee',
      input: {
        sexe: 'H', age: 40, poidsKg: 68.0389, hauteurM: 1.7272,
        activite: 'modere', method: 'nasem2023',
      },
    },
    {
      id: 'nasem-female-75-sedentaire',
      brand: 'elevate',
      locale: 'fr',
      engine: 'computeEerTdee',
      input: {
        sexe: 'F', age: 75, poidsKg: 60, hauteurM: 1.6,
        activite: 'sedentaire', method: 'nasem2023',
      },
    },
    {
      id: 'nasem-youth-male-17-forces-nasem',
      brand: 'kr',
      locale: 'fr',
      engine: 'computeEerTdee',
      input: {
        sexe: 'H', age: 17, poidsKg: 70, hauteurM: 1.75,
        activite: 'modere', method: 'iom2005',
      },
      notes: 'Youth always forces NASEM even when IOM requested',
    },
    {
      id: 'iom-male-30-modere-compat',
      brand: 'kr',
      locale: 'fr',
      engine: 'computeEerTdee',
      input: {
        sexe: 'H', age: 30, poidsKg: weightToKg(185, 'lbs'), hauteurM: 1.8,
        activite: 'modere', method: 'iom2005',
      },
    },
    {
      id: 'iom-female-30-modere-compat',
      brand: 'elevate',
      locale: 'en',
      engine: 'computeEerTdee',
      input: {
        sexe: 'F', age: 30, poidsKg: weightToKg(185, 'lbs'), hauteurM: 1.8,
        activite: 'modere', method: 'iom2005',
      },
    },
    {
      id: 'nasem-male-actif',
      brand: 'kr',
      locale: 'fr',
      engine: 'computeEerTdee',
      input: {
        sexe: 'H', age: 28, poidsKg: 82, hauteurM: 1.78,
        activite: 'actif', method: 'nasem2023',
      },
    },
    {
      id: 'nasem-female-leger',
      brand: 'elevate',
      locale: 'en',
      engine: 'computeEerTdee',
      input: {
        sexe: 'F', age: 32, poidsKg: 58, hauteurM: 1.65,
        activite: 'leger', method: 'nasem2023',
      },
    },
  ];

  return cases.map((c) => {
    const raw = computeEerTdee(c.input);
    const expected = roundTdee(raw);
    return {
      ...c,
      units: { energy: 'kcal', weight: 'kg', height: 'm' },
      rounding: 'Math.round on bmr/tdee for contract comparison',
      contractVersion: CONTRACT_VERSION,
      expected,
    };
  });
}

function buildMacroCases() {
  const maleKg = weightToKg(185, 'lbs');
  const { tdee } = computeEerTdee({
    sexe: 'H', age: 30, poidsKg: maleKg, hauteurM: 1.8, activite: 'modere', method: 'iom2005',
  });
  const cases = [];

  for (const goalMultiplier of [0.8, 0.9, 1.0, 1.1, 1.2]) {
    const goalLabel = {
      0.8: 'perte-severe',
      0.9: 'perte-legere',
      1.0: 'maintien',
      1.1: 'prise-legere',
      1.2: 'prise-severe',
    }[goalMultiplier];
    const targets = computeMacroTargets({
      tdee,
      goalMultiplier,
      weightKg: maleKg,
      macroRatio: '25,45,30',
      proteinMode: 'gkg',
      gPerKg: 2,
    });
    cases.push({
      id: `iom-male-goal-${goalLabel}`,
      brand: 'kr',
      locale: 'fr',
      engine: 'computeMacroTargets',
      input: {
        tdee,
        goalMultiplier,
        weightKg: maleKg,
        macroRatio: '25,45,30',
        proteinMode: 'gkg',
        gPerKg: 2,
        isRestDay: false,
      },
      units: { energy: 'kcal', macros: 'g' },
      rounding: 'engine integer grams / derived kcal',
      contractVersion: CONTRACT_VERSION,
      expected: targets,
    });
  }

  for (const preset of MACRO_PRESETS) {
    const targets = computeMacroTargets({
      tdee,
      goalMultiplier: 1,
      weightKg: maleKg,
      macroRatio: preset.ratio,
      proteinMode: 'gkg',
      gPerKg: 2,
    });
    cases.push({
      id: `preset-${preset.id}-${preset.ratio}`,
      brand: 'kr',
      locale: 'fr',
      engine: 'computeMacroTargets',
      input: {
        tdee,
        goalMultiplier: 1,
        weightKg: maleKg,
        macroRatio: preset.ratio,
        proteinMode: 'gkg',
        gPerKg: 2,
        presetName: preset.name,
      },
      units: { energy: 'kcal', macros: 'g' },
      rounding: 'engine integer grams / derived kcal',
      contractVersion: CONTRACT_VERSION,
      expected: targets,
    });
  }

  const rest = computeMacroTargets({
    tdee,
    goalMultiplier: 1,
    weightKg: maleKg,
    macroRatio: '25,45,30',
    proteinMode: 'gkg',
    gPerKg: 2,
    isRestDay: true,
  });
  cases.push({
    id: 'rest-day-carb-cycle',
    brand: 'elevate',
    locale: 'en',
    engine: 'computeMacroTargets',
    input: {
      tdee,
      goalMultiplier: 1,
      weightKg: maleKg,
      macroRatio: '25,45,30',
      proteinMode: 'gkg',
      gPerKg: 2,
      isRestDay: true,
    },
    units: { energy: 'kcal', macros: 'g' },
    rounding: 'engine integer grams / derived kcal',
    contractVersion: CONTRACT_VERSION,
    expected: rest,
  });

  cases.push({
    id: 'protein-gkg-and-pct-samples',
    brand: 'kr',
    locale: 'fr',
    engine: 'computeProteinGrams',
    input: {},
    contractVersion: CONTRACT_VERSION,
    expected: {
      gkg_2: computeProteinGrams({ mode: 'gkg', weightKg: 80, gPerKg: 2, goalKcal: 2500 }),
      gkg_1_5: computeProteinGrams({ mode: 'gkg', weightKg: 80, gPerKg: 1.5, goalKcal: 2500 }),
      gkg_clamped_low: computeProteinGrams({ mode: 'gkg', weightKg: 80, gPerKg: 0.5, goalKcal: 2500 }),
      pct_25: computeProteinGrams({ mode: 'pct', weightKg: 80, pct: 25, goalKcal: 2500 }),
    },
  });

  cases.push({
    id: 'hydration-samples',
    brand: 'kr',
    locale: 'fr',
    engine: 'computeHydration',
    contractVersion: CONTRACT_VERSION,
    expected: {
      h3258: computeHydration(3258, 0),
      h3258_add: computeHydration(3258, 0.5),
      h0_add: computeHydration(0, 1),
    },
  });

  return cases;
}

function buildPortionsCases() {
  const banque = { pro: '10', fec: '16.5', leg: '2', fru: '2.5', lai: '1.5', lip: '11.5', whey: '0' };
  const banqueTotals = computeBanqueTotals(banque);
  const repartition = {};
  for (let i = 0; i < MEAL_COUNT * CATS.length; i += 1) repartition[i] = '0';
  Object.assign(repartition, {
    0: '3', 14: '4', 28: '3',
    1: '5', 15: '6', 29: '5.5',
    2: '1', 16: '1',
    3: '1', 17: '1.5',
    4: '0.5', 18: '1',
    5: '4', 19: '4', 33: '3.5',
  });
  const planned = computePlannedTotalsFromRepartition(repartition);
  const targets = { kcal: 3238, pro: 168, glu: 385, lip: 114 };
  const recon = reconcilePlanTotals({ targets, banqueTotals, plannedTotals: planned });

  const suggestTargets = { kcal: 2800, pro: 170, glu: 300, lip: 80 };
  const suggested = suggestBanque(suggestTargets);
  const weights = [0.3, 0.05, 0.25, 0.1, 0.25, 0.05];
  const distributed = distribuerPortions(5, weights);

  const sampleBanque = { pro: '2', fec: '3', leg: '2', fru: '1', lai: '1', lip: '1', whey: '0.5' };

  return {
    contractVersion: CONTRACT_VERSION,
    moyennes: MOYENNES,
    pdfVarianceThresholds: PDF_VARIANCE_THRESHOLDS,
    cases: [
      {
        id: 'banque-totals-known',
        brand: 'kr',
        locale: 'fr',
        engine: 'computeBanqueTotals',
        input: { banque },
        expected: banqueTotals,
      },
      {
        id: 'banque-totals-sample',
        brand: 'elevate',
        locale: 'en',
        engine: 'computeBanqueTotals',
        input: { banque: sampleBanque },
        expected: computeBanqueTotals(sampleBanque),
      },
      {
        id: 'planned-from-repartition',
        brand: 'kr',
        locale: 'fr',
        engine: 'computePlannedTotalsFromRepartition',
        input: { repartition },
        expected: planned,
      },
      {
        id: 'reconcile-within-threshold',
        brand: 'kr',
        locale: 'fr',
        engine: 'reconcilePlanTotals',
        input: { targets, banqueTotals, plannedTotals: planned },
        expected: {
          varianceVsTarget: recon.varianceVsTarget,
          banqueVsTarget: recon.banqueVsTarget,
          plannedVsBanque: recon.plannedVsBanque,
          withinThreshold: recon.withinThreshold,
          thresholds: recon.thresholds,
        },
      },
      {
        id: 'suggest-banque-2800',
        brand: 'kr',
        locale: 'fr',
        engine: 'suggestBanque',
        input: { targets: suggestTargets },
        expected: {
          banque: suggested,
          score: scorePortions(suggested, suggestTargets),
        },
      },
      {
        id: 'distribuer-portions-5',
        brand: 'elevate',
        locale: 'en',
        engine: 'distribuerPortions',
        input: { total: 5, weights },
        expected: { portions: distributed, sum: distributed.reduce((a, b) => a + b, 0) },
      },
    ],
  };
}

function buildFoodSearchCases() {
  const coachDataPath = path.join(root, 'coach-calculator', 'coach-data.json');
  const data = JSON.parse(fs.readFileSync(coachDataPath, 'utf8'));
  const foods = Array.isArray(data.foods) ? data.foods : [];

  function search(q, category = '') {
    const query = String(q || '').trim().toLowerCase();
    return foods
      .filter((f) => {
        if (category && f.displayCategory !== category) return false;
        if (!query) return true;
        return (f.nameFr || '').toLowerCase().includes(query)
          || (f.nameEn || '').toLowerCase().includes(query)
          || (f.portionFr || '').toLowerCase().includes(query);
      })
      .map((f) => f.id)
      .sort();
  }

  const queries = [
    { id: 'search-empty-all', q: '', category: '', brand: 'kr', locale: 'fr' },
    { id: 'search-poulet-fr', q: 'poulet', category: '', brand: 'kr', locale: 'fr' },
    { id: 'search-chicken-en', q: 'chicken', category: '', brand: 'elevate', locale: 'en' },
    { id: 'search-avoine', q: 'avoine', category: '', brand: 'kr', locale: 'fr' },
    { id: 'search-category-fruits', q: '', category: 'fruits', brand: 'elevate', locale: 'en' },
    { id: 'search-lait', q: 'lait', category: '', brand: 'kr', locale: 'fr' },
  ];

  return {
    contractVersion: CONTRACT_VERSION,
    engine: 'filtrerGuideEquivalents-parity (client filter semantics)',
    totalFoods: data.totalFoods,
    verifiedFoods: data.verifiedFoods,
    cases: queries.map((q) => ({
      ...q,
      expected: {
        count: search(q.q, q.category).length,
        ids: search(q.q, q.category),
      },
    })),
  };
}

function buildPdfContracts() {
  const samplePlanTextFr = 'Plan alimentaire KR Kinetics — maintien — protéines glucides lipides';
  const samplePlanTextEn = 'Nutrition plan Elevate Fitness — maintenance — protein carbs fat';
  assertNoForbiddenPdfContent(samplePlanTextFr);
  assertNoForbiddenPdfContent(samplePlanTextEn);

  return {
    contractVersion: CONTRACT_VERSION,
    engine: 'pdf-field-contracts (no binary hash)',
    notes: 'Binary PDF bytes are non-deterministic (html2canvas). Contracts lock labels/markers/brands.',
    forbiddenMarkers: FORBIDDEN_PDF_MARKERS,
    brands: {
      kr: {
        id: BRANDS.kr.id,
        displayName: BRANDS.kr.displayName,
        slug: BRANDS.kr.slug,
        guidePath: BRANDS.kr.guidePath,
        orgSlug: 'kr-kinetics',
      },
      elevate: {
        id: BRANDS.elevate.id,
        displayName: BRANDS.elevate.displayName,
        slug: BRANDS.elevate.slug,
        guidePath: BRANDS.elevate.guidePath,
        orgSlug: 'elevate-fitness',
      },
    },
    orgSlugToBrandId: ORG_SLUG_TO_BRAND_ID,
    locales: ['fr', 'en'],
    cases: [
      {
        id: 'pdf-text-fr-allowed',
        brand: 'kr',
        locale: 'fr',
        input: { text: samplePlanTextFr },
        expected: { forbidden: false },
      },
      {
        id: 'pdf-text-en-allowed',
        brand: 'elevate',
        locale: 'en',
        input: { text: samplePlanTextEn },
        expected: { forbidden: false },
      },
      {
        id: 'pdf-text-forbidden-rollup',
        brand: 'kr',
        locale: 'fr',
        input: { text: 'Section interne rollup visible' },
        expected: { forbidden: true },
      },
    ],
    pdfFieldsRequired: [
      'clientName', 'date', 'goalLabel', 'macroRatio', 'targets',
      'banqueTotals', 'plannedTotals', 'hydration', 'brandId', 'locale',
    ],
  };
}

function buildToleranceCases() {
  return {
    contractVersion: CONTRACT_VERSION,
    notes: [
      'These are BUSINESS tolerances (dual-brand / PDF variance), not engine parity.',
      'Do not use them to mask same-engine regressions before/after server migration.',
    ],
    pdfVarianceThresholds: PDF_VARIANCE_THRESHOLDS,
    dualBrand: {
      energyPct: 0.02,
      energyFloorKcal: 50,
      macroPct: 0.06,
      macroFloorG: 5,
      formula: 'energyTolerance = max(50, round(target.kcal * 0.02)); macroTolerance(v) = max(5, round(v * 0.06))',
    },
    cases: [
      {
        id: 'pdf-variance-within',
        kind: 'pdfVarianceThresholds',
        target: { kcal: 3238, pro: 168, glu: 385, lip: 114 },
        actual: { kcal: 3250, pro: 169, glu: 387, lip: 114 },
        expectedWithin: true,
      },
      {
        id: 'pdf-variance-outside',
        kind: 'pdfVarianceThresholds',
        target: { kcal: 100, pro: 10, glu: 10, lip: 4 },
        actual: { kcal: 250, pro: 25, glu: 25, lip: 10 },
        expectedWithin: false,
      },
      {
        id: 'dual-brand-within-2pct',
        kind: 'withinCoachTolerance',
        target: { kcal: 3000, pro: 150, glu: 300, lip: 80 },
        actual: { kcal: 3050, pro: 155, glu: 310, lip: 82 },
        expectedWithin: true,
      },
      {
        id: 'dual-brand-outside',
        kind: 'withinCoachTolerance',
        target: { kcal: 3000, pro: 150, glu: 300, lip: 80 },
        actual: { kcal: 3200, pro: 180, glu: 360, lip: 100 },
        expectedWithin: false,
      },
    ],
  };
}

function main() {
  assertRegenerateAllowed();

  writeJson('contract-meta.json', {
    contractVersion: CONTRACT_VERSION,
    generatedBy: 'scripts/regenerate-golden-fixtures.mjs',
    engine: 'src/lib/coach-calculator-engine.mjs',
    immutability: 'Do not edit by hand to pass tests. Regenerate only with COACH_REGENERATE_GOLDEN=1 after explicit métier review.',
    comparisonModes: {
      strictEngineParity: 'Exact equality for deterministic engine outputs',
      businessTolerances: 'Separate suite for dual-brand ±2%/±6% and PDF_VARIANCE_THRESHOLDS',
    },
  });

  writeJson('eer-tdee.cases.json', {
    contractVersion: CONTRACT_VERSION,
    cases: buildEerCases(),
  });

  writeJson('macro-targets.cases.json', {
    contractVersion: CONTRACT_VERSION,
    cases: buildMacroCases(),
  });

  writeJson('portions-banque.cases.json', buildPortionsCases());
  writeJson('food-search.cases.json', buildFoodSearchCases());
  writeJson('pdf-contracts.cases.json', buildPdfContracts());
  writeJson('business-tolerances.cases.json', buildToleranceCases());

  // Sanity: pure NASEM helper samples locked in eer file via computeEerTdee;
  // also lock direct helper samples for youth/adult matrix audit continuity.
  writeJson('nasem-direct.cases.json', {
    contractVersion: CONTRACT_VERSION,
    cases: [
      {
        id: 'direct-youth-h-17',
        engine: 'computeNasem2023Eer',
        input: { sexe: 'H', age: 17, poidsKg: 70, hauteurCm: 175, activite: 'modere' },
        expected: { eer: Math.round(computeNasem2023Eer({
          sexe: 'H', age: 17, poidsKg: 70, hauteurCm: 175, activite: 'modere',
        })) },
      },
      {
        id: 'direct-adult-f-37',
        engine: 'computeNasem2023Eer',
        input: { sexe: 'F', age: 37, poidsKg: 63.5029, hauteurCm: 160, activite: 'modere' },
        expected: { eer: Math.round(computeNasem2023Eer({
          sexe: 'F', age: 37, poidsKg: 63.5029, hauteurCm: 160, activite: 'modere',
        })) },
      },
      {
        id: 'direct-iom-male',
        engine: 'computeIom2005Eer',
        input: {
          sexe: 'H', age: 30, poidsKg: weightToKg(185, 'lbs'), hauteurM: 1.8, activite: 'modere',
        },
        expected: {
          eer: Math.round(computeIom2005Eer({
            sexe: 'H', age: 30, poidsKg: weightToKg(185, 'lbs'), hauteurM: 1.8, activite: 'modere',
          })),
        },
      },
    ],
  });

  // Reference kcal helper used by PDF macros display
  writeJson('macro-energy.cases.json', {
    contractVersion: CONTRACT_VERSION,
    cases: [
      {
        id: 'atwater-4-4-9',
        engine: 'kcalFromMacros',
        input: { pro: 168, glu: 387, lip: 114 },
        expected: { kcal: kcalFromMacros(168, 387, 114) },
      },
    ],
  });

  console.log(`Golden fixtures written under ${path.relative(root, outDir)}`);
  console.log(`contractVersion=${CONTRACT_VERSION}`);
}

main();
