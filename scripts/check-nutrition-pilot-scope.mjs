/**
 * Enforce nutrition pilot scope against baseline or a candidate export.
 *
 * Usage:
 *   npm run pilot:check
 *   npm run pilot:check -- --candidate path/to/export.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  checkPilotBaseline,
  checkPilotCandidateScope,
  isPilotGuardActive,
} from '../src/lib/nutrition-pilot-scope.mjs';
import { resolvePaths } from '../src/lib/paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  let candidate = null;
  const idx = argv.indexOf('--candidate');
  if (idx >= 0) candidate = String(argv[idx + 1] || '').trim() || null;
  const eq = argv.find((arg) => arg.startsWith('--candidate='));
  if (eq) candidate = eq.slice('--candidate='.length).trim() || null;
  return { candidate };
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const { candidate } = parseArgs(process.argv.slice(2));
  const paths = resolvePaths();
  const configPath =
    process.env.NUTRITION_PILOT_CONFIG_PATH ||
    path.join(ROOT, 'src', 'data', 'nutrition-pilot-config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Pilot config missing: ${configPath}`);
  }
  const config = loadJson(configPath);
  if (!isPilotGuardActive(config) && config.status !== 'completed') {
    throw new Error(`Unknown pilot status: ${config.status}`);
  }
  if (config.status === 'completed') {
    console.log(`Pilot ${config.pilotId} is completed — scope guard skipped.`);
    return;
  }

  const base = loadJson(paths.foodDataPath);

  if (candidate) {
    const candidatePath = path.resolve(process.cwd(), candidate);
    if (!fs.existsSync(candidatePath)) {
      throw new Error(`Candidate file not found: ${candidatePath}`);
    }
    const candidatePayload = loadJson(candidatePath);
    const result = checkPilotCandidateScope(base, candidatePayload, config);
    if (!result.ok) {
      console.error(`pilot:check refused candidate ${candidatePath}`);
      for (const error of result.errors) console.error(` - ${error}`);
      if (result.changes.length) {
        console.error('Modified outside scope:');
        for (const change of result.changes) {
          console.error(` - ${change.id}: ${change.kinds.join(', ')}`);
        }
      }
      process.exitCode = 1;
      return;
    }
    console.log(
      `pilot:check ok — candidate stays within ${config.allowedFoodIds.length} pilot foods`
    );
    return;
  }

  const result = checkPilotBaseline(base, config);
  if (!result.ok) {
    console.error('pilot:check failed against baseline');
    for (const error of result.errors) console.error(` - ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        pilotId: config.pilotId,
        status: config.status,
        protectedFoodCount: result.actual.protectedFoodCount,
        protectedFoodsDataHash: result.actual.protectedFoodsDataHash,
        protectedFoodsNutritionHash: result.actual.protectedFoodsNutritionHash,
        datasetHash: result.actual.datasetHash,
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
