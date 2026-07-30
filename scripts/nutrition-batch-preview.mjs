/**
 * Preview an approved nutrition batch.
 * Usage: npm run nutrition:batch:preview -- path/to/batch.json
 */
import fs from 'fs';
import path from 'path';
import { previewApprovedBatch } from '../src/lib/nutrition-batch-engine.mjs';
import { resolvePaths } from '../src/lib/paths.mjs';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function resolveCurrentPayload(paths, batch) {
  const live = JSON.parse(fs.readFileSync(paths.foodDataPath, 'utf8'));
  if (live.foods.length === Number(batch?.scope?.existingFoodCount)) return live;
  const snap = path.join(paths.reportsDir, 'batches', batch.batchId, 'pre-apply-payload.json');
  if (fs.existsSync(snap)) return JSON.parse(fs.readFileSync(snap, 'utf8'));
  return live;
}

function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: nutrition:batch:preview -- path/to/batch.json');
  const batchPath = path.resolve(process.cwd(), input);
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  const paths = resolvePaths();
  const current = resolveCurrentPayload(paths, batch);
  const preview = previewApprovedBatch(batch, current);
  if (!preview.ok) {
    console.error('Preview failed:');
    for (const error of preview.errors) console.error(` - ${error}`);
    process.exitCode = 1;
    return;
  }

  const outDir = path.join(paths.reportsDir, 'batches', batch.batchId);
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'preview.json');
  const htmlPath = path.join(outDir, 'preview.html');
  const csvPath = path.join(outDir, 'preview.csv');

  const serializable = {
    batchId: batch.batchId,
    generatedAt: new Date().toISOString(),
    foods: preview.foods.map((row) => ({
      id: row.id,
      operation: row.operation,
      identity: row.identity,
      recordId: row.recordId,
      source: row.source,
      conversion: row.conversion,
      selection: row.selection
        ? {
            selected: row.selection.selected,
            candidates: (row.selection.candidates || []).slice(0, 10),
            message: row.selection.message,
          }
        : null,
      beforeNutrients: row.before?.nutrients || null,
      afterNutrients: row.after?.nutrients || null,
      beforePortion: row.before?.portion || null,
      afterPortion: row.after?.portion || null,
      alertsBefore: row.alertsBefore,
      alertsAfter: row.alertsAfter,
      projectedCanVerify: row.projectedCanVerify,
    })),
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(serializable, null, 2)}\n`, 'utf8');

  const csvLines = [
    'id,operation,recordId,beforeKcal,afterKcal,beforeProtein,afterProtein,projectedCanVerify',
  ];
  for (const row of serializable.foods) {
    csvLines.push(
      [
        row.id,
        row.operation,
        row.recordId,
        row.beforeNutrients?.declaredKcal ?? '',
        row.afterNutrients?.declaredKcal ?? '',
        row.beforeNutrients?.proteinG ?? '',
        row.afterNutrients?.proteinG ?? '',
        row.projectedCanVerify,
      ].join(',')
    );
  }
  fs.writeFileSync(csvPath, `${csvLines.join('\n')}\n`, 'utf8');

  const cards = serializable.foods
    .map(
      (row) => `<article class="food">
  <h2>${esc(row.id)}</h2>
  <p><strong>${esc(row.operation)}</strong> · record ${esc(row.recordId)}</p>
  <p>${esc(row.identity?.fr)} / ${esc(row.identity?.en)}</p>
  <pre>${esc(JSON.stringify({ before: row.beforeNutrients, after: row.afterNutrients, conversion: row.conversion }, null, 2))}</pre>
</article>`
    )
    .join('\n');
  fs.writeFileSync(
    htmlPath,
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Preview ${esc(batch.batchId)}</title>
<style>body{font:15px/1.45 system-ui;margin:24px;background:#f6f6f3;color:#222} .food{background:#fff;border:1px solid #ddd;border-radius:8px;padding:16px;margin:16px 0} pre{white-space:pre-wrap}</style>
</head><body><h1>Preview ${esc(batch.batchId)}</h1>${cards}</body></html>`,
    'utf8'
  );

  console.log(
    JSON.stringify(
      { ok: true, jsonPath, htmlPath, csvPath, foodCount: serializable.foods.length },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
