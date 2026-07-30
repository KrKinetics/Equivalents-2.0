/**
 * Dataset versioning + apply governance checks (stale export, history, version).
 */

import { computeFoodsDataHash, shortHash, stableStringify } from './data-hash.mjs';
import { getFoodStatus, isVerifiedFood } from './food-status.mjs';
import { validateReviewImport } from './review-import.mjs';
import {
  materialDataSnapshot,
  hasPostMaterialReverify,
  collectVerificationIntegrityErrors,
} from './verification-integrity.mjs';
import { isMeaningfulString, isValidIsoDateTime, isValidApprovedAt } from './source-validators.mjs';

export { validateReviewImport };
export const RESOLUTION_STATES = ['open', 'invalid', 'stale', 'resolved_documented'];

export function bumpSemver(version, bump) {
  const raw = String(version || '0.0.0').trim();
  const match = raw.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) throw new Error(`Invalid semver: ${version}`);
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (bump === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === 'minor') {
    minor += 1;
    patch = 0;
  } else if (bump === 'patch') {
    patch += 1;
  } else {
    throw new Error(`Unknown bump: ${bump} (use patch|minor|major)`);
  }
  return `${major}.${minor}.${patch}`;
}

export function describeBumpPolicy() {
  return {
    patch: 'Correction de valeur, traduction ou portion sans changement de schéma.',
    minor: 'Nouveaux aliments, nouveaux profils ou nouvelle catégorie compatible.',
    major: 'Changement incompatible du schéma ou de la logique des équivalents.',
  };
}

function assertAppendOnly(label, foodId, currentList, incomingList, errors) {
  const cur = Array.isArray(currentList) ? currentList : [];
  const next = Array.isArray(incomingList) ? incomingList : [];
  if (next.length < cur.length) {
    errors.push(`${label} tronqué pour ${foodId}: ${cur.length} → ${next.length}`);
    return;
  }
  for (let i = 0; i < cur.length; i += 1) {
    if (stableStringify(cur[i]) !== stableStringify(next[i])) {
      errors.push(`${label} modifié (non append-only) pour ${foodId} à l’index ${i}`);
      return;
    }
  }
}

/**
 * Governance checks when applying an exported dataset over the current base.
 */
export function assertApplyGovernance(currentPayload, incomingPayload, options = {}) {
  const errors = [];
  const warnings = [];
  const currentFoods = currentPayload?.foods || [];
  const incomingFoods = incomingPayload?.foods || [];
  const currentById = new Map(currentFoods.map((f) => [f.id, f]));
  const currentHash = computeFoodsDataHash(currentFoods);
  const incomingMeta = incomingPayload?.meta || {};
  const baseDataHash = incomingMeta.baseDataHash || null;
  const exportDataHash = incomingMeta.exportDataHash || null;
  const actualIncomingHash = computeFoodsDataHash(incomingFoods);
  const allowStale = Boolean(options.allowStale);
  const staleReason = String(options.staleReason || '').trim();
  const migrationDocumented = Boolean(options.migrationDocumented);

  // EXPORT_HASH_MISMATCH — never bypassed by --allow-stale
  if (!exportDataHash) {
    errors.push('EXPORT_HASH_MISMATCH: meta.exportDataHash manquant');
  } else if (exportDataHash !== actualIncomingHash) {
    errors.push(
      `EXPORT_HASH_MISMATCH: meta.exportDataHash=${shortHash(exportDataHash)} ≠ hash des foods entrants=${shortHash(
        actualIncomingHash
      )}. Réexportez depuis l’UI ou documentez une migration.`
    );
  }

  if (!baseDataHash) {
    if (!allowStale) {
      errors.push(
        'Export périmé ou incomplet: meta.baseDataHash manquant. Réexportez depuis une base à jour, ou utilisez --allow-stale --reason "…".'
      );
    } else if (!staleReason) {
      errors.push('--allow-stale exige --reason "…"');
    } else {
      warnings.push(`Applying without baseDataHash (--allow-stale): ${staleReason}`);
    }
  } else if (baseDataHash !== currentHash) {
    if (!allowStale) {
      errors.push(
        `Fichier périmé: meta.baseDataHash=${shortHash(baseDataHash)} ≠ hash actuel de la base=${shortHash(
          currentHash
        )}. Ne pas écraser une base plus récente. Réexportez depuis la base courante, ou --allow-stale --reason "…".`
      );
    } else if (!staleReason) {
      errors.push('--allow-stale exige --reason "…"');
    } else {
      warnings.push(
        `MAJOR WARNING: applying stale export (base ${shortHash(baseDataHash)} vs current ${shortHash(
          currentHash
        )}): ${staleReason}`
      );
    }
  }

  // Meta dates when present
  if (incomingMeta.exportedAt != null && incomingMeta.exportedAt !== '') {
    if (!isValidIsoDateTime(incomingMeta.exportedAt) && !isValidApprovedAt(incomingMeta.exportedAt)) {
      errors.push(`exportedAt invalide: ${incomingMeta.exportedAt}`);
    }
  }
  if (incomingMeta.lastAppliedAt != null && incomingMeta.lastAppliedAt !== '') {
    if (
      !isValidIsoDateTime(incomingMeta.lastAppliedAt) &&
      !isValidApprovedAt(incomingMeta.lastAppliedAt)
    ) {
      errors.push(`lastAppliedAt invalide: ${incomingMeta.lastAppliedAt}`);
    }
  }

  for (const incoming of incomingFoods) {
    const current = currentById.get(incoming.id);
    if (!current) continue;

    const curVer = Number.isInteger(current.version) ? current.version : 1;
    const nextVer = Number.isInteger(incoming.version) ? incoming.version : 1;
    if (nextVer < curVer) {
      errors.push(`Version diminuée pour ${incoming.id}: ${curVer} → ${nextVer}`);
    }

    const curHist = Array.isArray(current.history) ? current.history : [];
    const nextHist = Array.isArray(incoming.history) ? incoming.history : [];
    assertAppendOnly('Historique', incoming.id, curHist, nextHist, errors);

    const curRes = Array.isArray(current.auditResolutions) ? current.auditResolutions : [];
    const nextRes = Array.isArray(incoming.auditResolutions) ? incoming.auditResolutions : [];
    assertAppendOnly('auditResolutions', incoming.id, curRes, nextRes, errors);

    if (nextRes.length > curRes.length && nextVer <= curVer) {
      errors.push(
        `Résolution ajoutée sans augmentation de version pour ${incoming.id} (v${curVer})`
      );
    }
    if (nextRes.length > curRes.length && nextHist.length <= curHist.length) {
      errors.push(`Résolution ajoutée sans entrée history pour ${incoming.id}`);
    }

    for (const err of collectVerificationIntegrityErrors(incoming)) {
      errors.push(`${err.code}: ${incoming.id}: ${err.message}`);
    }

    const curWasVerified = isVerifiedFood(current);
    if (curWasVerified && getFoodStatus(incoming) !== 'verified') {
      const preserved = nextHist
        .slice(curHist.length)
        .some((h) => h?.previousVerification || h?.action === 'auto_unverify');
      if (!preserved) {
        errors.push(`Vérification antérieure disparue pour ${incoming.id}`);
      }
    }

    const materialChanged = materialDataSnapshot(current) !== materialDataSnapshot(incoming);
    const adminOrResolutionChanged =
      stableStringify({
        status: current.status,
        verification: current.verification,
        auditResolutions: current.auditResolutions || [],
      }) !==
      stableStringify({
        status: incoming.status,
        verification: incoming.verification,
        auditResolutions: incoming.auditResolutions || [],
      });

    if (materialChanged && nextVer === curVer && !migrationDocumented) {
      errors.push(
        `Modification de données sans progression de version pour ${incoming.id} (v${curVer}). Documentez une migration ou incrémentez food.version.`
      );
    }
    if (adminOrResolutionChanged && nextVer === curVer && !migrationDocumented && !materialChanged) {
      // version bump still required when status/verification/resolutions change without material
      if (nextRes.length > curRes.length || getFoodStatus(current) !== getFoodStatus(incoming)) {
        // covered by resolution / other rules; soft: require version for status flips
      }
    }

    // Verified material change must unverify OR re-verify in-transaction.
    // --migration-documented must NOT bypass this rule.
    if (curWasVerified && materialChanged) {
      if (isVerifiedFood(incoming)) {
        const reverifyOk =
          nextVer > curVer &&
          hasPostMaterialReverify(current, incoming) &&
          isMeaningfulString(incoming.verification?.verifiedBy) &&
          isMeaningfulString(incoming.verification?.datasetVersion, { minLength: 1 }) &&
          isValidIsoDateTime(incoming.verification?.verifiedAt);
        if (!reverifyOk) {
          errors.push(
            `VERIFIED_MATERIAL_CHANGE_WITHOUT_REVERIFY: ${incoming.id} — modification matérielle d’un aliment verified sans unverified ni nouvelle vérification`
          );
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    currentHash,
    baseDataHash,
    exportDataHash,
    actualIncomingHash,
  };
}

export async function sha256Hex(text) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const nodeCrypto = await import('crypto');
  return nodeCrypto.createHash('sha256').update(text).digest('hex');
}
