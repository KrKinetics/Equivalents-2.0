/**
 * Phase 2B — strict engine parity against immutable golden fixtures.
 *
 * Changing expected outputs requires explicit métier review and:
 *   COACH_REGENERATE_GOLDEN=1 node scripts/regenerate-golden-fixtures.mjs
 *
 * npm test NEVER regenerates these files.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOYENNES,
  PDF_VARIANCE_THRESHOLDS,
  FORBIDDEN_PDF_MARKERS,
  computeEerTdee,
  computeNasem2023Eer,
  computeIom2005Eer,
  computeMacroTargets,
  computeProteinGrams,
  computeHydration,
  computeBanqueTotals,
  suggestBanque,
  scorePortions,
  distribuerPortions,
  buildAutoRepartition,
  CATS,
  MEAL_COUNT,
  computePlannedTotalsFromRepartition,
  reconcilePlanTotals,
  kcalFromMacros,
  assertNoForbiddenPdfContent,
} from '../src/lib/coach-calculator-engine.mjs';
import { BRANDS } from '../src/coach/branding/brands.mjs';
import { ORG_SLUG_TO_BRAND_ID } from '../src/coach/workspace/org-brand.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const goldenDir = path.join(root, 'tests', 'fixtures', 'golden');

function readGolden(name) {
  return JSON.parse(fs.readFileSync(path.join(goldenDir, name), 'utf8'));
}

function searchFoodIds(foods, q, category = '') {
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

test('golden fixtures exist and refuse accidental regeneration env in ordinary tests', () => {
  assert.notEqual(process.env.COACH_REGENERATE_GOLDEN, '1');
  const meta = readGolden('contract-meta.json');
  assert.equal(meta.contractVersion, '2B.1');
  assert.match(meta.immutability, /métier review|metier review|explicit/i);
  for (const name of [
    'eer-tdee.cases.json',
    'macro-targets.cases.json',
    'portions-banque.cases.json',
    'food-search.cases.json',
    'pdf-contracts.cases.json',
    'business-tolerances.cases.json',
    'nasem-direct.cases.json',
    'macro-energy.cases.json',
  ]) {
    assert.ok(fs.existsSync(path.join(goldenDir, name)), name);
  }
});

test('regenerate script refuses without COACH_REGENERATE_GOLDEN=1', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, ['scripts/regenerate-golden-fixtures.mjs'], {
    cwd: root,
    env: { ...process.env, COACH_REGENERATE_GOLDEN: '' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /Refusing golden regeneration/i);
});

test('strict parity: EER/TDEE golden cases', () => {
  const { cases } = readGolden('eer-tdee.cases.json');
  assert.ok(cases.length >= 8);
  for (const c of cases) {
    const actual = computeEerTdee(c.input);
    assert.deepEqual(
      { bmr: Math.round(actual.bmr), tdee: Math.round(actual.tdee), method: actual.method },
      c.expected,
      c.id,
    );
  }
});

test('strict parity: direct NASEM/IOM helper samples', () => {
  const { cases } = readGolden('nasem-direct.cases.json');
  for (const c of cases) {
    if (c.engine === 'computeNasem2023Eer') {
      assert.equal(Math.round(computeNasem2023Eer(c.input)), c.expected.eer, c.id);
    } else if (c.engine === 'computeIom2005Eer') {
      assert.equal(Math.round(computeIom2005Eer(c.input)), c.expected.eer, c.id);
    } else {
      assert.fail(`unknown engine ${c.engine}`);
    }
  }
});

test('strict parity: macro targets, protein, hydration', () => {
  const { cases } = readGolden('macro-targets.cases.json');
  for (const c of cases) {
    if (c.engine === 'computeMacroTargets') {
      assert.deepEqual(computeMacroTargets(c.input), c.expected, c.id);
    } else if (c.engine === 'computeProteinGrams') {
      assert.equal(
        computeProteinGrams({ mode: 'gkg', weightKg: 80, gPerKg: 2, goalKcal: 2500 }),
        c.expected.gkg_2,
        c.id,
      );
      assert.equal(
        computeProteinGrams({ mode: 'gkg', weightKg: 80, gPerKg: 1.5, goalKcal: 2500 }),
        c.expected.gkg_1_5,
        c.id,
      );
      assert.equal(
        computeProteinGrams({ mode: 'gkg', weightKg: 80, gPerKg: 0.5, goalKcal: 2500 }),
        c.expected.gkg_clamped_low,
        c.id,
      );
      assert.equal(
        computeProteinGrams({ mode: 'pct', weightKg: 80, pct: 25, goalKcal: 2500 }),
        c.expected.pct_25,
        c.id,
      );
    } else if (c.engine === 'computeHydration') {
      assert.deepEqual(computeHydration(3258, 0), c.expected.h3258, c.id);
      assert.deepEqual(computeHydration(3258, 0.5), c.expected.h3258_add, c.id);
      assert.deepEqual(computeHydration(0, 1), c.expected.h0_add, c.id);
    }
  }
});

test('strict parity: moyennes, portions, banque, suggestBanque, reconcile', () => {
  const fixture = readGolden('portions-banque.cases.json');
  assert.deepEqual(MOYENNES, fixture.moyennes);
  assert.deepEqual(PDF_VARIANCE_THRESHOLDS, fixture.pdfVarianceThresholds);

  for (const c of fixture.cases) {
    if (c.engine === 'computeBanqueTotals') {
      assert.deepEqual(computeBanqueTotals(c.input.banque), c.expected, c.id);
    } else if (c.engine === 'computePlannedTotalsFromRepartition') {
      assert.deepEqual(
        computePlannedTotalsFromRepartition(c.input.repartition),
        c.expected,
        c.id,
      );
    } else if (c.engine === 'reconcilePlanTotals') {
      const recon = reconcilePlanTotals(c.input);
      assert.deepEqual(recon.varianceVsTarget, c.expected.varianceVsTarget, c.id);
      assert.deepEqual(recon.banqueVsTarget, c.expected.banqueVsTarget, c.id);
      assert.deepEqual(recon.plannedVsBanque, c.expected.plannedVsBanque, c.id);
      assert.equal(recon.withinThreshold, c.expected.withinThreshold, c.id);
      assert.deepEqual(recon.thresholds, c.expected.thresholds, c.id);
    } else if (c.engine === 'suggestBanque') {
      const suggested = suggestBanque(c.input.targets);
      assert.deepEqual(suggested, c.expected.banque, c.id);
      assert.equal(scorePortions(suggested, c.input.targets), c.expected.score, c.id);
    } else if (c.engine === 'distribuerPortions') {
      const portions = distribuerPortions(c.input.total, c.input.weights);
      assert.deepEqual(portions, c.expected.portions, c.id);
      assert.equal(portions.reduce((a, b) => a + b, 0), c.expected.sum, c.id);
    } else if (c.engine === 'buildAutoRepartition') {
      const built = buildAutoRepartition(c.input);
      assert.ok(built, c.id);
      assert.equal(built.mode, c.expected.mode, c.id);
      assert.equal(built.repartition.length, MEAL_COUNT * CATS.length, c.id);
      const sums = {};
      for (const cat of CATS) {
        let s = 0;
        const ci = CATS.indexOf(cat);
        for (let m = 0; m < MEAL_COUNT; m += 1) s += built.repartition[m * CATS.length + ci];
        sums[cat] = Math.round(s * 10) / 10;
      }
      assert.deepEqual(sums, c.expected.categorySums, c.id);
      if (c.expected.repartition) {
        assert.deepEqual(built.repartition, c.expected.repartition, c.id);
      }
      if (c.expected.plannedTotals) {
        assert.deepEqual(
          computePlannedTotalsFromRepartition(built.repartition),
          c.expected.plannedTotals,
          c.id,
        );
      }
      // Invariant: positive banque must not yield null planned totals.
      const planned = computePlannedTotalsFromRepartition(built.repartition);
      assert.ok(planned.kcal > 0, `${c.id}: planned kcal`);
      assert.ok(!Number.isNaN(planned.pro + planned.glu + planned.lip), `${c.id}: no NaN`);
    }
  }
});

test('strict parity: food search semantics over coach-data.json', () => {
  const fixture = readGolden('food-search.cases.json');
  const coachData = JSON.parse(
    fs.readFileSync(path.join(root, 'coach-calculator', 'coach-data.json'), 'utf8'),
  );
  assert.equal(coachData.totalFoods, fixture.totalFoods);
  assert.equal(coachData.verifiedFoods, fixture.verifiedFoods);
  const foods = Array.isArray(coachData.foods) ? coachData.foods : [];

  for (const c of fixture.cases) {
    const ids = searchFoodIds(foods, c.q, c.category);
    assert.equal(ids.length, c.expected.count, c.id);
    assert.deepEqual(ids, c.expected.ids, c.id);
  }
});

test('strict parity: PDF field contracts FR/EN and brands', () => {
  const fixture = readGolden('pdf-contracts.cases.json');
  assert.deepEqual(FORBIDDEN_PDF_MARKERS, fixture.forbiddenMarkers);
  assert.equal(BRANDS.kr.displayName, fixture.brands.kr.displayName);
  assert.equal(BRANDS.elevate.displayName, fixture.brands.elevate.displayName);
  assert.deepEqual(ORG_SLUG_TO_BRAND_ID, fixture.orgSlugToBrandId);
  assert.ok(fixture.pdfFieldsRequired.includes('brandId'));
  assert.ok(fixture.locales.includes('fr') && fixture.locales.includes('en'));

  for (const c of fixture.cases) {
    if (c.expected.forbidden) {
      assert.throws(() => assertNoForbiddenPdfContent(c.input.text), /Forbidden PDF marker/, c.id);
    } else {
      assert.doesNotThrow(() => assertNoForbiddenPdfContent(c.input.text), c.id);
    }
  }
});

test('strict parity: macro energy Atwater', () => {
  const { cases } = readGolden('macro-energy.cases.json');
  for (const c of cases) {
    assert.equal(kcalFromMacros(c.input.pro, c.input.glu, c.input.lip), c.expected.kcal, c.id);
  }
});
