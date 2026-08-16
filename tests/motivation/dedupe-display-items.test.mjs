import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeDisplayItems, normalizeDisplayKey } from '../../src/coach/motivation/report/dedupe-display-items.mjs';

test('dedupeDisplayItems removes exact duplicates after trim and case fold', () => {
  const items = [
    'Définir ce que signifie « qualité » alimentaire.',
    '  définir ce que signifie « qualité » alimentaire.  ',
    'Définir ce que signifie « qualité » alimentaire.',
    'Clarifier l’objectif corporel.',
  ];
  assert.deepEqual(dedupeDisplayItems(items), [
    'Définir ce que signifie « qualité » alimentaire.',
    'Clarifier l’objectif corporel.',
  ]);
});

test('dedupeDisplayItems does not merge merely similar ideas', () => {
  const items = [
    'Définir ce que signifie « qualité » alimentaire.',
    'Définir la qualité des protéines.',
  ];
  assert.deepEqual(dedupeDisplayItems(items), items);
});

test('normalizeDisplayKey collapses spaces without changing meaning', () => {
  assert.equal(
    normalizeDisplayKey('  Qualité   alimentaire  '),
    'qualité alimentaire',
  );
});
