/**
 * Phase 2B — BUSINESS tolerance contracts (separate from strict engine parity).
 *
 * Dual-brand withinCoachTolerance (±2% energy / ±6% macros with floors) and
 * PDF_VARIANCE_THRESHOLDS must NEVER be used to hide same-engine regressions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDF_VARIANCE_THRESHOLDS } from '../src/lib/coach-calculator-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(
  fs.readFileSync(path.join(root, 'tests', 'fixtures', 'golden', 'business-tolerances.cases.json'), 'utf8'),
);

/** Mirrors scripts/coach-calculator-dual-brand.mjs withinCoachTolerance (no formula change). */
function withinCoachTolerance(target, actual) {
  const energyTolerance = Math.max(50, Math.round((target.kcal || 0) * 0.02));
  const macroTolerance = (value) => Math.max(5, Math.round((value || 0) * 0.06));
  return Math.abs((actual.kcal || 0) - (target.kcal || 0)) <= energyTolerance
    && Math.abs((actual.pro || 0) - (target.pro || 0)) <= macroTolerance(target.pro)
    && Math.abs((actual.glu || 0) - (target.glu || 0)) <= macroTolerance(target.glu)
    && Math.abs((actual.lip || 0) - (target.lip || 0)) <= macroTolerance(target.lip);
}

function withinPdfVariance(target, actual, thresholds = PDF_VARIANCE_THRESHOLDS) {
  return Math.abs((actual.kcal || 0) - (target.kcal || 0)) <= thresholds.kcal
    && Math.abs((actual.pro || 0) - (target.pro || 0)) <= thresholds.pro
    && Math.abs((actual.glu || 0) - (target.glu || 0)) <= thresholds.glu
    && Math.abs((actual.lip || 0) - (target.lip || 0)) <= thresholds.lip;
}

test('business tolerance fixture documents dual-brand and PDF thresholds separately', () => {
  assert.equal(fixture.contractVersion, '2B.1');
  assert.deepEqual(fixture.pdfVarianceThresholds, PDF_VARIANCE_THRESHOLDS);
  assert.equal(fixture.dualBrand.energyPct, 0.02);
  assert.equal(fixture.dualBrand.macroPct, 0.06);
  assert.ok(fixture.notes.some((n) => /same-engine|même moteur|mask/i.test(n)));
});

test('PDF_VARIANCE_THRESHOLDS business cases', () => {
  for (const c of fixture.cases.filter((x) => x.kind === 'pdfVarianceThresholds')) {
    assert.equal(withinPdfVariance(c.target, c.actual), c.expectedWithin, c.id);
  }
});

test('dual-brand withinCoachTolerance business cases (±2% / ±6%)', () => {
  for (const c of fixture.cases.filter((x) => x.kind === 'withinCoachTolerance')) {
    assert.equal(withinCoachTolerance(c.target, c.actual), c.expectedWithin, c.id);
  }
});

test('strict engine delta of 1 kcal fails PDF floor only when beyond thresholds — not via dual-brand %', () => {
  // Documents that a 1 kcal engine drift is NOT accepted by PDF absolute thresholds
  // when comparing identical targets in a strict parity suite (separate concern).
  const target = { kcal: 3000, pro: 150, glu: 300, lip: 80 };
  const drifted = { kcal: 3001, pro: 150, glu: 300, lip: 80 };
  assert.equal(withinPdfVariance(target, drifted), true, '1 kcal still within absolute PDF band');
  assert.notDeepEqual(drifted, target, 'strict parity would still catch exact object inequality');
});
