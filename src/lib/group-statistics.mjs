/**
 * Group statistics — averages are diagnostic only; never auto-approve profiles.
 */

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stddev(values) {
  if (values.length < 2) return null;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function nutrientSeries(foods, key) {
  return foods
    .map((f) => f.nutrients?.[key])
    .filter((v) => typeof v === 'number' && Number.isFinite(v));
}

function summarize(values) {
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

/**
 * Distance using profile tolerances; handles zero targets safely.
 */
function distanceFromProfile(food, profile, tolerances) {
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

/**
 * @param {string} calculationGroup
 * @param {Array<object>} foods
 * @param {object} [groupMeta] from calculation-groups.json entry
 * @param {object} [datasetVersion]
 */
export function calculateGroupStatistics(calculationGroup, foods, groupMeta = null, datasetVersion = null) {
  const groupFoods = (foods || []).filter((f) => f.calculationGroup === calculationGroup);
  const active = groupFoods.filter((f) => f.status !== 'rejected');
  const verified = active.filter((f) => f.status === 'verified' || f.verification?.status === 'verified');
  const rejected = groupFoods.filter((f) => f.status === 'rejected');
  const pending = active.filter((f) => f.status !== 'verified' && f.verification?.status !== 'verified');

  const profileApproved = !!(groupMeta && groupMeta.approved === true && groupMeta.referenceProfile);
  const profile = groupMeta?.referenceProfile || null;
  const hasProfileValues =
    profile &&
    ['proteinG', 'carbsG', 'fatG', 'kcal'].some((k) => profile[k] != null);

  const datasetApproved = datasetVersion?.status === 'approved';

  // Never approved merely because verifiedCount > 0
  let approved = false;
  let message = 'Profil d’échange non approuvé';
  let messageEn = 'Exchange profile not approved';

  if (!hasProfileValues || !profileApproved) {
    approved = false;
    message = 'Profil d’échange non approuvé';
    messageEn = 'Exchange profile not approved';
  } else if (!datasetApproved) {
    approved = false;
    message = 'Jeu de données non approuvé';
    messageEn = 'Dataset not approved';
  } else if (verified.length === 0) {
    approved = false;
    message = 'Données en cours de validation';
    messageEn = 'Data pending validation';
  } else {
    approved = true;
    message = null;
    messageEn = null;
  }

  const stats = {
    calculationGroup,
    approved,
    message,
    messageEn,
    totalFoodsInGroup: groupFoods.length,
    activeFoodCount: active.length,
    verifiedCount: verified.length,
    rejectedCount: rejected.length,
    pendingCount: pending.length,
    coveragePercent: active.length ? (verified.length / active.length) * 100 : 0,
    proteinG: summarize(nutrientSeries(verified, 'proteinG')),
    carbsG: summarize(nutrientSeries(verified, 'carbsG')),
    fiberG: summarize(nutrientSeries(verified, 'fiberG')),
    fatG: summarize(nutrientSeries(verified, 'fatG')),
    kcal: summarize(nutrientSeries(verified, 'declaredKcal')),
    referenceProfile: profile,
    referenceProfileApproved: profileApproved,
    foodsOutsideTolerance: [],
    furthestFoods: [],
  };

  if (profileApproved && hasProfileValues) {
    const tol = groupMeta.tolerances || {};
    const scored = verified.map((f) => {
      const d = distanceFromProfile(f, profile, tol);
      return {
        id: f.id,
        nameFr: f.names?.fr,
        nameEn: f.names?.en,
        distanceScore: d.score,
        breaches: d.breaches,
      };
    });
    stats.foodsOutsideTolerance = scored.filter((s) => s.breaches.length > 0);
    stats.furthestFoods = [...scored].sort((a, b) => b.distanceScore - a.distanceScore).slice(0, 5);
  } else if (verified.length) {
    // Diagnostic dispersion vs verified means, with zero-safe denom
    const means = {
      proteinG: stats.proteinG.mean,
      carbsG: stats.carbsG.mean,
      fiberG: stats.fiberG.mean,
      fatG: stats.fatG.mean,
      kcal: stats.kcal.mean,
    };
    const scored = verified.map((f) => {
      const d = distanceFromProfile(
        f,
        means,
        { proteinG: 2, carbsG: 4, fiberG: 2, fatG: 2, kcal: 15 }
      );
      return {
        id: f.id,
        nameFr: f.names?.fr,
        nameEn: f.names?.en,
        distanceScore: d.score,
        breaches: d.breaches,
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
