/**
 * Apply a corrected food-equivalents JSON exported from the review UI.
 * Never reimports generate.js / i18n.js.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { backupFile } from '../src/lib/backup.mjs';
import { restoreFile, writeTwoFilesAtomically } from '../src/lib/atomic-write.mjs';
import { computeFoodsDataHash, shortHash } from '../src/lib/data-hash.mjs';
import { assertApplyGovernance } from '../src/lib/dataset-governance.mjs';
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
  'INVALID_NUMERIC_TYPE',
  'NON_FINITE_VALUE',
  'VERIFICATION_DATE_MISSING',
  'VERIFICATION_DATE_INVALID',
  'VERIFICATION_REVIEWER_MISSING',
  'VERIFICATION_DATASET_VERSION_MISSING',
  'VERIFICATION_HISTORY_MISSING',
  'VERIFICATION_HISTORY_MISMATCH',
]);

function usage() {
  throw new Error(
    'Usage: npm run data:apply -- [--dry-run] [--allow-stale --reason "…"] [--migration-documented] path/to/food-equivalents.corrected.json'
  );
}

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const allowStale = argv.includes('--allow-stale');
  const migrationDocumented = argv.includes('--migration-documented');
  let staleReason = '';
  const reasonEq = argv.find((arg) => arg.startsWith('--reason='));
  if (reasonEq) staleReason = reasonEq.slice('--reason='.length).trim();
  const reasonIdx = argv.indexOf('--reason');
  if (reasonIdx >= 0) staleReason = String(argv[reasonIdx + 1] || '').trim();

  const positional = argv.filter((arg, i) => {
    if (arg === '--dry-run' || arg === '--allow-stale' || arg === '--migration-documented') {
      return false;
    }
    if (arg === '--reason' || arg.startsWith('--reason=')) return false;
    if (reasonIdx >= 0 && i === reasonIdx + 1) return false;
    return true;
  });
  if (positional.length !== 1) usage();
  return { dryRun, allowStale, staleReason, migrationDocumented, input: positional[0] };
}

function main() {
  const { dryRun, allowStale, staleReason, migrationDocumented, input } = parseArgs(
    process.argv.slice(2)
  );
  const paths = resolvePaths();
  const target = paths.foodDataPath;
  const versionPath = paths.versionDataPath;
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

    const governance = assertApplyGovernance(current, incoming, {
      allowStale,
      staleReason,
      migrationDocumented,
    });
    if (!governance.ok) {
      console.error('Apply refused (gouvernance):');
      for (const err of governance.errors) console.error(` - ${err}`);
      if (!allowStale) {
        console.error(
          'Note: --force n’est pas proposé pour un export périmé. Utilisez --allow-stale --reason "…" si nécessaire.'
        );
      }
      throw new Error(`Apply refused: ${governance.errors.length} governance error(s).`);
    }
    for (const warning of governance.warnings) {
      console.warn(`WARNING: ${warning}`);
    }
    if (allowStale) {
      incoming.meta = incoming.meta || {};
      incoming.meta.allowStaleReason = staleReason;
    }
  }

  const audited = auditDataset(incoming.foods);
  const structuralAuditErrors = audited.items.flatMap((item) =>
    item.alerts
      .filter((alert) => alert.severity === 'ERROR' && STRUCTURAL_AUDIT_CODES.has(alert.code))
      .map((alert) => ({ id: item.id, code: alert.code, message: alert.message }))
  );
  console.log(
    JSON.stringify(
      {
        validation: { ok: true, errorCount: 0 },
        audit: audited.summary,
        structuralAuditErrors,
        staleOverride: allowStale ? { reason: staleReason } : null,
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
  if (allowStale) {
    version.changeSummary = `Applied with --allow-stale: ${staleReason}`;
  }
  version.dataHash = hash;
  version.shortHash = shortHash(hash);
  if (hashChanged) version.lastModifiedAt = now;
  version.totalFoods = incoming.foods.length;
  version.verifiedFoods = incoming.foods.filter((food) => getFoodStatus(food) === 'verified').length;
  version.unverifiedFoods = incoming.foods.filter(
    (food) => getFoodStatus(food) === 'unverified'
  ).length;

  const targetExisted = fs.existsSync(target);
  const versionExisted = fs.existsSync(versionPath);
  let foodBackup = null;
  let versionBackup = null;
  let reportBackup = null;
  let htmlReportBackup = null;
  const reportPath = path.join(paths.reportsDir, 'food-equivalents-audit.json');
  const htmlReportPath = path.join(paths.reportsDir, 'food-equivalents-audit.html');
  const reportExisted = fs.existsSync(reportPath);
  const htmlReportExisted = fs.existsSync(htmlReportPath);

  try {
    if (targetExisted) {
      foodBackup = backupFile(target, paths.backupsDir, allowStale ? 'pre-apply-stale' : 'pre-apply');
      console.log('Food backup created:', foodBackup);
    }
    if (versionExisted) {
      versionBackup = backupFile(
        versionPath,
        paths.backupsDir,
        allowStale ? 'pre-apply-stale' : 'pre-apply'
      );
      console.log('Version backup created:', versionBackup);
    }
    if (reportExisted) {
      reportBackup = backupFile(reportPath, paths.backupsDir, 'pre-apply-report');
    }
    if (htmlReportExisted) {
      htmlReportBackup = backupFile(htmlReportPath, paths.backupsDir, 'pre-apply-report-html');
    }

    writeTwoFilesAtomically({
      firstTarget: target,
      firstContent: JSON.stringify(incoming, null, 2),
      firstBackup: foodBackup,
      firstExisted: targetExisted,
      secondTarget: versionPath,
      secondContent: JSON.stringify(version, null, 2),
      secondBackup: versionBackup,
      secondExisted: versionExisted,
    });

    console.log('Applied:', inputPath, '→', target);
    console.log('dataHash:', shortHash(hash));

    const auditScript = paths.auditScriptPath;
    const audit = spawnSync(process.execPath, [auditScript], {
      stdio: 'inherit',
      cwd: paths.root,
      env: process.env,
    });
    if (audit.error) throw audit.error;
    if (audit.status !== 0) {
      throw new Error(`Audit failed with exit code ${audit.status ?? 'unknown'}`);
    }
  } catch (error) {
    restoreFile(foodBackup, target, targetExisted);
    restoreFile(versionBackup, versionPath, versionExisted);
    restoreFile(reportBackup, reportPath, reportExisted);
    restoreFile(htmlReportBackup, htmlReportPath, htmlReportExisted);
    for (const temp of [`${target}.tmp`, `${versionPath}.tmp`]) {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    throw error;
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
