import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NUTRITION_WORKSPACE_CTA_LABEL,
  SERVICE_CHANGE_CONFIRMATION,
  SERVICE_GROUP_HEADINGS_FR,
  SERVICE_GROUP_ORDER,
  SERVICE_LABELS_FR,
  SERVICE_SELECT_PLACEHOLDER,
  SERVICE_TYPE_CODES,
  SERVICE_TYPES,
  clientHasNutritionAccess,
  clientHasProgrammingAccess,
  groupClientsByService,
  nutritionEligibleClients,
  parseServiceType,
  serviceLabelFr,
} from '../src/coach/domain/client-service-entitlements.mjs';

test('parseServiceType accepts only the three canonical codes', () => {
  assert.deepEqual(SERVICE_TYPE_CODES, ['nutrition', 'programming', 'complete']);
  assert.equal(parseServiceType('nutrition'), 'nutrition');
  assert.equal(parseServiceType('programming'), 'programming');
  assert.equal(parseServiceType('complete'), 'complete');
  assert.equal(parseServiceType(' nutrition '), 'nutrition');
  assert.equal(parseServiceType(null), null);
  assert.equal(parseServiceType(undefined), null);
  assert.equal(parseServiceType(''), null);
  assert.equal(parseServiceType('Structure alimentaire'), null);
  assert.equal(parseServiceType('NUTRITION'), null);
  assert.equal(parseServiceType('gold'), null);
  assert.equal(parseServiceType(1), null);
});

test('nutrition and programming access fail closed', () => {
  assert.equal(clientHasNutritionAccess('nutrition'), true);
  assert.equal(clientHasNutritionAccess('complete'), true);
  assert.equal(clientHasNutritionAccess('programming'), false);
  assert.equal(clientHasNutritionAccess(null), false);
  assert.equal(clientHasNutritionAccess('nope'), false);

  assert.equal(clientHasProgrammingAccess('programming'), true);
  assert.equal(clientHasProgrammingAccess('complete'), true);
  assert.equal(clientHasProgrammingAccess('nutrition'), false);
  assert.equal(clientHasProgrammingAccess(undefined), false);
  assert.equal(clientHasProgrammingAccess(''), false);
});

test('French labels and CTA copy are stable', () => {
  assert.equal(SERVICE_LABELS_FR.nutrition, 'Structure alimentaire');
  assert.equal(SERVICE_LABELS_FR.programming, 'Programmation');
  assert.equal(SERVICE_LABELS_FR.complete, 'Prise en charge complète');
  assert.equal(serviceLabelFr('nutrition'), 'Structure alimentaire');
  assert.equal(serviceLabelFr('bad'), '');
  assert.equal(NUTRITION_WORKSPACE_CTA_LABEL, 'Ouvrir la structure alimentaire');
  assert.equal(SERVICE_SELECT_PLACEHOLDER, 'Choisir le service');
  assert.match(
    SERVICE_CHANGE_CONFIRMATION,
    /Le changement de service modifiera les outils accessibles pour ce client\. Les données existantes ne seront pas supprimées\./,
  );
  assert.deepEqual(SERVICE_GROUP_ORDER, [
    SERVICE_TYPES.nutrition,
    SERVICE_TYPES.programming,
    SERVICE_TYPES.complete,
  ]);
  assert.equal(SERVICE_GROUP_HEADINGS_FR.nutrition, 'STRUCTURE ALIMENTAIRE');
  assert.equal(SERVICE_GROUP_HEADINGS_FR.programming, 'PROGRAMMATION');
  assert.equal(SERVICE_GROUP_HEADINGS_FR.complete, 'PRISE EN CHARGE COMPLÈTE');
});

test('groupClientsByService uses fixed order and alphabetical names', () => {
  const grouped = groupClientsByService([
    { id: '3', full_name: 'Zoé', service_type: 'nutrition' },
    { id: '1', full_name: 'alex', service_type: 'complete' },
    { id: '2', full_name: 'Béatrice', service_type: 'nutrition' },
    { id: '4', full_name: 'Marc', service_type: 'programming' },
    { id: '5', full_name: 'Ignored', service_type: 'gold' },
    { id: '6', full_name: 'No service' },
  ]);
  assert.deepEqual(Object.keys(grouped), ['nutrition', 'programming', 'complete']);
  assert.deepEqual(grouped.nutrition.map((row) => row.full_name), ['Béatrice', 'Zoé']);
  assert.deepEqual(grouped.programming.map((row) => row.full_name), ['Marc']);
  assert.deepEqual(grouped.complete.map((row) => row.full_name), ['alex']);
  assert.deepEqual(groupClientsByService(null), {
    nutrition: [],
    programming: [],
    complete: [],
  });
});

test('nutritionEligibleClients excludes programming-only rows', () => {
  const rows = [
    { id: 'n', full_name: 'N', service_type: 'nutrition' },
    { id: 'p', full_name: 'P', service_type: 'programming' },
    { id: 'c', full_name: 'C', service_type: 'complete' },
    { id: 'x', full_name: 'X', service_type: null },
  ];
  assert.deepEqual(
    nutritionEligibleClients(rows).map((row) => row.id),
    ['n', 'c'],
  );
  assert.deepEqual(nutritionEligibleClients(null), []);
});
