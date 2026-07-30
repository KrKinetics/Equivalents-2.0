/**
 * Global nutrition source-of-truth closure audit.
 * Usage: npm run nutrition:final-audit
 *
 * Exit code non-zero if any closure criterion fails.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { resolvePaths } from '../src/lib/paths.mjs';
import { auditFood, auditDataset } from '../src/lib/food-audit-core.mjs';
import {
  EXPECTED_CATEGORY_COUNTS,
  TOTAL_FOODS_EXPECTED,
  DISPLAY_CATEGORIES,
} from '../src/lib/nutrition-constants.mjs';
import { computeFoodsDataHash } from '../src/lib/data-hash.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'reports', 'nutrition-source-of-truth-final-audit');
const MFR_DIR = path.join(ROOT, 'src', 'sources', 'manufacturer');

const FORBIDDEN_PATH_GLOBS = [
  'generate.js',
  'i18n.js',
  'MOYENNES',
  'moyennes',
  'guide',
  '.pdf',
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function openErrorCodes(food) {
  return auditFood(food)
    .alerts.filter(
      (a) => a.severity === 'ERROR' && a.resolutionStatus !== 'resolved_documented'
    )
    .map((a) => a.code);
}

function hasVerifyTransaction(food) {
  const history = Array.isArray(food.history) ? food.history : [];
  return history.some(
    (entry) =>
      entry?.action === 'verify' &&
      entry?.transactionId &&
      String(entry.transactionId).trim() !== ''
  );
}

function manufacturerEvidencePaths() {
  if (!fs.existsSync(MFR_DIR)) return [];
  return fs
    .readdirSync(MFR_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(MFR_DIR, name));
}

function linkedManufacturerEvidenceIds() {
  const map = new Map();
  for (const filePath of manufacturerEvidencePaths()) {
    try {
      const evidence = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (evidence.linkedFoodId) {
        map.set(evidence.linkedFoodId, path.relative(ROOT, filePath).replaceAll('\\', '/'));
      }
    } catch {
      // ignore invalid evidence files; reported separately if needed
    }
  }
  return map;
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function writeCsv(filePath, headers, rows) {
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(',')),
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function checkForbiddenTreeChanges() {
  const result = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0 && result.status != null) {
    return {
      ok: true,
      notes: 'git diff unavailable; skipped calculator/PDF/MOYENNES dirty-tree check',
      files: [],
    };
  }
  const files = String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const hits = files.filter((file) =>
    FORBIDDEN_PATH_GLOBS.some((token) => file.toLowerCase().includes(token.toLowerCase()))
  );
  return {
    ok: hits.length === 0,
    notes:
      hits.length === 0
        ? 'No calculator / PDF guide / MOYENNES files dirty in working tree'
        : 'Forbidden path modifications detected',
    files: hits,
  };
}

function main() {
  const paths = resolvePaths();
  const payload = JSON.parse(fs.readFileSync(paths.foodDataPath, 'utf8'));
  const foods = payload.foods || [];
  const evidenceByFoodId = linkedManufacturerEvidenceIds();
  const failures = [];
  const notes = [];

  const categoryCounts = Object.fromEntries(DISPLAY_CATEGORIES.map((c) => [c, 0]));
  for (const food of foods) {
    if (categoryCounts[food.displayCategory] != null) {
      categoryCounts[food.displayCategory] += 1;
    }
  }

  const verifiedCount = foods.filter((f) => f.status === 'verified').length;
  const unverifiedCount = foods.filter((f) => f.status !== 'verified').length;
  const openErrors = [];
  for (const food of foods) {
    const codes = openErrorCodes(food);
    if (codes.length) {
      openErrors.push({
        id: food.id,
        displayCategory: food.displayCategory,
        status: food.status,
        codes,
      });
    }
  }

  if (foods.length !== TOTAL_FOODS_EXPECTED) {
    failures.push(`totalFoods ${foods.length} != expected ${TOTAL_FOODS_EXPECTED}`);
  }
  if (verifiedCount !== TOTAL_FOODS_EXPECTED) {
    failures.push(`verifiedCount ${verifiedCount} != expected ${TOTAL_FOODS_EXPECTED}`);
  }
  if (unverifiedCount !== 0) {
    failures.push(`unverifiedCount ${unverifiedCount} != 0`);
  }
  if (openErrors.length !== 0) {
    failures.push(`open ERROR foods: ${openErrors.length}`);
  }

  for (const [category, expected] of Object.entries(EXPECTED_CATEGORY_COUNTS)) {
    const actual = categoryCounts[category] || 0;
    if (actual !== expected) {
      failures.push(`category ${category}: ${actual} != expected ${expected}`);
    }
    if (actual === 0) failures.push(`category ${category} is empty`);
  }

  const ids = foods.map((f) => f.id);
  const duplicateIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (duplicateIds.length) {
    failures.push(`duplicate ids: ${duplicateIds.join(', ')}`);
  }

  const identityMap = new Map();
  for (const food of foods) {
    const key = `${food.names?.fr || ''}|${food.names?.en || ''}|${food.portion?.amount}|${food.portion?.unit}|${food.portion?.grams}`;
    if (!identityMap.has(key)) identityMap.set(key, []);
    identityMap.get(key).push(food.id);
  }
  const duplicateIdentities = [...identityMap.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ identityKey: key, foodIds: group }));
  if (duplicateIdentities.length) {
    failures.push(`exact duplicate identities: ${duplicateIdentities.length}`);
  }

  const sourceRecordMap = new Map();
  const missingSource = [];
  const missingVerifyTx = [];
  const missingCnfRecord = [];
  const missingManufacturerEvidence = [];
  const missingRequiredGrams = [];

  for (const food of foods) {
    if (!food.source || !food.source.type) missingSource.push(food.id);
    if (food.status === 'verified' && !hasVerifyTransaction(food)) {
      missingVerifyTx.push(food.id);
    }
    if (food.source?.type === 'canadian_nutrient_file') {
      if (!food.source.recordId) missingCnfRecord.push(food.id);
      const key = String(food.source.recordId);
      if (!sourceRecordMap.has(key)) sourceRecordMap.set(key, []);
      sourceRecordMap.get(key).push(food.id);
    }
    if (
      food.source?.type === 'manufacturer_website' ||
      food.source?.type === 'manufacturer_label'
    ) {
      if (!evidenceByFoodId.has(food.id)) missingManufacturerEvidence.push(food.id);
    }
    const unit = String(food.portion?.unit || '').toLowerCase();
    const gramsMissing =
      food.portion?.grams == null || !Number.isFinite(Number(food.portion.grams));
    // Pure volume RTDs (ml) may intentionally omit grams; scoop/g/count/slice/piece require weight.
    if (
      gramsMissing &&
      ['scoop', 'g', 'slice', 'piece', 'count', 'tbsp', 'tsp', 'wrap', 'wraps', 'bar', 'bars'].includes(
        unit
      )
    ) {
      missingRequiredGrams.push(food.id);
    }
  }

  if (missingSource.length) failures.push(`foods missing source: ${missingSource.length}`);
  if (missingVerifyTx.length) {
    failures.push(`verified foods missing verify transaction: ${missingVerifyTx.length}`);
  }
  if (missingCnfRecord.length) {
    failures.push(`CNF foods missing recordId: ${missingCnfRecord.length}`);
  }
  if (missingManufacturerEvidence.length) {
    failures.push(
      `manufacturer foods missing evidence file: ${missingManufacturerEvidence.length}`
    );
  }
  if (missingRequiredGrams.length) {
    failures.push(`foods missing required grams: ${missingRequiredGrams.length}`);
  }

  const duplicateSourceRecords = [...sourceRecordMap.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([recordId, foodIds]) => ({ recordId, foodIds }));
  // Shared CNF records can be intentional (distinct cards); report but do not fail alone.
  if (duplicateSourceRecords.length) {
    notes.push(
      `${duplicateSourceRecords.length} CNF recordId(s) shared by multiple food cards (documented; not automatically a failure)`
    );
  }

  const forbidden = checkForbiddenTreeChanges();
  if (!forbidden.ok) {
    failures.push(`forbidden path modifications: ${forbidden.files.join(', ')}`);
  }

  const datasetAudit = auditDataset(foods);
  const dataHash = computeFoodsDataHash(foods);

  const report = {
    generatedAt: new Date().toISOString(),
    ok: failures.length === 0,
    summary: {
      totalFoods: foods.length,
      expectedTotalFoods: TOTAL_FOODS_EXPECTED,
      verifiedFoods: verifiedCount,
      unverifiedFoods: unverifiedCount,
      openErrorFoods: openErrors.length,
      categoryCounts,
      expectedCategoryCounts: EXPECTED_CATEGORY_COUNTS,
      dataHash,
      datasetAudit: {
        foodsWithBlockingErrors: datasetAudit.summary?.foodsWithBlockingErrors ?? null,
        blockingErrorCount: datasetAudit.summary?.blockingErrorCount ?? null,
        foodsWithWarnings: datasetAudit.summary?.foodsWithWarnings ?? null,
      },
    },
    failures,
    notes,
    forbiddenPaths: forbidden,
    missingSource,
    missingVerifyTx,
    missingCnfRecord,
    missingManufacturerEvidence,
    missingRequiredGrams,
    duplicateIds,
    duplicateIdentities,
    duplicateSourceRecords,
    openErrors,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'final-ecosystem-audit.json'),
    `${JSON.stringify(report, null, 2)}\n`
  );

  writeCsv(
    path.join(OUT_DIR, 'category-counts.csv'),
    ['category', 'actual', 'expected', 'ok'],
    DISPLAY_CATEGORIES.map((category) => ({
      category,
      actual: categoryCounts[category] || 0,
      expected: EXPECTED_CATEGORY_COUNTS[category],
      ok: (categoryCounts[category] || 0) === EXPECTED_CATEGORY_COUNTS[category],
    }))
  );

  writeCsv(
    path.join(OUT_DIR, 'source-coverage.csv'),
    ['id', 'sourceType', 'recordId', 'url', 'manufacturerEvidence'],
    foods.map((food) => ({
      id: food.id,
      sourceType: food.source?.type || '',
      recordId: food.source?.recordId || '',
      url: food.source?.url || '',
      manufacturerEvidence: evidenceByFoodId.get(food.id) || '',
    }))
  );

  writeCsv(
    path.join(OUT_DIR, 'verification-coverage.csv'),
    ['id', 'status', 'hasVerifyTransaction', 'verifiedAt', 'verifiedBy', 'datasetVersion'],
    foods.map((food) => ({
      id: food.id,
      status: food.status,
      hasVerifyTransaction: hasVerifyTransaction(food),
      verifiedAt: food.verification?.verifiedAt || '',
      verifiedBy: food.verification?.verifiedBy || '',
      datasetVersion: food.verification?.datasetVersion || '',
    }))
  );

  fs.writeFileSync(
    path.join(OUT_DIR, 'open-errors.json'),
    `${JSON.stringify({ count: openErrors.length, foods: openErrors }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'duplicate-identities.json'),
    `${JSON.stringify({ count: duplicateIdentities.length, items: duplicateIdentities }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'duplicate-source-records.json'),
    `${JSON.stringify(
      { count: duplicateSourceRecords.length, items: duplicateSourceRecords, note: notes[0] || null },
      null,
      2
    )}\n`
  );

  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Audit final — source of truth nutritionnelle</title>
  <style>
    body { font-family: Georgia, serif; margin: 2rem; color: #1a1a1a; }
    .ok { color: #0a7a32; }
    .fail { color: #a11; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
    code { font-family: ui-monospace, Consolas, monospace; }
  </style>
</head>
<body>
  <h1>Audit final — validation nutritionnelle globale</h1>
  <p class="${report.ok ? 'ok' : 'fail'}"><strong>${report.ok ? 'VERT' : 'ÉCHEC'}</strong> — généré ${escapeHtml(report.generatedAt)}</p>
  <ul>
    <li>Aliments: ${foods.length} / ${TOTAL_FOODS_EXPECTED}</li>
    <li>Verified: ${verifiedCount}</li>
    <li>Unverified: ${unverifiedCount}</li>
    <li>ERROR ouvertes: ${openErrors.length}</li>
    <li>dataHash: <code>${escapeHtml(dataHash)}</code></li>
  </ul>
  <h2>Échecs</h2>
  ${
    failures.length
      ? `<ul>${failures.map((f) => `<li class="fail">${escapeHtml(f)}</li>`).join('')}</ul>`
      : '<p class="ok">Aucun échec.</p>'
  }
  <h2>Comptes par catégorie</h2>
  <table>
    <thead><tr><th>Catégorie</th><th>Actuel</th><th>Attendu</th></tr></thead>
    <tbody>
      ${DISPLAY_CATEGORIES.map(
        (c) =>
          `<tr><td>${escapeHtml(c)}</td><td>${categoryCounts[c] || 0}</td><td>${EXPECTED_CATEGORY_COUNTS[c]}</td></tr>`
      ).join('')}
    </tbody>
  </table>
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT_DIR, 'final-ecosystem-audit.html'), html);

  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        outDir: path.relative(ROOT, OUT_DIR).replaceAll('\\', '/'),
        summary: report.summary,
        failures,
      },
      null,
      2
    )
  );
  if (!report.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
