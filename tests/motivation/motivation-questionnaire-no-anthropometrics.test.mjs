import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FORBIDDEN = [
  'age_years',
  'height_unit',
  'height_feet',
  'height_inches',
  'height_cm',
  'weight_lb',
];

test('motivation questionnaire never re-asks intake anthropometrics', () => {
  const files = [
    'coach-portal/motivation.html',
    'coach-portal/assets/motivation.js',
    'src/coach/motivation/client/official-bundle.mjs',
    'src/coach/motivation/client/public-questionnaire.mjs',
    'src/coach/motivation/questionnaire/seed-questions-v42.mjs',
    'src/coach/motivation/questionnaire/seed-questions-v43.mjs',
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8');
    for (const key of FORBIDDEN) {
      assert.equal(src.includes(key), false, `${rel} must not contain ${key}`);
    }
  }
});
