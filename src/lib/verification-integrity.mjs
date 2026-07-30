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
  'VERIFICATION_HISTORY_OLD_VALUE_MISMATCH',
  'VERIFICATION_TRANSACTION_ID_REUSED',
  'VERIFICATION_TRANSACTION_NOT_CONTIGUOUS',
  'VERIFICATION_TRANSACTION_ORDER_INVALID',
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

function setValueAtPath(value, path, next) {
  const parts = String(path).split('.');
  let current = value;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!current[key] || typeof current[key] !== 'object') current[key] = {};
    current = current[key];
  }
  current[parts[parts.length - 1]] = structuredClone(next);
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

  if (batch.transactionId) {
    const entriesWithId = (food.history || [])
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry?.transactionId === batch.transactionId);
    if (entriesWithId.length > VERIFY_PATHS.length) {
      return {
        ok: false,
        code: 'VERIFICATION_TRANSACTION_ID_REUSED',
        message: `transactionId réutilisé: ${batch.transactionId}`,
        transaction: batch,
      };
    }
    if (entriesWithId.some(({ entry }) => entry.action !== 'verify')) {
      return {
        ok: false,
        code: 'VERIFICATION_TRANSACTION_ORDER_INVALID',
        message: 'Une transaction verify contient une entrée d’une autre action',
        transaction: batch,
      };
    }
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

  if (batch.transactionId || options.requireTransactionId) {
    const firstIndex = Math.min(...batch.indexes);
    const lastIndex = Math.max(...batch.indexes);
    if (
      batch.indexes.length !== VERIFY_PATHS.length ||
      lastIndex - firstIndex + 1 !== VERIFY_PATHS.length
    ) {
      return {
        ok: false,
        code: 'VERIFICATION_TRANSACTION_NOT_CONTIGUOUS',
        message: 'Les cinq entrées verify doivent être contiguës dans history',
        transaction: batch,
      };
    }
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

/**
 * Validate a newly appended verification transaction against the exact state
 * reconstructed immediately before that transaction.
 */
export function validateVerifyTransition(currentFood, incomingFood) {
  const basic = validateVerifyTransaction(incomingFood, {
    requireTransactionId: true,
  });
  if (!basic.ok) return basic;

  const transaction = basic.transaction;
  const currentHistory = Array.isArray(currentFood?.history) ? currentFood.history : [];
  const incomingHistory = Array.isArray(incomingFood?.history) ? incomingFood.history : [];
  const firstIndex = Math.min(...transaction.indexes);
  const lastIndex = Math.max(...transaction.indexes);

  if (currentHistory.some((entry) => entry?.transactionId === transaction.transactionId)) {
    return {
      ok: false,
      code: 'VERIFICATION_TRANSACTION_ID_REUSED',
      message: `transactionId déjà présent dans l’historique: ${transaction.transactionId}`,
      transaction,
    };
  }
  if (firstIndex < currentHistory.length) {
    return {
      ok: false,
      code: 'VERIFICATION_TRANSACTION_ID_REUSED',
      message: 'La dernière transaction verify n’est pas une nouvelle transaction',
      transaction,
    };
  }

  // Validate every verify transaction appended since currentFood, not only the
  // active/latest one. This prevents hiding a fabricated transaction behind a
  // later valid transaction in the same import.
  const replayed = structuredClone(currentFood);
  const existingTransactionIds = new Set(
    currentHistory.map((entry) => entry?.transactionId).filter(Boolean)
  );
  const seenNewTransactionIds = new Set();
  let latestMaterialTimestamp = null;
  for (let index = currentHistory.length; index < incomingHistory.length; index += 1) {
    const entry = incomingHistory[index];
    if (entry?.action !== 'verify') {
      if (entry?.action === 'auto_unverify') {
        replayed.status = 'unverified';
        replayed.verification = {
          ...(replayed.verification || {}),
          status: 'unverified',
          verifiedAt: null,
          verifiedBy: null,
          datasetVersion: null,
        };
      } else if (entry?.path) {
        setValueAtPath(replayed, entry.path, entry.newValue);
      }
      if (
        entry?.action === 'auto_unverify' ||
        MATERIAL_FIELDS.includes(String(entry?.path || '').split('.')[0])
      ) {
        latestMaterialTimestamp = entry.timestamp || entry.at || latestMaterialTimestamp;
      }
      if (Number.isInteger(entry?.versionAfter)) replayed.version = entry.versionAfter;
      continue;
    }

    const transactionId = entry.transactionId;
    if (!transactionId) {
      return {
        ok: false,
        code: 'VERIFICATION_HISTORY_INCOMPLETE',
        message: 'transactionId requis pour toute nouvelle transaction verify',
        transaction,
      };
    }
    if (
      existingTransactionIds.has(transactionId) ||
      seenNewTransactionIds.has(transactionId)
    ) {
      return {
        ok: false,
        code: 'VERIFICATION_TRANSACTION_ID_REUSED',
        message: `transactionId réutilisé: ${transactionId}`,
        transaction,
      };
    }

    const entriesWithId = incomingHistory
      .map((candidate, candidateIndex) => ({ entry: candidate, index: candidateIndex }))
      .filter(({ entry: candidate }) => candidate?.transactionId === transactionId);
    const contiguous = incomingHistory.slice(index, index + VERIFY_PATHS.length);
    if (
      entriesWithId.length !== VERIFY_PATHS.length ||
      contiguous.length !== VERIFY_PATHS.length ||
      contiguous.some(
        (candidate) =>
          candidate?.action !== 'verify' || candidate.transactionId !== transactionId
      )
    ) {
      return {
        ok: false,
        code: 'VERIFICATION_TRANSACTION_NOT_CONTIGUOUS',
        message: 'Les cinq entrées d’une nouvelle transaction verify doivent être contiguës',
        transaction,
      };
    }

    const paths = new Map();
    for (const candidate of contiguous) paths.set(candidate.path, candidate);
    if (
      paths.size !== VERIFY_PATHS.length ||
      VERIFY_PATHS.some((path) => !paths.has(path))
    ) {
      return {
        ok: false,
        code: 'VERIFICATION_HISTORY_INCOMPLETE',
        message: 'Une nouvelle transaction verify doit contenir exactement les cinq chemins',
        transaction,
      };
    }

    const first = contiguous[0];
    const timestamp = first.timestamp || first.at || null;
    const sameMetadata = contiguous.every(
      (candidate) =>
        (candidate.timestamp || candidate.at || null) === timestamp &&
        candidate.by === first.by &&
        candidate.versionBefore === first.versionBefore &&
        candidate.versionAfter === first.versionAfter
    );
    if (
      !sameMetadata ||
      !Number.isInteger(first.versionBefore) ||
      !Number.isInteger(first.versionAfter) ||
      first.versionBefore !== replayed.version ||
      first.versionAfter <= first.versionBefore
    ) {
      return {
        ok: false,
        code: 'VERIFICATION_HISTORY_MISMATCH',
        message: 'Métadonnées ou versions incohérentes dans la transaction verify',
        transaction,
      };
    }
    if (
      paths.get('status').newValue !== 'verified' ||
      paths.get('verification.status').newValue !== 'verified' ||
      paths.get('verification.verifiedAt').newValue !== timestamp ||
      !isMeaningfulString(paths.get('verification.verifiedBy').newValue) ||
      paths.get('verification.verifiedBy').newValue !== first.by ||
      !isMeaningfulString(paths.get('verification.datasetVersion').newValue)
    ) {
      return {
        ok: false,
        code: 'VERIFICATION_HISTORY_MISMATCH',
        message: 'La transaction verify ne produit pas des métadonnées verified valides',
        transaction,
      };
    }
    if (
      latestMaterialTimestamp &&
      Date.parse(timestamp) < Date.parse(latestMaterialTimestamp)
    ) {
      return {
        ok: false,
        code: 'VERIFICATION_TRANSACTION_ORDER_INVALID',
        message: 'La transaction verify précède une modification ou auto-invalidation',
        transaction,
      };
    }

    for (const path of VERIFY_PATHS) {
      const candidate = paths.get(path);
      if (!sameValue(candidate.oldValue, valueAtPath(replayed, path))) {
        return {
          ok: false,
          code: 'VERIFICATION_HISTORY_OLD_VALUE_MISMATCH',
          message: `${path}: oldValue ne correspond pas à l’état rejoué avant verify`,
          transaction,
        };
      }
      setValueAtPath(replayed, path, candidate.newValue);
    }
    replayed.version = first.versionAfter;
    seenNewTransactionIds.add(transactionId);
    index += VERIFY_PATHS.length - 1;
  }

  const reconstructed = structuredClone(currentFood);
  const relevantBefore = [];
  for (let index = currentHistory.length; index < firstIndex; index += 1) {
    const entry = incomingHistory[index];
    if (!entry) continue;
    relevantBefore.push(entry);
    if (entry.action === 'auto_unverify') {
      reconstructed.status = 'unverified';
      reconstructed.verification = {
        ...(reconstructed.verification || {}),
        status: 'unverified',
        verifiedAt: null,
        verifiedBy: null,
        datasetVersion: null,
      };
    } else if (entry.path) {
      setValueAtPath(reconstructed, entry.path, entry.newValue);
    }
  }

  const paths = new Map(transaction.entries.map((entry) => [entry.path, entry]));
  for (const path of VERIFY_PATHS) {
    const actualOldValue = valueAtPath(reconstructed, path);
    if (!sameValue(paths.get(path).oldValue, actualOldValue)) {
      return {
        ok: false,
        code: 'VERIFICATION_HISTORY_OLD_VALUE_MISMATCH',
        message: `${path}: oldValue ne correspond pas à l’état réel avant verify`,
        transaction,
      };
    }
  }

  const materialOrInvalidation = (entry) => {
    const root = String(entry?.path || '').split('.')[0];
    return entry?.action === 'auto_unverify' || MATERIAL_FIELDS.includes(root);
  };
  const invalidAfterOrInside = incomingHistory
    .slice(firstIndex, incomingHistory.length)
    .some((entry, relativeIndex) => {
      const absoluteIndex = firstIndex + relativeIndex;
      return absoluteIndex > lastIndex && materialOrInvalidation(entry);
    });
  if (invalidAfterOrInside) {
    return {
      ok: false,
      code: 'VERIFICATION_TRANSACTION_ORDER_INVALID',
      message: 'La transaction verify doit suivre toute modification et auto-invalidation',
      transaction,
    };
  }

  const latestPriorTimestamp = relevantBefore
    .filter(materialOrInvalidation)
    .map((entry) => entry.timestamp || entry.at)
    .filter(Boolean)
    .sort()
    .at(-1);
  if (
    latestPriorTimestamp &&
    Date.parse(transaction.timestamp) < Date.parse(latestPriorTimestamp)
  ) {
    return {
      ok: false,
      code: 'VERIFICATION_TRANSACTION_ORDER_INVALID',
      message: 'Le timestamp verify précède une modification ou auto-invalidation',
      transaction,
    };
  }

  return { ok: true, code: null, message: null, transaction, reconstructed };
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
  const transactionValidation = validateVerifyTransition(current, incoming);
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
