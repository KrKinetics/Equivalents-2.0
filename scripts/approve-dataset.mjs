/**
 * Approve the audited nutrition dataset when every readiness gate passes.
 * Optionally bumps semver and archives an immutable release under releases/data/.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { backupFile } from '../src/lib/backup.mjs';
import { replaceAtomically, restoreFile } from '../src/lib/atomic-write.mjs';
import { computeFoodsDataHash, shortHash } from '../src/lib/data-hash.mjs';
import { bumpSemver, describeBumpPolicy } from '../src/lib/dataset-governance.mjs';
import { auditDataset, validateSource } from '../src/lib/food-audit-core.mjs';
import { isActiveFood, isVerifiedFood } from '../src/lib/food-status.mjs';
import { calculateAllGroupStatistics } from '../src/lib/group-statistics.mjs';
import { resolvePaths } from '../src/lib/paths.mjs';
import { validateFoodEquivalentsPayload } from '../src/lib/schema-validate.mjs';
import {
  validateVerificationEligibility,
  verifiedOpenErrorsMessage,
} from '../src/lib/verification-eligibility.mjs';

function parseApprovedBy(argv) {
  const equalsArg = argv.find((arg) => arg.startsWith('--by='));
  if (equalsArg) return equalsArg.slice('--by='.length).trim();
  const index = argv.indexOf('--by');
  return index >= 0 ? String(argv[index + 1] || '').trim() : '';
}

function parseBump(argv) {
  const equalsArg = argv.find((arg) => arg.startsWith('--bump='));
  if (equalsArg) return equalsArg.slice('--bump='.length).trim().toLowerCase();
  const index = argv.indexOf('--bump');
  return index >= 0 ? String(argv[index + 1] || '').trim().toLowerCase() : 'patch';
}

function parseChangeSummary(argv) {
  const equalsArg = argv.find((arg) => arg.startsWith('--summary='));
  if (equalsArg) return equalsArg.slice('--summary='.length).trim();
  const index = argv.indexOf('--summary');
  return index >= 0 ? String(argv[index + 1] || '').trim() : '';
}

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function main() {
  const argv = process.argv.slice(2);
  const approvedBy = parseApprovedBy(argv);
  if (!approvedBy) {
    throw new Error('Approval refused: provide an approver with --by "Name".');
  }
  const bump = parseBump(argv);
  if (!['patch', 'minor', 'major'].includes(bump)) {
    throw new Error(
      `Invalid --bump ${bump}. Use patch|minor|major.\n${JSON.stringify(describeBumpPolicy(), null, 2)}`
    );
  }
  const summaryArg = parseChangeSummary(argv);

  const paths = resolvePaths();
  const payload = JSON.parse(fs.readFileSync(paths.foodDataPath, 'utf8'));
  const groupsDoc = JSON.parse(fs.readFileSync(paths.groupsPath, 'utf8'));
  const version = JSON.parse(fs.readFileSync(paths.versionDataPath, 'utf8'));
  const foods = payload.foods || [];

  const schemaValidation = validateFoodEquivalentsPayload(payload);
  if (!schemaValidation.ok) {
    console.error('Dataset approval refused: JSON Schema errors');
    for (const err of schemaValidation.errors.slice(0, 30)) {
      console.error(` - ${err.path}: ${err.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const audited = auditDataset(foods);
  const activeFoods = foods.filter((food) => isActiveFood(food));
  const unverifiedActive = activeFoods.filter((food) => !isVerifiedFood(food));
  const unapprovedClassifications = activeFoods.filter(
    (food) => food.classificationStatus !== 'approved'
  );
  const statusMismatches = audited.items.filter((item) =>
    item.alerts.some((alert) => alert.code === 'STATUS_MISMATCH')
  );
  const hash = computeFoodsDataHash(foods);

  const groupStatistics = calculateAllGroupStatistics(foods, groupsDoc, {
    ...version,
    status: 'approved',
  });
  const unapprovedGroups = Object.values(groupStatistics).filter((group) => !group.approved);

  const reasons = [];
  for (const food of foods.filter((item) => isVerifiedFood(item))) {
    const eligibility = validateVerificationEligibility(food, audited.byId[food.id], {
      sourceAuthoritative: validateSource(food).authoritative,
    });
    if (!eligibility.ok) {
      reasons.push(verifiedOpenErrorsMessage(food, eligibility));
    }
  }
  if (
    (audited.summary.activeBlockingErrorCount ?? audited.summary.blockingErrorCount) > 0 ||
    (audited.summary.structuralBlockingErrorCount ?? 0) > 0
  ) {
    reasons.push(
      `${audited.summary.activeBlockingErrorCount ?? audited.summary.blockingErrorCount} active/structural blocking audit error(s) remain` +
        ` (rejected non-structural: ${audited.summary.rejectedBlockingErrorCount ?? 0})`
    );
  }
  if (unverifiedActive.length > 0) {
    reasons.push(
      `${unverifiedActive.length} active food(s) are not verified` +
        ` (${unverifiedActive.slice(0, 5).map((food) => food.id).join(', ')}${
          unverifiedActive.length > 5 ? ', …' : ''
        })`
    );
  }
  if (statusMismatches.length > 0) {
    reasons.push(`${statusMismatches.length} STATUS_MISMATCH alert(s) remain`);
  }
  if (unapprovedClassifications.length > 0) {
    reasons.push(
      `${unapprovedClassifications.length} active food classification(s) are not approved`
    );
  }
  if (unapprovedGroups.length > 0) {
    reasons.push(
      `group approval failed: ${unapprovedGroups
        .map((group) => `${group.calculationGroup} [${group.approvalBlockers.join(', ')}]`)
        .join('; ')}`
    );
  }
  if (!version.dataHash) {
    reasons.push('version.dataHash is missing; run data:audit first');
  } else if (version.dataHash !== hash) {
    reasons.push(
      `current food hash ${shortHash(hash)} does not match last audited hash ${shortHash(
        version.dataHash
      )}`
    );
  }

  if (reasons.length > 0) {
    console.error('Dataset approval refused:');
    for (const reason of reasons) console.error(` - ${reason}`);
    process.exitCode = 1;
    return;
  }

  const approvedAt = new Date().toISOString();
  const previousVersion = version.version;
  const nextVersion = bumpSemver(version.version || '0.0.0', bump);
  const changeSummary =
    summaryArg ||
    `Approved ${bump} bump ${previousVersion} → ${nextVersion} by ${approvedBy}`;

  const approvedVersion = {
    ...version,
    version: nextVersion,
    previousVersion,
    status: 'approved',
    approvedAt,
    approvedBy,
    changeSummary,
    dataHash: hash,
    shortHash: shortHash(hash),
    bump,
  };

  // Fresh audit report generated in memory — never archive a stale reports/ file blindly
  const freshAuditReport = {
    generatedAt: approvedAt,
    summary: audited.summary,
    alertCountsByCode: audited.alertCountsByCode,
    items: audited.items,
  };

  const releasesDir = paths.releasesDir;
  fs.mkdirSync(releasesDir, { recursive: true });
  const releaseDir = path.join(releasesDir, nextVersion);
  if (fs.existsSync(releaseDir)) {
    throw new Error(`Release directory already exists: ${releaseDir}`);
  }

  const versionExisted = fs.existsSync(paths.versionDataPath);
  const versionBackup = backupFile(paths.versionDataPath, paths.backupsDir, 'pre-approve');
  const foodBackup = backupFile(paths.foodDataPath, paths.backupsDir, 'pre-approve');
  console.log('Backups:', foodBackup, versionBackup);

  const tempVersion = `${paths.versionDataPath}.tmp`;
  const schemaVersion = payload.meta?.schemaVersion ?? 2;

  try {
    fs.mkdirSync(releaseDir, { recursive: true });
    const foodArchivePath = path.join(releaseDir, 'food-equivalents.json');
    const versionArchivePath = path.join(releaseDir, 'nutrition-data-version.json');
    const auditArchivePath = path.join(releaseDir, 'audit-report.json');
    const manifestPath = path.join(releaseDir, 'release-manifest.json');

    fs.writeFileSync(foodArchivePath, JSON.stringify(payload, null, 2), 'utf8');
    fs.writeFileSync(versionArchivePath, JSON.stringify(approvedVersion, null, 2), 'utf8');
    fs.writeFileSync(auditArchivePath, JSON.stringify(freshAuditReport, null, 2), 'utf8');

    const foodFileHash = fileSha256(foodArchivePath);
    const versionFileHash = fileSha256(versionArchivePath);
    const auditFileHash = fileSha256(auditArchivePath);

    const manifest = {
      version: nextVersion,
      previousVersion,
      bump,
      approvedBy,
      approvedAt,
      changeSummary,
      dataHash: hash,
      shortHash: shortHash(hash),
      schemaVersion,
      generatedAt: approvedAt,
      fileHashes: {
        'food-equivalents.json': foodFileHash,
        'nutrition-data-version.json': versionFileHash,
        'audit-report.json': auditFileHash,
      },
      policy: describeBumpPolicy(),
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    // Post-write verification
    const reFood = fileSha256(foodArchivePath);
    const reVersion = fileSha256(versionArchivePath);
    const reAudit = fileSha256(auditArchivePath);
    if (
      reFood !== foodFileHash ||
      reVersion !== versionFileHash ||
      reAudit !== auditFileHash
    ) {
      throw new Error('Release archive hash verification failed after write');
    }

    fs.writeFileSync(tempVersion, JSON.stringify(approvedVersion, null, 2), 'utf8');
    try {
      replaceAtomically(tempVersion, paths.versionDataPath, versionBackup);
    } catch (renameError) {
      restoreFile(versionBackup, paths.versionDataPath, versionExisted);
      throw renameError;
    }

    console.log(`Dataset approved by ${approvedBy} at ${approvedAt}.`);
    console.log(`Version ${previousVersion} → ${nextVersion} (${bump}).`);
    console.log(`Immutable archive: ${releaseDir}`);
  } catch (error) {
    if (fs.existsSync(tempVersion)) fs.unlinkSync(tempVersion);
    if (fs.existsSync(releaseDir)) {
      fs.rmSync(releaseDir, { recursive: true, force: true });
    }
    restoreFile(versionBackup, paths.versionDataPath, versionExisted);
    throw error;
  } finally {
    if (fs.existsSync(tempVersion)) fs.unlinkSync(tempVersion);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
