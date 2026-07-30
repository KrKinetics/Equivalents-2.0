/**
 * Apply an approved nutrition batch (dry-run or real).
 * Usage:
 *   npm run nutrition:batch:apply -- --dry-run path/to/batch.json
 *   npm run nutrition:batch:apply -- path/to/batch.json
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { backupFile } from '../src/lib/backup.mjs';
import { writeTwoFilesAtomically } from '../src/lib/atomic-write.mjs';
import { computeFoodsDataHash, shortHash } from '../src/lib/data-hash.mjs';
import { applyApprovedBatch } from '../src/lib/nutrition-batch-engine.mjs';
import { resolvePaths } from '../src/lib/paths.mjs';
import { validateFoodEquivalentsPayload } from '../src/lib/schema-validate.mjs';

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const positional = argv.filter((arg) => arg !== '--dry-run');
  if (positional.length !== 1) {
    throw new Error(
      'Usage: npm run nutrition:batch:apply -- [--dry-run] path/to/batch.json'
    );
  }
  return { dryRun, input: positional[0] };
}

function main() {
  const { dryRun, input } = parseArgs(process.argv.slice(2));
  const paths = resolvePaths();
  const batchPath = path.resolve(process.cwd(), input);
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  const current = JSON.parse(fs.readFileSync(paths.foodDataPath, 'utf8'));
  const pilotConfig = fs.existsSync(paths.nutritionPilotConfigPath)
    ? JSON.parse(fs.readFileSync(paths.nutritionPilotConfigPath, 'utf8'))
    : null;

  const version = JSON.parse(fs.readFileSync(paths.versionDataPath, 'utf8'));
  const result = applyApprovedBatch(batch, current, {
    pilotConfig,
    datasetVersion: version.version || '0.0.0',
  });
  if (!result.ok) {
    console.error('Batch apply refused:');
    for (const error of result.errors) console.error(` - ${error}`);
    process.exitCode = 1;
    return;
  }

  const validation = validateFoodEquivalentsPayload(result.payload);
  if (!validation.ok) {
    console.error('Resulting payload failed food schema validation:');
    for (const error of validation.errors.slice(0, 30)) {
      console.error(` - ${error.path}: ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const outDir = path.join(paths.reportsDir, 'batches', batch.batchId);
  fs.mkdirSync(outDir, { recursive: true });
  const report = {
    batchId: batch.batchId,
    dryRun,
    appliedAt: new Date().toISOString(),
    applied: result.applied,
    dataHash: result.dataHash,
    foodCount: result.payload.foods.length,
  };
  fs.writeFileSync(path.join(outDir, 'apply-report.json'), `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        foodCount: result.payload.foods.length,
        dataHash: result.dataHash,
        applied: result.applied,
      },
      null,
      2
    )
  );

  if (dryRun) {
    console.log('Dry run complete — no production files written.');
    return;
  }

  fs.writeFileSync(
    path.join(outDir, 'pre-apply-payload.json'),
    `${JSON.stringify(current, null, 2)}\n`
  );

  const foodBackup = backupFile(paths.foodDataPath, paths.backupsDir, 'pre-batch-apply');
  const versionBackup = backupFile(paths.versionDataPath, paths.backupsDir, 'pre-batch-apply');

  result.payload.meta = result.payload.meta || {};
  result.payload.meta.baseDataHash = result.dataHash;
  result.payload.meta.exportDataHash = result.dataHash;
  result.payload.meta.lastAppliedAt = new Date().toISOString();
  result.payload.meta.totalFoods = result.payload.foods.length;

  const nextVersion = {
    ...version,
    dataHash: result.dataHash,
    shortHash: shortHash(result.dataHash),
    totalFoods: result.payload.foods.length,
    verifiedFoods: result.payload.foods.filter((f) => f.status === 'verified').length,
    status: version.status || 'review',
  };

  writeTwoFilesAtomically({
    firstTarget: paths.foodDataPath,
    firstContent: `${JSON.stringify(result.payload, null, 2)}\n`,
    firstBackup: foodBackup,
    firstExisted: true,
    secondTarget: paths.versionDataPath,
    secondContent: `${JSON.stringify(nextVersion, null, 2)}\n`,
    secondBackup: versionBackup,
    secondExisted: true,
  });

  const audit = spawnSync(process.execPath, [paths.auditScriptPath], {
    cwd: paths.root,
    env: process.env,
    encoding: 'utf8',
  });
  process.stdout.write(audit.stdout || '');
  process.stderr.write(audit.stderr || '');
  if (audit.status !== 0) {
    throw new Error('Post-apply audit failed');
  }

  const scope = spawnSync(process.execPath, [path.join(paths.root, 'scripts', 'check-nutrition-pilot-scope.mjs')], {
    cwd: paths.root,
    env: process.env,
    encoding: 'utf8',
  });
  process.stdout.write(scope.stdout || '');
  process.stderr.write(scope.stderr || '');
  if (scope.status !== 0) {
    throw new Error('Post-apply pilot:check failed');
  }

  fs.writeFileSync(
    path.join(outDir, 'source-selections.json'),
    `${JSON.stringify(
      {
        batchId: batch.batchId,
        selected: result.applied,
      },
      null,
      2
    )}\n`
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
