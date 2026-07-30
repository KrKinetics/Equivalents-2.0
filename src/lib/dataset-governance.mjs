/**
 * Dataset versioning + apply governance checks (stale export, history, version).
 */

import { computeFoodsDataHash, shortHash } from './data-hash.mjs';
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
  const allowStale = Boolean(options.allowStale);
  const staleReason = String(options.staleReason || '').trim();

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

  let migrationDocumented = Boolean(options.migrationDocumented);

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
    if (nextHist.length < curHist.length) {
      errors.push(`Historique tronqué pour ${incoming.id}: ${curHist.length} → ${nextHist.length}`);
    }

    const curWasVerified =
      getFoodStatus(current) === 'verified' ||
      curHist.some((h) => h?.action === 'verify' || h?.oldValue === 'verified' || h?.newValue === 'verified');
    const nextHasVerificationTrace =
      getFoodStatus(incoming) === 'verified' ||
      (incoming.verification &&
        (incoming.verification.verifiedAt || incoming.verification.verifiedBy)) ||
      nextHist.some(
        (h) =>
          h?.action === 'verify' ||
          h?.action === 'auto_unverify' ||
          h?.previousVerification ||
          h?.oldValue === 'verified' ||
          h?.newValue === 'verified'
      );
    if (curWasVerified && !nextHasVerificationTrace && getFoodStatus(incoming) !== 'verified') {
      // Allow if history preserved auto_unverify / previous verification
      const preserved = nextHist.some((h) => h?.previousVerification || h?.action === 'auto_unverify');
      if (!preserved && curHist.some((h) => h?.action === 'verify')) {
        errors.push(`Vérification antérieure disparue pour ${incoming.id}`);
      }
    }

    const materialChanged =
      JSON.stringify({
        names: current.names,
        portion: current.portion,
        nutrients: current.nutrients,
        source: current.source,
        displayCategory: current.displayCategory,
        calculationGroup: current.calculationGroup,
        exchangeProfileId: current.exchangeProfileId,
        classificationStatus: current.classificationStatus,
        status: current.status,
        verification: current.verification,
      }) !==
      JSON.stringify({
        names: incoming.names,
        portion: incoming.portion,
        nutrients: incoming.nutrients,
        source: incoming.source,
        displayCategory: incoming.displayCategory,
        calculationGroup: incoming.calculationGroup,
        exchangeProfileId: incoming.exchangeProfileId,
        classificationStatus: incoming.classificationStatus,
        status: incoming.status,
        verification: incoming.verification,
      });

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
    exportDataHash: incomingMeta.exportDataHash || null,
  };
}

export async function sha256Hex(text) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Node fallback
  const nodeCrypto = await import('crypto');
  return nodeCrypto.createHash('sha256').update(text).digest('hex');
}
