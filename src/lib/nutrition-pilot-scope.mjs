/**
 * Nutrition pilot scope guard.
 *
 * Hash definitions (foods always sorted by id before hashing):
 * - datasetHash: SHA-256 of stableStringify(all foods) via computeFoodsDataHash
 * - protectedFoodsDataHash: SHA-256 of stableStringify(full food objects for every
 *   non-pilot food). Same algorithm as computeFoodsDataHash on that subset.
 * - protectedFoodsNutritionHash: SHA-256 of stableStringify([{ id, portion, nutrients }])
 *   for every non-pilot food (nutrition + portion only).
 */

import crypto from 'crypto';
import { computeFoodsDataHash, stableStringify } from './data-hash.mjs';

export const PILOT_ACTIVE_STATUSES = new Set(['prepared', 'active']);

export const DEFAULT_ALLOWED_FOOD_IDS = Object.freeze([
  'fruits-blueberries',
  'noix-graines-almonds',
  'feculents-cooked-quinoa',
  'viandes-volaille-chicken-breast',
  'autres-sources-proteinees-core-power-fairlife',
  'autres-sources-proteinees-core-power-fairlife-elite-vanilla-42g',
]);

export function sortFoodsById(foods) {
  return [...(foods || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function partitionPilotFoods(foods, allowedFoodIds = DEFAULT_ALLOWED_FOOD_IDS) {
  const allowed = new Set(allowedFoodIds);
  const pilotFoods = [];
  const protectedFoods = [];
  for (const food of foods || []) {
    if (allowed.has(food.id)) pilotFoods.push(food);
    else protectedFoods.push(food);
  }
  return {
    allowedFoodIds: [...allowedFoodIds],
    pilotFoods: sortFoodsById(pilotFoods),
    protectedFoods: sortFoodsById(protectedFoods),
  };
}

export function nutritionSnapshot(food) {
  return {
    id: food?.id ?? null,
    portion: food?.portion ?? null,
    nutrients: food?.nutrients ?? null,
  };
}

export function computeProtectedFoodsDataHash(protectedFoods) {
  return computeFoodsDataHash(sortFoodsById(protectedFoods));
}

export function computeProtectedFoodsNutritionHash(protectedFoods) {
  const snapshots = sortFoodsById(protectedFoods).map(nutritionSnapshot);
  return crypto.createHash('sha256').update(stableStringify(snapshots)).digest('hex');
}

export function buildPilotBaseline(foods, allowedFoodIds = DEFAULT_ALLOWED_FOOD_IDS) {
  const { protectedFoods } = partitionPilotFoods(foods, allowedFoodIds);
  return {
    datasetHash: computeFoodsDataHash(foods),
    protectedFoodCount: protectedFoods.length,
    protectedFoodsDataHash: computeProtectedFoodsDataHash(protectedFoods),
    protectedFoodsNutritionHash: computeProtectedFoodsNutritionHash(protectedFoods),
  };
}

export function summarizePilotOpenAlerts(foodReports) {
  const totalOpenErrors = (foodReports || []).reduce(
    (sum, food) => sum + Number(food?.readiness?.openErrorCount || 0),
    0
  );
  const foodsWithOpenErrors = (foodReports || []).filter(
    (food) => Number(food?.readiness?.openErrorCount || 0) > 0
  ).length;
  const foodsWithoutOpenErrors = (foodReports || []).length - foodsWithOpenErrors;
  const totalWarnings = (foodReports || []).reduce((sum, food) => {
    const alerts = Array.isArray(food?.alerts) ? food.alerts : [];
    return sum + alerts.filter((alert) => alert?.severity === 'WARNING').length;
  }, 0);
  return {
    totalOpenErrors,
    foodsWithOpenErrors,
    foodsWithoutOpenErrors,
    totalWarnings,
  };
}

function classifyProtectedDiff(currentFood, candidateFood) {
  const kinds = [];
  if (stableStringify(currentFood?.nutrients) !== stableStringify(candidateFood?.nutrients)) {
    kinds.push('nutrients');
  }
  if (stableStringify(currentFood?.portion) !== stableStringify(candidateFood?.portion)) {
    kinds.push('portion');
  }
  if (stableStringify(currentFood?.source) !== stableStringify(candidateFood?.source)) {
    kinds.push('source');
  }
  if (
    currentFood?.status !== candidateFood?.status ||
    stableStringify(currentFood?.verification) !== stableStringify(candidateFood?.verification)
  ) {
    kinds.push('status');
  }
  if (stableStringify(currentFood?.names) !== stableStringify(candidateFood?.names)) {
    kinds.push('names');
  }
  if (!kinds.length && stableStringify(currentFood) !== stableStringify(candidateFood)) {
    kinds.push('other');
  }
  return kinds;
}

/**
 * Compare current pilot base against a candidate export.
 * Refuses any change outside allowedFoodIds, including add/remove of foods.
 */
export function checkPilotCandidateScope(currentPayload, candidatePayload, config) {
  const errors = [];
  const changes = [];
  const allowedFoodIds = config?.allowedFoodIds || DEFAULT_ALLOWED_FOOD_IDS;
  const allowed = new Set(allowedFoodIds);
  const currentFoods = currentPayload?.foods || [];
  const candidateFoods = candidatePayload?.foods || [];
  const currentById = new Map(currentFoods.map((food) => [food.id, food]));
  const candidateById = new Map(candidateFoods.map((food) => [food.id, food]));

  if (allowedFoodIds.length < 1) {
    errors.push(`allowedFoodIds must contain at least 1 id (got ${allowedFoodIds.length})`);
  }
  for (const id of allowedFoodIds) {
    // Allowed IDs may be new adds that are absent from the current base.
    if (!candidateById.has(id) && currentById.has(id)) {
      errors.push(`Allowed pilot id missing from candidate: ${id}`);
    }
  }

  for (const [id, currentFood] of currentById) {
    if (allowed.has(id)) continue;
    const candidateFood = candidateById.get(id);
    if (!candidateFood) {
      errors.push(`Protected food removed: ${id}`);
      changes.push({ id, kinds: ['removed'] });
      continue;
    }
    if (stableStringify(currentFood) !== stableStringify(candidateFood)) {
      const kinds = classifyProtectedDiff(currentFood, candidateFood);
      errors.push(`Protected food modified (${kinds.join(', ') || 'other'}): ${id}`);
      changes.push({ id, kinds });
    }
  }

  for (const id of candidateById.keys()) {
    if (!currentById.has(id)) {
      if (allowed.has(id)) {
        changes.push({ id, kinds: ['added-allowed'] });
        continue;
      }
      errors.push(`Food added outside pilot scope: ${id}`);
      changes.push({ id, kinds: ['added'] });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    changes,
  };
}

/**
 * Verify live dataset against config baseline for protected foods.
 */
export function checkPilotBaseline(payload, config) {
  const errors = [];
  const foods = payload?.foods || [];
  const allowedFoodIds = config?.allowedFoodIds || DEFAULT_ALLOWED_FOOD_IDS;
  const { pilotFoods, protectedFoods } = partitionPilotFoods(foods, allowedFoodIds);
  const byId = new Map(foods.map((food) => [food.id, food]));

  if (!Array.isArray(allowedFoodIds) || allowedFoodIds.length < 1) {
    errors.push('allowedFoodIds must be a non-empty array');
  }
  // Allowed IDs may include a pending add that is not yet present.
  for (const id of allowedFoodIds) {
    if (!byId.has(id)) continue;
  }
  if (pilotFoods.length > allowedFoodIds.length) {
    errors.push(
      `More pilot foods present (${pilotFoods.length}) than allowed (${allowedFoodIds.length})`
    );
  }

  const expectedProtected = Number(config?.protectedFoodCount ?? 202);
  if (protectedFoods.length !== expectedProtected) {
    errors.push(
      `Protected food count mismatch: expected ${expectedProtected}, found ${protectedFoods.length}`
    );
  }

  const actual = buildPilotBaseline(foods, allowedFoodIds);
  const baseline = config?.baseline || {};
  if (baseline.datasetHash && baseline.datasetHash !== actual.datasetHash) {
    // Dataset hash may change when pilot foods change; only fail protected hashes
    // unless the caller is checking a locked baseline with no pilot edits yet.
  }
  if (baseline.protectedFoodsDataHash !== actual.protectedFoodsDataHash) {
    errors.push(
      `protectedFoodsDataHash mismatch: baseline=${baseline.protectedFoodsDataHash} actual=${actual.protectedFoodsDataHash}`
    );
  }
  if (baseline.protectedFoodsNutritionHash !== actual.protectedFoodsNutritionHash) {
    errors.push(
      `protectedFoodsNutritionHash mismatch: baseline=${baseline.protectedFoodsNutritionHash} actual=${actual.protectedFoodsNutritionHash}`
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    actual,
    protectedFoodIds: protectedFoods.map((food) => food.id),
  };
}

export function isPilotGuardActive(config) {
  return PILOT_ACTIVE_STATUSES.has(config?.status);
}
