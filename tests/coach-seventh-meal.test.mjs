/**
 * Engine-level coverage for the seventh meal (Repas de soirée / Evening Meal).
 * Pure Node — mirrors the golden-master model in src/lib/coach-calculator-engine.mjs.
 *
 * Covers requirements: data model (7 meals), legacy 6-meal compatibility,
 * migration of the old evening snack to "Collation", zero-init of "Repas de
 * soirée", planned totals including the new meal, remaining counter, and
 * before/after-save total stability.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATS,
  MEAL_COUNT,
  createEmptyJourData,
  migrateProfilData,
  distribuerPortions,
  computePlannedTotalsFromRepartition,
  computeBanqueTotals,
  evaluatePlanCompleteness,
  macroPercentagesFromGrams,
} from '../src/lib/coach-calculator-engine.mjs';

const LEGACY_MEAL_COUNT = 6;

function repIndex(mealIdx, cat) {
  return mealIdx * CATS.length + CATS.indexOf(cat);
}

/** Build a legacy 6-meal flat repartition (42 keys) with values in every meal. */
function buildLegacySixMealRepartition() {
  const rep = {};
  for (let i = 0; i < LEGACY_MEAL_COUNT * CATS.length; i += 1) rep[i] = '0';
  // Déjeuner
  rep[repIndex(0, 'fec')] = '2';
  rep[repIndex(0, 'pro')] = '1';
  // Dîner
  rep[repIndex(2, 'pro')] = '3';
  rep[repIndex(2, 'leg')] = '2';
  // Souper
  rep[repIndex(4, 'pro')] = '3';
  rep[repIndex(4, 'fec')] = '2';
  // Old "Collation Soirée" (meal index 5) — must survive as the new "Collation".
  rep[repIndex(5, 'lai')] = '1';
  rep[repIndex(5, 'whey')] = '1';
  return rep;
}

test('A/B — model exposes exactly seven meals', () => {
  assert.equal(MEAL_COUNT, 7);
  const empty = createEmptyJourData();
  assert.equal(Object.keys(empty.repartition).length, MEAL_COUNT * CATS.length);
  assert.equal(Object.keys(empty.repartition).length, 49);
  for (const v of Object.values(empty.repartition)) assert.equal(v, 0);
});

test('distribuerPortions spreads a total across all seven meals', () => {
  const weights = new Array(MEAL_COUNT).fill(1 / MEAL_COUNT);
  const portions = distribuerPortions(7, weights);
  assert.equal(portions.length, MEAL_COUNT);
  assert.equal(portions.reduce((a, b) => a + b, 0), 7);
  assert.ok(portions.every((p) => p % 0.5 === 0));
});

test('F/G/H — legacy 6-meal plan migrates without loss and zero-inits the evening meal', () => {
  const legacy = {
    nom: 'Legacy Six',
    sexe: 'H',
    age: 34,
    banque: { pro: '7', fec: '4', leg: '2', fru: '0', lai: '1', lip: '0', whey: '1' },
    repartition: buildLegacySixMealRepartition(),
    typeJour: 'entrainement',
  };
  const migrated = migrateProfilData(legacy);
  const rep = migrated.jours.entrainement.repartition;

  // Template now supports seven meals.
  assert.equal(Object.keys(rep).length, MEAL_COUNT * CATS.length);

  // Old meal 5 (former "Collation Soirée", now "Collation") keeps its portions.
  assert.equal(rep[repIndex(5, 'lai')], 1);
  assert.equal(rep[repIndex(5, 'whey')], 1);

  // Old meals are byte-for-byte preserved (indices 0..41).
  const legacyRep = legacy.repartition;
  for (let i = 0; i < LEGACY_MEAL_COUNT * CATS.length; i += 1) {
    assert.equal(String(rep[i]), String(legacyRep[i]), `legacy index ${i} preserved`);
  }

  // New meal 6 ("Repas de soirée") is initialised to zero, never lost/undefined.
  for (const cat of CATS) {
    assert.equal(rep[repIndex(6, cat)], 0, `evening meal ${cat} zero-initialised`);
  }
});

test('J — opening a legacy plan does not change historical totals (evening meal adds 0)', () => {
  const legacyRep = buildLegacySixMealRepartition();
  const beforeOpen = computePlannedTotalsFromRepartition(legacyRep);

  const migrated = migrateProfilData({
    banque: {}, repartition: legacyRep, typeJour: 'entrainement',
  });
  const afterOpen = computePlannedTotalsFromRepartition(migrated.jours.entrainement.repartition);

  assert.deepEqual(afterOpen, beforeOpen);
});

test('I — placing portions in the evening meal increases planned totals correctly', () => {
  const base = createEmptyJourData().repartition;
  base[repIndex(0, 'pro')] = '2'; // 18 P
  const withoutEvening = computePlannedTotalsFromRepartition(base);

  const withEvening = { ...base };
  // Evening meal: pro=2 (P18 G0 L4), fec=1 (P3 G18 L1) => +P21 +G18 +L5
  withEvening[repIndex(6, 'pro')] = '2';
  withEvening[repIndex(6, 'fec')] = '1';
  const after = computePlannedTotalsFromRepartition(withEvening);

  assert.equal(after.pro, withoutEvening.pro + 21);
  assert.equal(after.glu, withoutEvening.glu + 18);
  assert.equal(after.lip, withoutEvening.lip + 5);
  assert.ok(after.kcal > withoutEvening.kcal, 'evening meal must raise planned kcal');
});

test('J — planned totals are identical before and after a JSON save/reload round-trip', () => {
  const jour = createEmptyJourData();
  jour.repartition[repIndex(4, 'pro')] = '3';
  jour.repartition[repIndex(5, 'lai')] = '1';
  jour.repartition[repIndex(6, 'fec')] = '2'; // evening meal filled
  jour.repartition[repIndex(6, 'whey')] = '1';

  const before = computePlannedTotalsFromRepartition(jour.repartition);
  const roundTripped = JSON.parse(JSON.stringify(jour));
  const after = computePlannedTotalsFromRepartition(roundTripped.repartition);

  assert.deepEqual(after, before);
});

test('K — remaining counter accounts for all seven meals', () => {
  const jour = createEmptyJourData();
  jour.banque = { pro: '2', fec: '2', leg: '0', fru: '0', lai: '0', lip: '0', whey: '0' };
  // Distribute the whole bank, using the evening meal for part of it.
  jour.repartition[repIndex(0, 'pro')] = '1';
  jour.repartition[repIndex(6, 'pro')] = '1'; // completes protein via evening meal
  jour.repartition[repIndex(2, 'fec')] = '1';
  jour.repartition[repIndex(6, 'fec')] = '1'; // completes starch via evening meal

  const complete = evaluatePlanCompleteness({
    jourData: jour,
    targets: computeBanqueTotals(jour.banque),
  });
  assert.ok(
    !complete.warnings.some((e) => e.startsWith('Répartition partielle')),
    `evening-meal portions must satisfy the remaining counter: ${complete.errors.join('; ')}`,
  );

  // Removing the evening-meal portions must leave a remainder.
  const jour2 = createEmptyJourData();
  jour2.banque = { ...jour.banque };
  jour2.repartition[repIndex(0, 'pro')] = '1';
  jour2.repartition[repIndex(2, 'fec')] = '1';
  const incomplete = evaluatePlanCompleteness({
    jourData: jour2,
    targets: computeBanqueTotals(jour2.banque),
  });
  assert.ok(
    incomplete.warnings.some((e) => e.startsWith('Répartition partielle')),
    'missing evening-meal portions must be reported as remaining',
  );
  assert.equal(incomplete.canExport, true, 'an intentional partial distribution remains exportable');
});

test('P — macro percentages still total exactly 100% with the seventh meal', () => {
  const jour = createEmptyJourData();
  for (let m = 0; m < MEAL_COUNT; m += 1) {
    jour.repartition[repIndex(m, 'pro')] = '1';
    jour.repartition[repIndex(m, 'fec')] = '1';
    jour.repartition[repIndex(m, 'lip')] = '0.5';
  }
  const totals = computePlannedTotalsFromRepartition(jour.repartition);
  const pct = macroPercentagesFromGrams(totals.pro, totals.glu, totals.lip);
  assert.equal(pct.pro + pct.glu + pct.lip, 100);
});
