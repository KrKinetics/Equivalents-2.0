/**
 * Hash guards for release-candidate work. Protected files must not change.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Content hash normalized to LF so Windows checkouts match Linux CI. */
export function hashFileContent(text) {
  return crypto.createHash('sha256').update(String(text).replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

export function hashFile(absOrRelativePath) {
  const abs = path.isAbsolute(absOrRelativePath)
    ? absOrRelativePath
    : path.join(root, absOrRelativePath);
  return hashFileContent(fs.readFileSync(abs, 'utf8'));
}

/**
 * Authoritative protected paths for the hybrid D/A release candidate.
 * Nutrition values, identities, and production averages must remain untouched.
 */
export const PROTECTED_RC_FILES = Object.freeze([
  'src/data/food-equivalents.json',
  'src/data/nutrition-data-version.json',
  'src/data/category-mapping.json',
  'src/data/calculation-groups.json',
  'reports/exchange-profile-decision/exchange-rollup-proposal.json',
]);

/** Baseline captured at branch creation (HEAD c2ae53d / PR #11 merge). */
export const PROTECTED_RC_BASELINE = Object.freeze({
  'src/data/food-equivalents.json': 'b4125e985418701ed4d9e4d51a6c8bfdb0685030bbd1e729e9fb89cef6daa3d3',
  'src/data/nutrition-data-version.json': '5d2c0a04fe73b1b6d7c26307e1e3bbbe90ca733ad799ff0f0be079bb0ebb09c5',
  'src/data/category-mapping.json': 'efe4dcb4ffa304dbb3ac735b92c5602f4eb30452206c8afb521db598f743776c',
  'src/data/calculation-groups.json': 'ec10ef42e64d1c260c3bf3d4e1d9a4e59ce8f8c0b26e9b37c065451a89a2f131',
  'reports/exchange-profile-decision/exchange-rollup-proposal.json': '1e4b0c7da55ff52d504e75ab88100880b70f18497ff774b46d0aa6cba1a81c0f',
});

export function collectProtectedHashes(baseline = PROTECTED_RC_BASELINE) {
  const before = { ...baseline };
  const after = {};
  for (const file of Object.keys(baseline)) {
    after[file] = hashFile(file);
  }
  return { before, after };
}

/**
 * Returns a protection report. Fails (ok:false) if any protected file drifted.
 */
export function verifyProtectedFiles(baseline = PROTECTED_RC_BASELINE, { generatedAt = null } = {}) {
  const { before, after } = collectProtectedHashes(baseline);
  const changed = [];
  for (const file of Object.keys(baseline)) {
    if (before[file] !== after[file]) {
      changed.push({ file, before: before[file], after: after[file] });
    }
  }
  return {
    ok: changed.length === 0,
    generatedAt: generatedAt || 'deterministic:release-candidate',
    protectedFileCount: Object.keys(baseline).length,
    changed,
    before,
    after,
    note: 'Individual nutrients, portions, identities, verification transactions, legacy A MOYENNES, and rollup proposal assignments must remain unchanged.',
  };
}

export function assertProtectedFilesUnchanged(baseline = PROTECTED_RC_BASELINE, options = {}) {
  const report = verifyProtectedFiles(baseline, options);
  if (!report.ok) {
    const detail = report.changed.map((row) => `${row.file}: ${row.before} → ${row.after}`).join('; ');
    throw new Error(`Protected file mutation detected: ${detail}`);
  }
  return report;
}
