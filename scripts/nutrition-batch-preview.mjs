/**
 * Preview an approved nutrition batch and write rich reports.
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

function writeArtifactReports(outDir, batch, preview) {
  const sourceSelections = {
    batchId: batch.batchId,
    generatedAt: new Date().toISOString(),
    selections: preview.foods.map((row) => ({
      foodId: row.id,
      operation: row.operation,
      expectedRecordId: row.expectedRecordId,
      selectedRecordId: row.selectedRecordId,
      descriptionEn: row.cnfDescription?.en || null,
      descriptionFr: row.cnfDescription?.fr || null,
    })),
  };
  const conversions = {
    batchId: batch.batchId,
    foods: preview.foods.map((row) => ({
      id: row.id,
      formula: row.conversion?.formula || null,
      sourcePer100g: row.conversion?.sourcePer100g || null,
      derivedUnrounded: row.conversion?.derivedUnrounded || null,
      storedRounded: row.conversion?.storedRounded || row.after?.nutrients || null,
    })),
  };
  const resolutions = {
    batchId: batch.batchId,
    foods: preview.foods.map((row) => ({
      id: row.id,
      resolutions: row.projectedResolutions || row.after?.auditResolutions || [],
      alertsAfter: (row.alertsAfter || []).map((a) => ({
        code: a.code,
        severity: a.severity,
        resolutionStatus: a.resolutionStatus,
      })),
    })),
  };

  fs.writeFileSync(path.join(outDir, 'source-selections.json'), `${JSON.stringify(sourceSelections, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'conversions.json'), `${JSON.stringify(conversions, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'resolutions.json'), `${JSON.stringify(resolutions, null, 2)}\n`);
  if (preview.scopeBaseline) {
    fs.writeFileSync(
      path.join(outDir, 'scope-baseline.json'),
      `${JSON.stringify(preview.scopeBaseline, null, 2)}\n`
    );
  }
  if (preview.scopeCheck) {
    fs.writeFileSync(
      path.join(outDir, 'scope-check-final.json'),
      `${JSON.stringify(preview.scopeCheck, null, 2)}\n`
    );
  }
}

function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: nutrition:batch:preview -- path/to/batch.json');
  const batchPath = path.resolve(process.cwd(), input);
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  const paths = resolvePaths();
  const current = resolveCurrentPayload(paths, batch);
  const preview = previewApprovedBatch(batch, current);
  const outDir = path.join(paths.reportsDir, 'batches', batch.batchId);
  fs.mkdirSync(outDir, { recursive: true });

  if (!preview.ok) {
    if (preview.scopeBaseline) {
      fs.writeFileSync(
        path.join(outDir, 'scope-baseline.json'),
        `${JSON.stringify(preview.scopeBaseline, null, 2)}\n`
      );
    }
    console.error('Preview failed:');
    for (const error of preview.errors) console.error(` - ${error}`);
    process.exitCode = 1;
    return;
  }

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
      expectedRecordId: row.expectedRecordId,
      selectedRecordId: row.selectedRecordId,
      recordId: row.recordId,
      cnfDescription: row.cnfDescription,
      source: row.source,
      conversion: row.conversion,
      selection: row.selection
        ? {
            expectedRecordId: row.selection.expectedRecordId,
            selectedRecordId: row.selection.selectedRecordId,
            selected: row.selection.selected,
            candidates: (row.selection.candidates || []).slice(0, 10),
            message: row.selection.message,
            code: row.selection.code,
          }
        : null,
      beforeNutrients: row.before?.nutrients || null,
      afterNutrients: row.after?.nutrients || null,
      beforePortion: row.before?.portion || null,
      afterPortion: row.after?.portion || null,
      alertsBefore: row.alertsBefore,
      alertsAfter: row.alertsAfter,
      projectedCanVerify: row.projectedCanVerify,
      projectedResolutions: row.projectedResolutions,
    })),
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(serializable, null, 2)}\n`, 'utf8');
  writeArtifactReports(outDir, batch, preview);

  const csvLines = [
    'id,operation,expectedRecordId,selectedRecordId,beforeKcal,afterKcal,beforeProtein,afterProtein,projectedCanVerify',
  ];
  for (const row of serializable.foods) {
    csvLines.push(
      [
        row.id,
        row.operation,
        row.expectedRecordId ?? '',
        row.selectedRecordId ?? '',
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
  <p><strong>${esc(row.operation)}</strong> · expected ${esc(row.expectedRecordId)} · selected ${esc(row.selectedRecordId)}</p>
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
      {
        ok: true,
        jsonPath,
        htmlPath,
        csvPath,
        foodCount: serializable.foods.length,
        protectedFoodCount: preview.scopeBaseline?.protectedFoodCount,
      },
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
