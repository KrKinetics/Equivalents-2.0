/**
 * Deterministic coverage: auto portions → canonical day → plan snapshot → PDF gate.
 * Numeric expectations come from golden fixtures / server engine — not screenshots.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  suggestBanque,
  buildAutoRepartition,
  computeBanqueTotals,
  computePlannedTotalsFromRepartition,
  reconcilePlanTotals,
  PDF_VARIANCE_THRESHOLDS,
  CATS,
  MEAL_COUNT,
} from '../src/lib/coach-calculator-engine.mjs';
import { calculatePortions } from '../src/coach/server/calc/portions.mjs';
import { buildPlanSnapshot } from '../src/coach/server/pdf/build-plan-snapshot.mjs';
import { assertPlanReadyForPdf } from '../src/coach/server/pdf/assert-plan-ready.mjs';
import { loadBrandLogoDataUri } from '../src/coach/server/pdf/resolve-logo.mjs';
import { buildPdfDocumentHtml } from '../src/coach/server/pdf/build-pdf-html.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const golden = JSON.parse(
  fs.readFileSync(path.join(root, 'tests/fixtures/golden/portions-banque.cases.json'), 'utf8'),
);

function categorySums(repartition) {
  const sums = {};
  for (const cat of CATS) {
    let s = 0;
    const ci = CATS.indexOf(cat);
    for (let m = 0; m < MEAL_COUNT; m += 1) s += Number(repartition[m * CATS.length + ci]) || 0;
    sums[cat] = Math.round(s * 10) / 10;
  }
  return sums;
}

test('server calculatePortions(auto_repartition) matches golden suggest→distribute chain', () => {
  const suggestCase = golden.cases.find((c) => c.id === 'suggest-banque-2800');
  const autoCase = golden.cases.find((c) => c.id === 'auto-repartition-classique-from-suggest-2800');
  assert.ok(suggestCase && autoCase);

  const suggested = suggestBanque(suggestCase.input.targets);
  assert.deepEqual(suggested, suggestCase.expected.banque);

  const api = calculatePortions({
    action: 'auto_repartition',
    banque: suggested,
    mode: 'classique',
  });
  assert.deepEqual(
    api.repartition.slice(0, autoCase.expected.repartition.length),
    autoCase.expected.repartition,
  );
  assert.ok(
    api.repartition.slice(autoCase.expected.repartition.length).every((value) => value === 0),
    'new evening-meal cells start at zero',
  );
  assert.deepEqual(api.plannedTotals, autoCase.expected.plannedTotals);
  assert.deepEqual(categorySums(api.repartition), autoCase.expected.categorySums);
  assert.ok(api.plannedTotals.kcal > 0);
  assert.ok(api.banqueTotals.kcal > 0);
});

test('canonical snapshot keeps non-zero planned macros for KR + Elevate locales', () => {
  const autoCase = golden.cases.find((c) => c.id === 'auto-repartition-classique-from-suggest-2800');
  const targets = { kcal: 2800, pro: 170, glu: 300, lip: 80 };
  for (const locale of ['fr', 'en']) {
    for (const brand of ['kr', 'elevate']) {
      const day = {
        banque: autoCase.input.banque,
        repartition: autoCase.expected.repartition,
        eauAjout: 0,
        eauManuel: false,
        repartitionSelonEntrainement: true,
      };
      const snapshot = buildPlanSnapshot({ day, targets, locale, jourKey: 'entrainement' });
      assert.equal(snapshot.plannedTotals.kcal, autoCase.expected.plannedTotals.kcal, `${brand}/${locale}`);
      assert.ok(snapshot.meals.length > 0, `${brand}/${locale} meals`);
      assert.ok(snapshot.macroPercentages.pro > 0, `${brand}/${locale} chart`);
      assert.ok(snapshot.totals.kcal > 0, `${brand}/${locale} totals`);
      const recon = reconcilePlanTotals({
        targets,
        banqueTotals: computeBanqueTotals(day.banque),
        plannedTotals: snapshot.plannedTotals,
      });
      assert.deepEqual(recon.thresholds, PDF_VARIANCE_THRESHOLDS);
    }
  }
});

test('assertPlanReadyForPdf rejects empty calculated plans and accepts golden plan', () => {
  const autoCase = golden.cases.find((c) => c.id === 'auto-repartition-classique-from-suggest-2800');
  const targets = { kcal: 2800, pro: 170, glu: 300, lip: 80 };

  const empty = assertPlanReadyForPdf({
    training: {
      banque: autoCase.input.banque,
      repartition: new Array(42).fill(0),
      targets,
    },
    include_rest: false,
  });
  assert.equal(empty.ok, false);
  assert.equal(empty.error, 'plan_not_ready');
  assert.equal(empty.status, 409);

  const ready = assertPlanReadyForPdf({
    training: {
      banque: autoCase.input.banque,
      repartition: autoCase.expected.repartition,
      targets,
    },
    include_rest: false,
  });
  assert.equal(ready.ok, true);

  const inconsistent = assertPlanReadyForPdf({
    training: {
      banque: autoCase.input.banque,
      // Non-zero slots that do not form a coherent meal plan vs banque (all tiny leftovers).
      repartition: (() => {
        const r = new Array(42).fill(0);
        r[1] = 0.5; // one fec portion only
        return r;
      })(),
      targets,
    },
    include_rest: false,
  });
  assert.equal(inconsistent.ok, false);
  assert.ok(['plan_not_ready', 'inconsistent_plan'].includes(inconsistent.error));
});

test('Elevate + KR logos load non-empty bytes (file or embedded)', async () => {
  for (const brandId of ['kr', 'elevate']) {
    const logo = await loadBrandLogoDataUri(brandId);
    assert.ok(logo.bytes > 1000, brandId);
    assert.match(logo.dataUri, /^data:image\/(png|jpeg);base64,/);
    assert.ok(!Number.isNaN(logo.bytes));
  }
});

test('PDF HTML for Elevate includes non-empty logo data URI and planned macros', async () => {
  const autoCase = golden.cases.find((c) => c.id === 'auto-repartition-classique-from-suggest-2800');
  const targets = { kcal: 2800, pro: 170, glu: 300, lip: 80 };
  const day = {
    banque: autoCase.input.banque,
    repartition: autoCase.expected.repartition,
    eauAjout: 0,
    eauManuel: false,
  };
  const snapshot = buildPlanSnapshot({ day, targets, locale: 'fr', jourKey: 'entrainement' });
  const logo = await loadBrandLogoDataUri('elevate');
  const html = buildPdfDocumentHtml({
    locale: 'fr',
    brandId: 'elevate',
    athleteName: 'Fixture Athlete',
    dateStr: '2026-08-05',
    goalLabel: 'Maintien',
    ratioLabel: '—',
    notes: '',
    trainingSnapshot: snapshot,
    restSnapshot: null,
    logoDataUri: logo.dataUri,
  });
  assert.match(html, /data:image\/jpeg;base64,/);
  assert.match(html, new RegExp(String(autoCase.expected.plannedTotals.kcal)));
  assert.doesNotMatch(html, /src=""/);
});

test('equilibre mode preserves banque category sums (Elevate golden)', () => {
  const autoCase = golden.cases.find((c) => c.id === 'auto-repartition-equilibre-elevate');
  const built = buildAutoRepartition(autoCase.input);
  assert.deepEqual(categorySums(built.repartition), autoCase.expected.categorySums);
  const planned = computePlannedTotalsFromRepartition(built.repartition);
  assert.ok(planned.kcal > 0);
  // Protein never auto-placed on excluded meals 0,1,3
  const proIdx = CATS.indexOf('pro');
  for (const meal of [0, 1, 3]) {
    assert.equal(built.repartition[meal * CATS.length + proIdx], 0, `pro meal ${meal}`);
  }
});
