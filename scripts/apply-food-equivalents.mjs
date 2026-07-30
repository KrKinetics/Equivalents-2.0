/**
 * Apply a corrected food-equivalents JSON exported from the review UI.
 * Never reimports generate.js / i18n.js.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { backupFile } from '../src/lib/backup.mjs';
import { computeFoodsDataHash, shortHash } from '../src/lib/data-hash.mjs';
import { auditDataset } from '../src/lib/food-audit-core.mjs';
import { getFoodStatus } from '../src/lib/food-status.mjs';
import { resolvePaths } from '../src/lib/paths.mjs';
import { validateFoodEquivalentsPayload } from '../src/lib/schema-validate.mjs';

const STRUCTURAL_AUDIT_CODES = new Set([
  'MISSING_ID',
  'DUPLICATE_ID',
  'STATUS_MISMATCH',
  'MISSING_FR_NAME',
  'MISSING_EN_NAME',
  'MISSING_PORTION_FR',
  'MISSING_PORTION_EN',
  'MISSING_AMOUNT_UNIT',
  'INVALID_UNIT',
  'INVALID_CATEGORY',
  'INVALID_GROUP',
  'INVALID_STATUS',
]);

function usage() {
  throw new Error(
    'Usage: npm run data:apply -- [--dry-run] path/to/food-equivalents.corrected.json'
  );
}

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const positional = argv.filter((arg) => arg !== '--dry-run');
  if (positional.length !== 1) usage();
  return { dryRun, input: positional[0] };
}

function restoreFile(backupPath, filePath, existedBefore) {
  if (backupPath) {
    fs.copyFileSync(backupPath, filePath);
  } else if (!existedBefore && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function replaceAtomically(tempPath, targetPath, backupPath) {
  try {
    fs.renameSync(tempPath, targetPath);
  } catch (error) {
    if (!['EEXIST', 'EPERM', 'EACCES'].includes(error.code) || !fs.existsSync(targetPath)) {
      throw error;
    }

    fs.unlinkSync(targetPath);
    try {
      fs.renameSync(tempPath, targetPath);
    } catch (replaceError) {
      if (backupPath) fs.copyFileSync(backupPath, targetPath);
      throw replaceError;
    }
  }
}

function main() {
  const { dryRun, input } = parseArgs(process.argv.slice(2));
  const paths = resolvePaths();
  const target = paths.foodDataPath;
  const versionPath = paths.versionDataPath;
  const tempPath = path.join(path.dirname(target), 'food-equivalents.json.tmp');
  const inputPath = path.resolve(process.cwd(), input);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`);
  }

  const incoming = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const validation = validateFoodEquivalentsPayload(incoming);
  if (!validation.ok) {
    const details = validation.errors
      .slice(0, 50)
      .map((error) => ` - ${error.path}: ${error.message}`)
      .join('\n');
    const remainder =
      validation.errors.length > 50 ? `\n ... +${validation.errors.length - 50} more` : '';
    throw new Error(`Invalid JSON — apply aborted:\n${details}${remainder}`);
  }

  if (fs.existsSync(target)) {
    const current = JSON.parse(fs.readFileSync(target, 'utf8'));
    const curIds = new Set((current.foods || []).map((f) => f.id));
    const newIds = new Set((incoming.foods || []).map((f) => f.id));
    const missingIds = [...curIds].filter((id) => !newIds.has(id));
    if (missingIds.length) {
      throw new Error(`Apply refused: missing existing id(s): ${missingIds.join(', ')}`);
    }
  }

  const audited = auditDataset(incoming.foods);
  const structuralAuditErrors = audited.items.flatMap((item) =>
    item.alerts
      .filter(
        (alert) => alert.severity === 'ERROR' && STRUCTURAL_AUDIT_CODES.has(alert.code)
      )
      .map((alert) => ({ id: item.id, code: alert.code, message: alert.message }))
  );
  console.log(
    JSON.stringify(
      {
        validation: { ok: true, errorCount: 0 },
        audit: audited.summary,
        structuralAuditErrors,
      },
      null,
      2
    )
  );
  if (structuralAuditErrors.length > 0) {
    throw new Error(
      `Apply refused: ${structuralAuditErrors.length} structural audit error(s) remain.`
    );
  }
  if (dryRun) {
    console.log('Dry run complete — no files written.');
    return;
  }

  incoming.meta = incoming.meta || {};
  incoming.meta.totalFoods = incoming.foods.length;
  incoming.meta.lastAppliedAt = new Date().toISOString();
  incoming.meta.schemaVersion = incoming.meta.schemaVersion || 2;

  const hash = computeFoodsDataHash(incoming.foods);
  const now = new Date().toISOString();
  let version = {
    version: '1.0.0',
    status: 'draft',
    createdAt: now,
    approvedAt: null,
    approvedBy: null,
    previousVersion: null,
    changeSummary: 'Applied corrected dataset via data:apply',
  };
  if (fs.existsSync(versionPath)) {
    version = { ...version, ...JSON.parse(fs.readFileSync(versionPath, 'utf8')) };
  }
  const hashChanged = version.dataHash !== hash;
  if (version.status === 'approved' && hashChanged) {
    version.previousVersion = version.version;
    version.status = 'review';
    version.approvedAt = null;
    version.approvedBy = null;
    version.changeSummary = 'Dataset modified after approval — returned to review';
  }
  version.dataHash = hash;
  version.shortHash = shortHash(hash);
  if (hashChanged) version.lastModifiedAt = now;
  version.totalFoods = incoming.foods.length;
  version.verifiedFoods = incoming.foods.filter((food) => getFoodStatus(food) === 'verified').length;
  version.unverifiedFoods = version.totalFoods - version.verifiedFoods;

  const targetExisted = fs.existsSync(target);
  const versionExisted = fs.existsSync(versionPath);
  let foodBackup = null;
  let versionBackup = null;
  let backupStarted = false;

  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.mkdirSync(path.dirname(versionPath), { recursive: true });
    fs.writeFileSync(tempPath, JSON.stringify(incoming, null, 2), 'utf8');

    if (targetExisted) {
      foodBackup = backupFile(target, paths.backupsDir, 'pre-apply');
      backupStarted = true;
      console.log('Food backup created:', foodBackup);
    }
    if (versionExisted) {
      versionBackup = backupFile(versionPath, paths.backupsDir, 'pre-apply');
      backupStarted = true;
      console.log('Version backup created:', versionBackup);
    }
    backupStarted = true;

    replaceAtomically(tempPath, target, foodBackup);
    fs.writeFileSync(versionPath, JSON.stringify(version, null, 2), 'utf8');

    console.log('Applied:', inputPath, '→', target);
    console.log('dataHash:', shortHash(hash));

    const audit = spawnSync(
      process.execPath,
      [path.join(paths.root, 'scripts', 'audit-food-equivalents.mjs')],
      {
        stdio: 'inherit',
        cwd: paths.root,
        env: process.env,
      }
    );
    if (audit.error) throw audit.error;
    if (audit.status !== 0) {
      throw new Error(`Audit failed with exit code ${audit.status ?? 'unknown'}`);
    }
  } catch (error) {
    if (backupStarted) {
      restoreFile(foodBackup, target, targetExisted);
      restoreFile(versionBackup, versionPath, versionExisted);
    }
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw error;
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
