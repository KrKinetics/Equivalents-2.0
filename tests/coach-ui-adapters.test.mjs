import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import * as adapters from '../src/coach/ui/calculation-adapters.mjs';
import * as engine from '../src/lib/coach-calculator-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('UI adapters re-export exact-parity engine symbols', () => {
  const keys = [
    'CATS', 'MEAL_COUNT', 'MOYENNES', 'createEmptyJourData',
    'normalizeProteinesPct', 'normalizeMacroPct',
    'kcalFromMacros', 'macroPercentagesFromGrams', 'getPortionTotals',
    'computePlannedTotalsFromRepartition', 'isJourClientPlanConfigured',
    'roundHalf', 'distribuerPortions', 'scorePortions', 'suggestBanque',
  ];
  for (const key of keys) {
    assert.equal(adapters[key], engine[key], key);
  }
});

test('UI adapters module has no DOM or storage imports', () => {
  const source = fs.readFileSync(
    path.join(root, 'src/coach/ui/calculation-adapters.mjs'),
    'utf8',
  );
  assert.doesNotMatch(source, /\bdocument\b|\bwindow\b|\blocalStorage\b/);
});
