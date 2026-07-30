/**
 * Unique statistics engine for calculation groups.
 * Only verified foods contribute to approved averages.
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
    return {
      mean: null,
      median: null,
      min: null,
      max: null,
      stddev: null,
      count: 0,
    };
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

function distanceFromMeans(food, means) {
  const keys = [
    ['proteinG', means.proteinG.mean],
    ['carbsG', means.carbsG.mean],
    ['fiberG', means.fiberG.mean],
    ['fatG', means.fatG.mean],
    ['declaredKcal', means.kcal.mean],
  ];
  let score = 0;
  let used = 0;
  for (const [key, m] of keys) {
    const v = food.nutrients?.[key === 'declaredKcal' ? 'declaredKcal' : key];
    if (typeof v === 'number' && typeof m === 'number' && m !== 0) {
      score += Math.abs(v - m) / Math.abs(m);
      used += 1;
    }
  }
  return used ? score / used : 0;
}

/**
 * @param {string} calculationGroup
 * @param {Array<object>} foods all foods from food-equivalents.json
 * @returns {object}
 */
export function calculateGroupStatistics(calculationGroup, foods) {
  const groupFoods = (foods || []).filter((f) => f.calculationGroup === calculationGroup);
  const verified = groupFoods.filter((f) => f.status === 'verified');

  if (!verified.length) {
    return {
      calculationGroup,
      approved: false,
      message: 'Données en cours de validation',
      messageEn: 'Data pending validation',
      totalFoodsInGroup: groupFoods.length,
      verifiedCount: 0,
      proteinG: summarize([]),
      carbsG: summarize([]),
      fiberG: summarize([]),
      fatG: summarize([]),
      kcal: summarize([]),
      furthestFoods: [],
    };
  }

  const stats = {
    calculationGroup,
    approved: true,
    message: null,
    messageEn: null,
    totalFoodsInGroup: groupFoods.length,
    verifiedCount: verified.length,
    proteinG: summarize(nutrientSeries(verified, 'proteinG')),
    carbsG: summarize(nutrientSeries(verified, 'carbsG')),
    fiberG: summarize(nutrientSeries(verified, 'fiberG')),
    fatG: summarize(nutrientSeries(verified, 'fatG')),
    kcal: summarize(nutrientSeries(verified, 'declaredKcal')),
  };

  const furthestFoods = verified
    .map((f) => ({
      id: f.id,
      nameFr: f.names?.fr,
      nameEn: f.names?.en,
      distanceScore: distanceFromMeans(f, stats),
    }))
    .sort((a, b) => b.distanceScore - a.distanceScore)
    .slice(0, 5);

  return { ...stats, furthestFoods };
}

export function calculateAllGroupStatistics(foods, groupIds) {
  const ids = groupIds || ['protein', 'starch', 'vegetable', 'fruit', 'dairy', 'fat', 'whey'];
  const out = {};
  for (const id of ids) out[id] = calculateGroupStatistics(id, foods);
  return out;
}
