/**
 * Group statistics — averages are diagnostic only; never auto-approve profiles.
 */

import { getFoodStatus, isActiveFood, isRejectedFood, isVerifiedFood } from './food-status.mjs';
import { auditFood } from './food-audit-core.mjs';

export function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function stddev(values) {
  if (values.length < 2) return null;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function nutrientSeries(foods, key) {
  return foods
    .map((f) => f.nutrients?.[key])
    .filter((v) => typeof v === 'number' && Number.isFinite(v));
}

export function summarize(values) {
  if (!values.length) {
    return { mean: null, median: null, min: null, max: null, stddev: null, count: 0 };
  }
  return {
    mean: mean(values),
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
    stddev: stddev(values),
    count: values.length,
  };
}

export function distanceFromProfile(food, profile, tolerances) {
  const keys = [
    ['proteinG', 'proteinG'],
    ['carbsG', 'carbsG'],
    ['fiberG', 'fiberG'],
    ['fatG', 'fatG'],
    ['declaredKcal', 'kcal'],
  ];
  let score = 0;
  let used = 0;
  const breaches = [];
  for (const [foodKey, profileKey] of keys) {
    const v = food.nutrients?.[foodKey === 'declaredKcal' ? 'declaredKcal' : foodKey];
    const target = profile?.[profileKey];
    const tol = tolerances?.[profileKey] ?? tolerances?.[foodKey] ?? null;
    if (typeof v !== 'number' || target == null || !Number.isFinite(Number(target))) continue;
    const abs = Math.abs(v - Number(target));
    const denom = Math.max(Math.abs(Number(target)), Number(tol) || 1, 1);
    score += abs / denom;
    used += 1;
    if (tol != null && abs > Number(tol)) {
      breaches.push({ nutrient: foodKey, value: v, target: Number(target), tolerance: Number(tol), absDiff: abs });
    }
  }
  return { score: used ? score / used : 0, breaches };
}

function defaultCriteria(groupMeta) {
  return {
    minVerifiedCount: null,
    minCoveragePercent: 100,
    requireAllActiveFoodsVerified: true,
    requireNoFoodsOutsideTolerance: false,
    ...(groupMeta?.approvalCriteria || {}),
  };
}

/**
 * @param {string} calculationGroup
 * @param {Array<object>} foods
 * @param {object} [groupMeta]
 * @param {object} [datasetVersion]
 */
export function calculateGroupStatistics(calculationGroup, foods, groupMeta = null, datasetVersion = null) {
  const groupFoods = (foods || []).filter((f) => f.calculationGroup === calculationGroup);
  const active = groupFoods.filter((f) => isActiveFood(f));
  const verified = active.filter((f) => isVerifiedFood(f));
  const rejected = groupFoods.filter((f) => isRejectedFood(f));
  const pending = active.filter((f) => !isVerifiedFood(f));
  const criteria = defaultCriteria(groupMeta);

  const profile = groupMeta?.referenceProfile || null;
  const hasProfileValues =
    profile && ['proteinG', 'carbsG', 'fatG', 'kcal'].some((k) => profile[k] != null);
  const profileApproved = !!(groupMeta && groupMeta.approved === true && hasProfileValues);
  const datasetApproved = datasetVersion?.status === 'approved';

  const coveragePercent = active.length ? (verified.length / active.length) * 100 : 0;

  const foodsOutsideTolerance = [];
  if (profileApproved && hasProfileValues) {
    const tol = groupMeta.tolerances || {};
    for (const f of verified) {
      const d = distanceFromProfile(f, profile, tol);
      if (d.breaches.length) {
        foodsOutsideTolerance.push({
          id: f.id,
          nameFr: f.names?.fr,
          nameEn: f.names?.en,
          distanceScore: d.score,
          breaches: d.breaches,
        });
      }
    }
  }

  const activeWithBlockingErrors = active.filter((f) => {
    const r = auditFood(f);
    return r.errorCount > 0;
  });

  let approved = false;
  let message = 'Profil d’échange non approuvé';
  let messageEn = 'Exchange profile not approved';
  const blockers = [];

  if (!hasProfileValues || !profileApproved) {
    blockers.push('reference_profile_not_approved');
  }
  if (!datasetApproved) blockers.push('dataset_not_approved');
  if (criteria.minVerifiedCount == null) {
    blockers.push('minVerifiedCount_null');
  } else if (verified.length < Number(criteria.minVerifiedCount)) {
    blockers.push('minVerifiedCount_not_met');
  }
  if (coveragePercent < Number(criteria.minCoveragePercent ?? 100)) {
    blockers.push('minCoveragePercent_not_met');
  }
  if (criteria.requireAllActiveFoodsVerified && pending.length > 0) {
    blockers.push('active_foods_not_all_verified');
  }
  if (activeWithBlockingErrors.length > 0) {
    blockers.push('active_foods_have_blocking_errors');
  }
  if (criteria.requireNoFoodsOutsideTolerance && foodsOutsideTolerance.length > 0) {
    blockers.push('foods_outside_tolerance');
  }

  if (blockers.length === 0) {
    approved = true;
    message = null;
    messageEn = null;
  } else if (blockers.includes('reference_profile_not_approved')) {
    message = 'Profil d’échange non approuvé';
    messageEn = 'Exchange profile not approved';
  } else if (blockers.includes('minVerifiedCount_null')) {
    message = 'Critère minVerifiedCount non défini — groupe non approuvé';
    messageEn = 'minVerifiedCount not set — group not approved';
  } else if (blockers.includes('dataset_not_approved')) {
    message = 'Jeu de données non approuvé';
    messageEn = 'Dataset not approved';
  } else {
    message = 'Critères d’approbation du groupe non atteints';
    messageEn = 'Group approval criteria not met';
  }

  const stats = {
    calculationGroup,
    approved,
    message,
    messageEn,
    approvalBlockers: blockers,
    approvalCriteria: criteria,
    totalFoodsInGroup: groupFoods.length,
    activeFoodCount: active.length,
    verifiedCount: verified.length,
    rejectedCount: rejected.length,
    pendingCount: pending.length,
    coveragePercent,
    proteinG: summarize(nutrientSeries(verified, 'proteinG')),
    carbsG: summarize(nutrientSeries(verified, 'carbsG')),
    fiberG: summarize(nutrientSeries(verified, 'fiberG')),
    fatG: summarize(nutrientSeries(verified, 'fatG')),
    kcal: summarize(nutrientSeries(verified, 'declaredKcal')),
    referenceProfile: profile,
    referenceProfileApproved: profileApproved,
    foodsOutsideTolerance,
    furthestFoods: [],
  };

  if (verified.length) {
    const means = {
      proteinG: stats.proteinG.mean,
      carbsG: stats.carbsG.mean,
      fiberG: stats.fiberG.mean,
      fatG: stats.fatG.mean,
      kcal: stats.kcal.mean,
    };
    const scored = verified.map((f) => {
      const d = distanceFromProfile(f, profileApproved ? profile : means, groupMeta?.tolerances || {
        proteinG: 2,
        carbsG: 4,
        fiberG: 2,
        fatG: 2,
        kcal: 15,
      });
      return {
        id: f.id,
        nameFr: f.names?.fr,
        nameEn: f.names?.en,
        distanceScore: d.score,
        breaches: d.breaches,
        status: getFoodStatus(f),
      };
    });
    stats.furthestFoods = [...scored].sort((a, b) => b.distanceScore - a.distanceScore).slice(0, 5);
  }

  return stats;
}

export function calculateAllGroupStatistics(foods, groupsDoc, datasetVersion = null) {
  const groups = groupsDoc?.groups || [];
  const out = {};
  for (const g of groups) {
    out[g.id] = calculateGroupStatistics(g.id, foods, g, datasetVersion);
  }
  return out;
}
