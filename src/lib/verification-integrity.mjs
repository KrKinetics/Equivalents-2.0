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
  'VERIFICATION_HISTORY_MISMATCH',
]);

export function materialDataSnapshot(food) {
  const snap = {};
  for (const key of MATERIAL_FIELDS) {
    snap[key] = food?.[key] ?? null;
  }
  return stableStringify(snap);
}

export function latestVerifyBatch(history) {
  const list = Array.isArray(history) ? history : [];
  const verifyEntries = list.filter((h) => h && h.action === 'verify');
  if (!verifyEntries.length) return null;
  const last = verifyEntries[verifyEntries.length - 1];
  const stamp = last.timestamp || last.at || null;
  const batch = stamp
    ? verifyEntries.filter((h) => (h.timestamp || h.at) === stamp)
    : [last];
  const meta = {
    verifiedAt: null,
    verifiedBy: null,
    datasetVersion: null,
    by: last.by || null,
  };
  for (const entry of batch) {
    if (entry.path === 'verification.verifiedAt') meta.verifiedAt = entry.newValue;
    if (entry.path === 'verification.verifiedBy') meta.verifiedBy = entry.newValue;
    if (entry.path === 'verification.datasetVersion') meta.datasetVersion = entry.newValue;
  }
  return meta;
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

    const verifyBatch = latestVerifyBatch(history);
    if (!verifyBatch) {
      errors.push({
        code: 'VERIFICATION_HISTORY_MISSING',
        message: 'Aucune entrée history avec action=verify pour un aliment verified',
      });
    } else if (
      verification.verifiedAt &&
      verification.verifiedBy &&
      verification.datasetVersion
    ) {
      const atMatches =
        verifyBatch.verifiedAt == null || verifyBatch.verifiedAt === verification.verifiedAt;
      const byMatches =
        verifyBatch.verifiedBy == null || verifyBatch.verifiedBy === verification.verifiedBy;
      const versionMatches =
        verifyBatch.datasetVersion == null ||
        verifyBatch.datasetVersion === verification.datasetVersion;
      if (!atMatches || !byMatches || !versionMatches) {
        errors.push({
          code: 'VERIFICATION_HISTORY_MISMATCH',
          message:
            'La dernière entrée history verify ne correspond pas aux métadonnées de verification actives',
        });
      }
    }
  }

  return errors;
}

/**
 * True when incoming history shows material updates followed by a fresh verify.
 */
export function hasPostMaterialReverify(current, incoming) {
  const curHist = Array.isArray(current.history) ? current.history : [];
  const nextHist = Array.isArray(incoming.history) ? incoming.history : [];
  if (nextHist.length <= curHist.length) return false;

  const appended = nextHist.slice(curHist.length);
  const materialUpdateIndexes = [];
  const verifyIndexes = [];
  appended.forEach((entry, index) => {
    if (!entry) return;
    const root = String(entry.path || '').split('.')[0];
    if (MATERIAL_FIELDS.includes(root) && entry.action !== 'verify') {
      materialUpdateIndexes.push(index);
    }
    if (entry.action === 'verify') verifyIndexes.push(index);
  });
  if (!materialUpdateIndexes.length || !verifyIndexes.length) return false;
  const lastMaterial = Math.max(...materialUpdateIndexes);
  const lastVerify = Math.max(...verifyIndexes);
  if (lastVerify <= lastMaterial) return false;

  const v = incoming.verification || {};
  if (!isValidIsoDateTime(v.verifiedAt)) return false;
  if (!isMeaningfulString(v.verifiedBy)) return false;
  if (!isMeaningfulString(v.datasetVersion, { minLength: 1 })) return false;
  if (v.verifiedAt === current.verification?.verifiedAt) return false;
  if (incoming.status !== 'verified' || v.status !== 'verified') return false;
  return true;
}
