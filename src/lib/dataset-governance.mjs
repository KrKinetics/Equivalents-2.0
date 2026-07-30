/**
 * Dataset versioning + apply governance checks (stale export, history, version).
 */

import { computeFoodsDataHash, shortHash, stableStringify } from './data-hash.mjs';
import { getFoodStatus } from './food-status.mjs';
import { validateReviewImport } from './review-import.mjs';

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
      errors.push(
        `${label} modifié (non append-only) pour ${foodId} à l’index ${i}`
      );
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
      errors.push(
        `Résolution ajoutée sans entrée history pour ${incoming.id}`
      );
    }

    const curWasVerified =
      getFoodStatus(current) === 'verified' ||
      curHist.some((h) => h?.action === 'verify' || h?.oldValue === 'verified' || h?.newValue === 'verified');
    if (curWasVerified && getFoodStatus(incoming) !== 'verified') {
      const preserved = nextHist.some((h) => h?.previousVerification || h?.action === 'auto_unverify');
      const hadVerify = curHist.some((h) => h?.action === 'verify');
      if (hadVerify && !preserved) {
        errors.push(`Vérification antérieure disparue pour ${incoming.id}`);
      }
    }

    const materialSnapshot = (food) =>
      stableStringify({
        names: food.names,
        portion: food.portion,
        nutrients: food.nutrients,
        source: food.source,
        displayCategory: food.displayCategory,
        calculationGroup: food.calculationGroup,
        exchangeProfileId: food.exchangeProfileId,
        classificationStatus: food.classificationStatus,
        status: food.status,
        verification: food.verification,
        auditResolutions: food.auditResolutions || [],
      });

    const materialChanged = materialSnapshot(current) !== materialSnapshot(incoming);
    if (materialChanged && nextVer === curVer && !migrationDocumented) {
      errors.push(
        `Modification de données sans progression de version pour ${incoming.id} (v${curVer}). Documentez une migration ou incrémentez food.version.`
      );
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
