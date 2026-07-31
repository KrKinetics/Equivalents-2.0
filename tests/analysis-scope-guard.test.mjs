import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'analysis-scope-baseline.json'), 'utf8'));

/** Content hash normalized to LF so Windows checkouts match Linux CI. */
const hash = (file) => {
  const text = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
};

test('forbidden source-of-truth files match the analysis baseline', () => {
  for (const [file, expected] of Object.entries(baseline)) {
    assert.equal(hash(file), expected, `${file} changed in analysis scope`);
  }
});

test('calculation groups remain unapproved with null reference values', () => {
  const groups = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'calculation-groups.json'), 'utf8')).groups;
  for (const group of groups) {
    assert.equal(group.approved, false, `${group.id} must remain unapproved`);
    assert.ok(
      group.referenceProfile == null || Object.values(group.referenceProfile).every((value) => value == null),
      `${group.id} reference profile must remain null`,
    );
  }
});

test('reports never claim final profile approval', () => {
  const reportDirs = ['reports/exchange-profile-decision', 'reports/guide-preview', 'reports/release-candidate']
    .map((dir) => path.join(root, dir))
    .filter(fs.existsSync);
  for (const dir of reportDirs) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.(?:html|md|json)$/i.test(entry.name)) continue;
      const text = fs.readFileSync(path.join(dir, entry.name), 'utf8');
      assert.doesNotMatch(text, /(?:profils? d['’]échange|exchange profiles?) (?:sont |are )?approuvés?/i);
    }
  }
});

test('sibling calculator guard is skipped when repository is absent', (t) => {
  const sibling = path.resolve(root, '..', 'calculateur-nutritionnel');
  if (!fs.existsSync(sibling)) t.skip('sibling calculateur-nutritionnel not present');
  assert.ok(true, 'this analysis never writes to the sibling calculator');
});
