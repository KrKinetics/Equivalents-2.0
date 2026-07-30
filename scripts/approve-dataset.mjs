/**
 * Approve the audited nutrition dataset when every readiness gate passes.
 */
import fs from 'fs';
import { computeFoodsDataHash, shortHash } from '../src/lib/data-hash.mjs';
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

function main() {
  const approvedBy = parseApprovedBy(process.argv.slice(2));
  if (!approvedBy) {
    throw new Error('Approval refused: provide an approver with --by "Name".');
  }

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

  // Group approval evaluates the state that would exist after this command succeeds.
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
  const approvedVersion = {
    ...version,
    status: 'approved',
    approvedAt,
    approvedBy,
  };
  fs.writeFileSync(paths.versionDataPath, JSON.stringify(approvedVersion, null, 2), 'utf8');
  console.log(`Dataset approved by ${approvedBy} at ${approvedAt}.`);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
