/**
 * Verification record integrity — shared by audit, import, and governance.
 */

import { isMeaningfulString, isValidIsoDateTime } from './source-validators.mjs';
import { getFoodStatus, hasStatusMismatch } from './food-status.mjs';
import { MATERIAL_FIELDS } from './food-change.mjs';
import { stableStringify } from './data-hash-lite.mjs';

export const STRUCTURAL_BLOCKING_CODES = new Set([
  'MISSING_ID',
  'DUPLICATE_ID',
  'STATUS_MISMATCH',
  'INVALID_STATUS',
  'INVALID_CATEGORY',
  'INVALID_GROUP',
  'INVALID_NUMERIC_TYPE',
  'NON_FINITE_VALUE',
]);

export const VERIFICATION_INTEGRITY_CODES = new Set([
  'VERIFICATION_DATE_MISSING',
  'VERIFICATION_DATE_INVALID',
  'VERIFICATION_REVIEWER_MISSING',
  'VERIFICATION_DATASET_VERSION_MISSING',
  'VERIFICATION_HISTORY_MISSING',
  'VERIFICATION_HISTORY_INCOMPLETE',
  'VERIFICATION_HISTORY_MISMATCH',
]);

const VERIFY_PATHS = [
  'status',
  'verification.status',
  'verification.verifiedAt',
  'verification.verifiedBy',
  'verification.datasetVersion',
];

export function materialDataSnapshot(food) {
  const snap = {};
  for (const key of MATERIAL_FIELDS) {
    snap[key] = food?.[key] ?? null;
  }
  return stableStringify(snap);
}

function sameValue(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function valueAtPath(value, path) {
  return String(path)
    .split('.')
    .reduce((current, key) => current?.[key], value);
}

function collectLeafDiffs(current, incoming, prefix, output) {
  if (sameValue(current, incoming)) return;
  const currentObject = current && typeof current === 'object' && !Array.isArray(current);
  const incomingObject = incoming && typeof incoming === 'object' && !Array.isArray(incoming);
  if (currentObject && incomingObject) {
    const keys = new Set([...Object.keys(current), ...Object.keys(incoming)]);
    for (const key of [...keys].sort()) {
      collectLeafDiffs(current[key], incoming[key], `${prefix}.${key}`, output);
    }
    return;
  }
  output.push({
    path: prefix,
    oldValue: current,
    newValue: incoming,
  });
}

export function diffMaterialData(currentFood, incomingFood) {
  const output = [];
  for (const key of MATERIAL_FIELDS) {
    collectLeafDiffs(currentFood?.[key], incomingFood?.[key], key, output);
  }
  return output;
}

export function latestVerifyBatch(history) {
  const list = Array.isArray(history) ? history : [];
  const lastIndex = list.findLastIndex((entry) => entry?.action === 'verify');
  if (lastIndex < 0) return null;
  const last = list[lastIndex];
  const timestamp = last.timestamp || last.at || null;
  const transactionId = last.transactionId || null;
  const entries = [];
  const indexes = [];
  list.forEach((entry, index) => {
    if (entry?.action !== 'verify') return;
    const sameTransaction = transactionId
      ? entry.transactionId === transactionId
      : !entry.transactionId &&
        (entry.timestamp || entry.at || null) === timestamp &&
        entry.versionBefore === last.versionBefore &&
        entry.versionAfter === last.versionAfter;
    if (sameTransaction) {
      entries.push(entry);
      indexes.push(index);
    }
  });
  return {
    entries,
    indexes,
    timestamp,
    transactionId,
    versionBefore: last.versionBefore,
    versionAfter: last.versionAfter,
  };
}

/**
 * Validate the active food's latest complete verification transaction.
 * Old complete transactions may omit transactionId. New appended transactions
 * are checked with requireTransactionId by governance.
 */
export function validateVerifyTransaction(food, options = {}) {
  const batch = latestVerifyBatch(food?.history);
  if (!batch) {
    return {
      ok: false,
      code: 'VERIFICATION_HISTORY_MISSING',
      message: 'Aucune transaction verify présente',
      transaction: null,
    };
  }

  const paths = new Map();
  for (const entry of batch.entries) {
    if (paths.has(entry.path)) {
      return {
        ok: false,
        code: 'VERIFICATION_HISTORY_INCOMPLETE',
        message: `Chemin verify dupliqué: ${entry.path}`,
        transaction: batch,
      };
    }
    paths.set(entry.path, entry);
  }
  const missing = VERIFY_PATHS.filter((path) => !paths.has(path));
  if (missing.length || batch.entries.length !== VERIFY_PATHS.length) {
    return {
      ok: false,
      code: 'VERIFICATION_HISTORY_INCOMPLETE',
      message: `Transaction verify incomplète; chemins manquants: ${missing.join(', ') || 'aucun (entrées supplémentaires)'}`,
      transaction: batch,
    };
  }

  if (options.requireTransactionId && !batch.transactionId) {
    return {
      ok: false,
      code: 'VERIFICATION_HISTORY_INCOMPLETE',
      message: 'transactionId requis pour une nouvelle transaction verify',
      transaction: batch,
    };
  }

  const first = batch.entries[0];
  const sameMetadata = batch.entries.every(
    (entry) =>
      (entry.timestamp || entry.at || null) === batch.timestamp &&
      entry.versionBefore === batch.versionBefore &&
      entry.versionAfter === batch.versionAfter &&
      entry.by === first.by &&
      (!batch.transactionId || entry.transactionId === batch.transactionId)
  );
  if (!sameMetadata) {
    return {
      ok: false,
      code: 'VERIFICATION_HISTORY_MISMATCH',
      message: 'Les entrées verify ne partagent pas timestamp, versions, by et transactionId',
      transaction: batch,
    };
  }

  const verification = food?.verification || {};
  const expected = new Map([
    ['status', food?.status],
    ['verification.status', verification.status],
    ['verification.verifiedAt', verification.verifiedAt],
    ['verification.verifiedBy', verification.verifiedBy],
    ['verification.datasetVersion', verification.datasetVersion],
  ]);
  const valuesMatch = VERIFY_PATHS.every((path) =>
    sameValue(paths.get(path)?.newValue, expected.get(path))
  );
  if (
    !valuesMatch ||
    paths.get('status').newValue !== 'verified' ||
    paths.get('verification.status').newValue !== 'verified' ||
    batch.timestamp !== verification.verifiedAt ||
    !isMeaningfulString(first.by) ||
    first.by !== verification.verifiedBy ||
    !Number.isInteger(batch.versionBefore) ||
    !Number.isInteger(batch.versionAfter) ||
    batch.versionAfter !== food?.version ||
    batch.versionAfter <= batch.versionBefore
  ) {
    return {
      ok: false,
      code: 'VERIFICATION_HISTORY_MISMATCH',
      message: 'La transaction verify ne correspond pas exactement aux métadonnées actives',
      transaction: batch,
    };
  }

  return { ok: true, code: null, message: null, transaction: batch };
}

export function validateMaterialChangeHistory(current, incoming) {
  const differences = diffMaterialData(current, incoming);
  if (!differences.length) {
    return { ok: true, differences, matches: [], latestIndex: -1, latestTimestamp: null };
  }
  const currentLength = Array.isArray(current?.history) ? current.history.length : 0;
  const appended = (Array.isArray(incoming?.history) ? incoming.history : []).slice(currentLength);
  const matches = [];

  for (const difference of differences) {
    const relativeIndex = appended.findIndex(
      (entry) =>
        ['update', 'correction'].includes(entry?.action) &&
        entry.path === difference.path &&
        sameValue(entry.oldValue, difference.oldValue) &&
        sameValue(entry.newValue, difference.newValue) &&
        Number.isInteger(entry.versionBefore) &&
        Number.isInteger(entry.versionAfter) &&
        entry.versionBefore >= current.version &&
        entry.versionAfter > entry.versionBefore &&
        entry.versionAfter <= incoming.version
    );
    if (relativeIndex < 0) {
      return {
        ok: false,
        code: 'MATERIAL_CHANGE_HISTORY_MISMATCH',
        message: `Modification matérielle non documentée exactement: ${difference.path}`,
        differences,
        matches,
      };
    }
    matches.push({
      difference,
      entry: appended[relativeIndex],
      index: currentLength + relativeIndex,
    });
  }

  const latest = matches.reduce((result, match) => (match.index > result.index ? match : result));
  return {
    ok: true,
    differences,
    matches,
    latestIndex: latest.index,
    latestTimestamp: latest.entry.timestamp || latest.entry.at || null,
  };
}

/**
 * Collect verification integrity errors for one food.
 * @returns {Array<{code:string,message:string}>}
 */
export function collectVerificationIntegrityErrors(food) {
  const errors = [];
  if (!food) return errors;
  const status = getFoodStatus(food);
  const verification = food.verification || {};
  const history = Array.isArray(food.history) ? food.history : [];

  if (hasStatusMismatch(food)) {
    // STATUS_MISMATCH is reported by auditFood separately
  }

  if (status === 'verified' || verification.status === 'verified') {
    if (food.status !== 'verified' || verification.status !== 'verified') {
      // leave to STATUS_MISMATCH; still check metadata if claiming verified
    }

    if (verification.verifiedAt == null || verification.verifiedAt === '') {
      errors.push({
        code: 'VERIFICATION_DATE_MISSING',
        message: 'verifiedAt requis pour un aliment verified',
      });
    } else if (!isValidIsoDateTime(verification.verifiedAt)) {
      errors.push({
        code: 'VERIFICATION_DATE_INVALID',
        message: `verifiedAt invalide: ${verification.verifiedAt}`,
      });
    }

    if (!isMeaningfulString(verification.verifiedBy)) {
      errors.push({
        code: 'VERIFICATION_REVIEWER_MISSING',
        message: 'verifiedBy significatif requis pour un aliment verified',
      });
    }

    if (!isMeaningfulString(verification.datasetVersion, { minLength: 1 })) {
      errors.push({
        code: 'VERIFICATION_DATASET_VERSION_MISSING',
        message: 'datasetVersion significatif requis pour un aliment verified',
      });
    }

    const transaction = validateVerifyTransaction(food);
    if (!transaction.ok) {
      errors.push({
        code: transaction.code,
        message: transaction.message,
      });
    }
  }

  return errors;
}

/**
 * True when incoming history shows material updates followed by a fresh verify.
 */
export function hasPostMaterialReverify(current, incoming) {
  const historyValidation = validateMaterialChangeHistory(current, incoming);
  if (!historyValidation.ok || !historyValidation.differences.length) return false;
  const transactionValidation = validateVerifyTransaction(incoming, {
    requireTransactionId: true,
  });
  if (!transactionValidation.ok) return false;
  const transaction = transactionValidation.transaction;
  if (Math.min(...transaction.indexes) <= historyValidation.latestIndex) return false;
  if (
    historyValidation.latestTimestamp &&
    Date.parse(transaction.timestamp) < Date.parse(historyValidation.latestTimestamp)
  ) {
    return false;
  }

  const v = incoming.verification || {};
  if (!isValidIsoDateTime(v.verifiedAt)) return false;
  if (!isMeaningfulString(v.verifiedBy)) return false;
  if (!isMeaningfulString(v.datasetVersion, { minLength: 1 })) return false;
  if (v.verifiedAt === current.verification?.verifiedAt) return false;
  if (incoming.status !== 'verified' || v.status !== 'verified') return false;
  return true;
}
