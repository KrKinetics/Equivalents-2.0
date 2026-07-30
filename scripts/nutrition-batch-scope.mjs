/**
 * Capture or verify generic batch scope for an approved nutrition batch.
 * Usage: npm run nutrition:batch:scope -- path/to/batch.json
 */
import fs from 'fs';
import path from 'path';
import { resolvePaths } from '../src/lib/paths.mjs';
import {
  buildBatchScopeBaseline,
  checkBatchScope,
} from '../src/lib/nutrition-batch-scope.mjs';
import { applyApprovedBatch } from '../src/lib/nutrition-batch-engine.mjs';

function resolveCurrentPayload(paths, batch) {
  const live = JSON.parse(fs.readFileSync(paths.foodDataPath, 'utf8'));
  if (live.foods.length === Number(batch?.scope?.existingFoodCount)) return live;
  const snap = path.join(paths.reportsDir, 'batches', batch.batchId, 'pre-apply-payload.json');
  if (fs.existsSync(snap)) return JSON.parse(fs.readFileSync(snap, 'utf8'));
  return live;
}

function main() {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: nutrition:batch:scope -- path/to/batch.json');
  const batchPath = path.resolve(process.cwd(), input);
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  const paths = resolvePaths();
  const current = resolveCurrentPayload(paths, batch);
  const outDir = path.join(paths.reportsDir, 'batches', batch.batchId);
  fs.mkdirSync(outDir, { recursive: true });

  const baseline = buildBatchScopeBaseline(current, batch);
  const baselinePath = path.join(outDir, 'scope-baseline.json');
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);

  // Project final state via dry apply in memory when possible.
  const projected = applyApprovedBatch(batch, current, { datasetVersion: 'scope-check' });
  const candidate = projected.ok ? projected.payload : current;
  const scopeCheck = checkBatchScope(baseline, candidate, batch);
  const finalPath = path.join(outDir, 'scope-check-final.json');
  fs.writeFileSync(
    finalPath,
    `${JSON.stringify(
      {
        ...scopeCheck,
        projectedOk: projected.ok,
        projectionErrors: projected.ok ? [] : projected.errors,
      },
      null,
      2
    )}\n`
  );

  console.log(
    JSON.stringify(
      {
        ok: projected.ok && scopeCheck.ok,
        baselinePath,
        finalPath,
        protectedFoodCount: baseline.protectedFoodCount,
        protectedFoodsDataHash: baseline.protectedFoodsDataHash,
        scopeCheck,
      },
      null,
      2
    )
  );
  if (!(projected.ok && scopeCheck.ok)) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
