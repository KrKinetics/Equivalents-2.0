/**
 * Validate an approved nutrition batch JSON.
 * Usage: npm run nutrition:batch:validate -- path/to/batch.json
 *
 * If the batch is already applied and a pre-apply snapshot exists, that
 * snapshot is used so historical lots remain re-validatable.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateApprovedBatch } from '../src/lib/nutrition-batch-engine.mjs';
import { resolvePaths } from '../src/lib/paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolveCurrentPayload(paths, batch) {
  const live = JSON.parse(fs.readFileSync(paths.foodDataPath, 'utf8'));
  if (live.foods.length === Number(batch?.scope?.existingFoodCount)) return live;
  const snap = path.join(paths.reportsDir, 'batches', batch.batchId, 'pre-apply-payload.json');
  if (fs.existsSync(snap)) return JSON.parse(fs.readFileSync(snap, 'utf8'));
  return live;
}

function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: nutrition:batch:validate -- path/to/batch.json');
  const batchPath = path.resolve(process.cwd(), input);
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  const paths = resolvePaths();
  const current = resolveCurrentPayload(paths, batch);
  const pilotConfig = fs.existsSync(paths.nutritionPilotConfigPath)
    ? JSON.parse(fs.readFileSync(paths.nutritionPilotConfigPath, 'utf8'))
    : null;
  const result = validateApprovedBatch(batch, current, { pilotConfig });
  if (!result.ok) {
    console.error('Batch validation failed:');
    for (const error of result.errors) console.error(` - ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        batchId: batch.batchId,
        foods: result.resolved.map((row) => ({
          id: row.entry.id,
          operation: row.entry.operation,
          adapter: row.result.adapter,
          recordId: row.result.source.recordId,
          nutrients: row.result.nutrients,
        })),
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
