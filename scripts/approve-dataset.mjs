/**
 * Approve the audited nutrition dataset when every readiness gate passes.
 * Optionally bumps semver and archives an immutable release under releases/data/.
 */
import fs from 'fs';
import path from 'path';
import { backupFile } from '../src/lib/backup.mjs';
import { computeFoodsDataHash, shortHash } from '../src/lib/data-hash.mjs';
import { bumpSemver, describeBumpPolicy } from '../src/lib/dataset-governance.mjs';
import { auditDataset } from '../src/lib/food-audit-core.mjs';
import { isActiveFood, isVerifiedFood } from '../src/lib/food-status.mjs';
import { calculateAllGroupStatistics } from '../src/lib/group-statistics.mjs';
import { resolvePaths } from '../src/lib/paths.mjs';

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

function replaceAtomically(tempPath, targetPath) {
  try {
    fs.renameSync(tempPath, targetPath);
  } catch (error) {
    if (!['EEXIST', 'EPERM', 'EACCES'].includes(error.code) || !fs.existsSync(targetPath)) {
      throw error;
    }
    fs.unlinkSync(targetPath);
    fs.renameSync(tempPath, targetPath);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const approvedBy = parseApprovedBy(argv);
  if (!approvedBy) {
    throw new Error('Approval refused: provide an approver with --by "Name".');
  }
  const bump = parseBump(argv);
  if (!['patch', 'minor', 'major'].includes(bump)) {
    throw new Error(`Invalid --bump ${bump}. Use patch|minor|major.\n${JSON.stringify(describeBumpPolicy(), null, 2)}`);
  }
  const summaryArg = parseChangeSummary(argv);

  const paths = resolvePaths();
  const payload = JSON.parse(fs.readFileSync(paths.foodDataPath, 'utf8'));
  const groupsDoc = JSON.parse(fs.readFileSync(paths.groupsPath, 'utf8'));
  const version = JSON.parse(fs.readFileSync(paths.versionDataPath, 'utf8'));
  const foods = payload.foods || [];

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
  if (audited.summary.blockingErrorCount > 0) {
    reasons.push(`${audited.summary.blockingErrorCount} blocking audit error(s) remain`);
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

  const releasesDir = path.join(paths.root, 'releases', 'data');
  fs.mkdirSync(releasesDir, { recursive: true });
  const releaseDir = path.join(releasesDir, nextVersion);
  if (fs.existsSync(releaseDir)) {
    throw new Error(`Release directory already exists: ${releaseDir}`);
  }

  const versionBackup = backupFile(paths.versionDataPath, paths.backupsDir, 'pre-approve');
  const foodBackup = backupFile(paths.foodDataPath, paths.backupsDir, 'pre-approve');
  console.log('Backups:', foodBackup, versionBackup);

  const tempVersion = `${paths.versionDataPath}.tmp`;
  const auditReportPath = path.join(paths.reportsDir, 'food-equivalents-audit.json');
  let auditReport = null;
  if (fs.existsSync(auditReportPath)) {
    auditReport = JSON.parse(fs.readFileSync(auditReportPath, 'utf8'));
  }

  try {
    fs.mkdirSync(releaseDir, { recursive: true });
    fs.writeFileSync(
      path.join(releaseDir, 'food-equivalents.json'),
      JSON.stringify(payload, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      path.join(releaseDir, 'nutrition-data-version.json'),
      JSON.stringify(approvedVersion, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      path.join(releaseDir, 'audit-report.json'),
      JSON.stringify(auditReport || audited, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      path.join(releaseDir, 'release-manifest.json'),
      JSON.stringify(
        {
          version: nextVersion,
          previousVersion,
          bump,
          approvedBy,
          approvedAt,
          changeSummary,
          dataHash: hash,
          shortHash: shortHash(hash),
          policy: describeBumpPolicy(),
        },
        null,
        2
      ),
      'utf8'
    );

    fs.writeFileSync(tempVersion, JSON.stringify(approvedVersion, null, 2), 'utf8');
    replaceAtomically(tempVersion, paths.versionDataPath);
    console.log(`Dataset approved by ${approvedBy} at ${approvedAt}.`);
    console.log(`Version ${previousVersion} → ${nextVersion} (${bump}).`);
    console.log(`Immutable archive: ${releaseDir}`);
  } catch (error) {
    if (fs.existsSync(tempVersion)) fs.unlinkSync(tempVersion);
    if (fs.existsSync(releaseDir)) {
      fs.rmSync(releaseDir, { recursive: true, force: true });
    }
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
