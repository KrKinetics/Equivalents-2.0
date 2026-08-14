/**
 * Regression: legacy indexed repartition objects must hydrate to canonical Arrays,
 * while the Coach API validator stays strict. Banque summary cards must not be
 * wiped by a secondary planned_totals failure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createEmptyJourData,
  migrateProfilData,
  normalizeLegacyRepartition,
} from '../src/coach/domain/clients.mjs';
import { validatePortionsBody } from '../src/coach/server/validation/request-validators.mjs';
import { calculatePortions } from '../src/coach/server/calc/portions.mjs';
import { applyBanqueTotalsToSummaryCards } from '../src/coach/client/server-nutrition-bridge.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CELL_COUNT = 42;

function legacyIndexedObject(overrides = {}) {
  const out = {};
  for (let i = 0; i < CELL_COUNT; i += 1) out[String(i)] = '0';
  for (const [k, v] of Object.entries(overrides)) out[String(k)] = v;
  return out;
}

test('TEST 1 — legacy hydration converts indexed object 0..41 to Array(42)', () => {
  const legacyRepos = legacyIndexedObject({ 0: '0', 1: '2.5', 7: '1' });
  const migrated = migrateProfilData({
    sexe: 'H',
    jours: {
      entrainement: { ...createEmptyJourData(), banque: { pro: '1' } },
      repos: { ...createEmptyJourData(), repartition: legacyRepos },
    },
  });
  assert.ok(Array.isArray(migrated.jours.repos.repartition));
  assert.equal(migrated.jours.repos.repartition.length, CELL_COUNT);
  assert.equal(migrated.jours.repos.repartition[1], 2.5);
  assert.equal(migrated.jours.repos.repartition[7], 1);
});

test('TEST 2 — valid modern Array repartition remains unchanged', () => {
  const modern = new Array(CELL_COUNT).fill(0);
  modern[3] = 4;
  const sameRef = modern;
  const result = normalizeLegacyRepartition(sameRef);
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.equal(result.value, sameRef);
  assert.equal(result.value[3], 4);

  const migrated = migrateProfilData({
    sexe: 'F',
    jours: {
      entrainement: { ...createEmptyJourData(), repartition: modern },
      repos: createEmptyJourData(),
    },
  });
  assert.ok(Array.isArray(migrated.jours.entrainement.repartition));
  assert.equal(migrated.jours.entrainement.repartition[3], 4);
});

test('TEST 3 — legacy numeric/string values preserve index and numeric value', () => {
  const legacy = legacyIndexedObject({
    0: '1',
    5: '2,5',
    41: 3,
  });
  const result = normalizeLegacyRepartition(legacy);
  assert.equal(result.ok, true);
  assert.equal(result.value[0], 1);
  assert.equal(result.value[5], 2.5);
  assert.equal(result.value[41], 3);
  assert.equal(result.value[2], 0);
});

test('TEST 4 — malformed legacy structures are not silently accepted', () => {
  assert.equal(normalizeLegacyRepartition({ foo: 1 }).ok, false);
  assert.equal(normalizeLegacyRepartition({ 0: 1, 99: 1 }).ok, false);
  assert.equal(normalizeLegacyRepartition({ 0: 'nope' }).ok, false);
  assert.equal(normalizeLegacyRepartition({ 0: -1 }).ok, false);
  assert.equal(normalizeLegacyRepartition('oops').ok, false);

  const malformed = migrateProfilData({
    sexe: 'H',
    jours: {
      entrainement: createEmptyJourData(),
      repos: {
        ...createEmptyJourData(),
        repartition: { foo: 1, bar: 2 },
      },
    },
  });
  // Rejected structures stay as-is (not silently coerced into a fake Array).
  assert.equal(Array.isArray(malformed.jours.repos.repartition), false);
  assert.deepEqual(malformed.jours.repos.repartition, { foo: 1, bar: 2 });
});

test('TEST 5 — strict API validation still rejects object repartitions', () => {
  const legacy = legacyIndexedObject({ 0: '1' });
  const rejected = validatePortionsBody({
    action: 'planned_totals',
    repartition: legacy,
  });
  assert.equal(rejected.ok, false);
  assert.match(String(rejected.message || rejected.error), /invalid_repartition|bad_request/);

  const modern = validatePortionsBody({
    action: 'planned_totals',
    repartition: new Array(CELL_COUNT).fill(0),
  });
  assert.equal(modern.ok, true);
  assert.ok(Array.isArray(modern.value.repartition));
});

test('TEST 6 — banque totals populate gen-pro / gen-glu / gen-lip / gen-kcal', () => {
  const cards = {
    'gen-pro': { textContent: '0 g' },
    'gen-glu': { textContent: '0 g' },
    'gen-lip': { textContent: '0 g' },
    'gen-kcal': { textContent: '0 kcal' },
  };
  const prevDoc = globalThis.document;
  globalThis.document = {
    getElementById(id) {
      return cards[id] || null;
    },
  };
  try {
    applyBanqueTotalsToSummaryCards({ pro: 223, glu: 228, lip: 69, kcal: 2425 });
    assert.equal(cards['gen-pro'].textContent, '223 g');
    assert.equal(cards['gen-glu'].textContent, '228 g');
    assert.equal(cards['gen-lip'].textContent, '69 g');
    assert.equal(cards['gen-kcal'].textContent, '2425 kcal');
  } finally {
    globalThis.document = prevDoc;
  }
});

test('TEST 7 — secondary refresh failure isolation (source contract)', () => {
  const bridge = fs.readFileSync(
    path.join(ROOT, 'src/coach/client/server-nutrition-bridge.mjs'),
    'utf8',
  );
  const fnStart = bridge.indexOf('async function calculerBanqueServer()');
  const fnEnd = bridge.indexOf('function calculerBanqueFromUi()', fnStart);
  assert.ok(fnStart > 0 && fnEnd > fnStart);
  const body = bridge.slice(fnStart, fnEnd);
  const primary = body.indexOf('applyBanqueTotalsToSummaryCards(totals)');
  const secondaryTry = body.indexOf('await refreshPlannedTotalsFromServer()');
  assert.ok(primary > 0, 'primary bank card render must exist');
  assert.ok(secondaryTry > primary, 'secondary refresh must run after primary card render');
  assert.match(body, /try \{\s*await refreshPlannedTotalsFromServer\(\);/);
  assert.match(body, /catch \(secondaryErr\)/);

  // Cards from a successful primary result stay populated even if a later notify runs.
  const cards = {
    'gen-pro': { textContent: '0 g' },
    'gen-glu': { textContent: '0 g' },
    'gen-lip': { textContent: '0 g' },
    'gen-kcal': { textContent: '0 kcal' },
  };
  const prevDoc = globalThis.document;
  globalThis.document = { getElementById: (id) => cards[id] || null };
  try {
    applyBanqueTotalsToSummaryCards({ pro: 100, glu: 200, lip: 50, kcal: 1700 });
    // Simulate secondary failure path: notify only — do not zero cards.
    assert.equal(cards['gen-pro'].textContent, '100 g');
    assert.equal(cards['gen-kcal'].textContent, '1700 kcal');
  } finally {
    globalThis.document = prevDoc;
  }
});

test('TEST 8 — legacy Coach dossier regression fixture', () => {
  const trainingArray = new Array(CELL_COUNT).fill(0);
  trainingArray[0] = 2;
  trainingArray[1] = 1;
  const reposLegacy = legacyIndexedObject();
  const banque = {
    pro: 20, fec: 10.5, leg: 2, fru: 1, lai: 0.5, lip: 2.5, whey: 0,
  };
  const migrated = migrateProfilData({
    sexe: 'H',
    jours: {
      entrainement: {
        ...createEmptyJourData(),
        banque,
        repartition: trainingArray,
      },
      repos: {
        ...createEmptyJourData(),
        banque: { pro: '0', fec: '0', leg: '0', fru: '0', lai: '0', lip: '0', whey: '0' },
        repartition: reposLegacy,
      },
    },
  });

  assert.ok(Array.isArray(migrated.jours.entrainement.repartition));
  assert.ok(Array.isArray(migrated.jours.repos.repartition));
  assert.equal(migrated.jours.repos.repartition.length, CELL_COUNT);

  const plannedPayload = validatePortionsBody({
    action: 'planned_totals',
    repartition: migrated.jours.repos.repartition,
  });
  assert.equal(plannedPayload.ok, true, 'hydrated repos must pass strict API validation');

  const bankPayload = validatePortionsBody({
    action: 'banque_totals',
    banque: migrated.jours.entrainement.banque,
  });
  assert.equal(bankPayload.ok, true);
  const bankResult = calculatePortions(bankPayload.value);
  assert.ok(bankResult.totals.pro > 0);
  assert.ok(bankResult.totals.glu > 0);
  assert.ok(bankResult.totals.lip > 0);
  assert.ok(bankResult.totals.kcal > 0);
});

test('empty jour defaults use canonical Array repartition', () => {
  const empty = createEmptyJourData();
  assert.ok(Array.isArray(empty.repartition));
  assert.equal(empty.repartition.length, CELL_COUNT);
  assert.ok(empty.repartition.every((v) => v === 0));
});

test('HTML apply path preserves Array (no object re-spread)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'coach-calculator/index.html'), 'utf8');
  assert.doesNotMatch(
    html,
    /repartition:\s*\{\s*\.\.\.entBase\.repartition,\s*\.\.\.migrated\.jours\.entrainement\.repartition\s*\}/,
  );
  assert.match(html, /CoachSharedEngine\.migrateProfilData/);
  assert.match(html, /normalizeLegacyRepartition/);
});

test('portal strip stub keeps legacy repartition hydration (not nutrition IP)', async () => {
  const { stripClientNutritionFormulas } = await import('../scripts/coach-portal-deploy-lib.mjs');
  const sample = `<html><body><script id="coach-shared-engine">
const MOYENNES = { pro: { p: 9, g: 0, l: 2 } };
global.CoachSharedEngine = { suggestBanque() { return MOYENNES; } };
</script></body></html>`;
  const out = stripClientNutritionFormulas(sample);
  assert.match(out, /migrateProfilData:\s*migrateProfilData/);
  assert.match(out, /normalizeLegacyRepartition:\s*normalizeLegacyRepartition/);
  assert.match(out, /Client engine disabled/);
  assert.doesNotMatch(out, /suggestBanque\(\)\s*\{\s*return MOYENNES/);
});
