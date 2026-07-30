/**
 * Canonical food status helpers.
 * verification.status is canonical; food.status must mirror it.
 */

import { FOOD_STATUSES } from './nutrition-constants.mjs';

export function getFoodStatus(food) {
  if (!food) return 'unverified';
  if (food.verification && food.verification.status) return food.verification.status;
  if (food.status) return food.status;
  return 'unverified';
}

/**
 * Sets both verification.status and food.status to the same value.
 * Does not silently heal an imported mismatch — callers that load data
 * must audit STATUS_MISMATCH before mutate.
 */
export function setFoodStatus(food, status) {
  if (!FOOD_STATUSES.includes(status)) {
    throw new Error(`Invalid food status: ${status}`);
  }
  if (!food.verification || typeof food.verification !== 'object') {
    food.verification = {
      status,
      verifiedAt: null,
      verifiedBy: null,
      datasetVersion: null,
    };
  } else {
    food.verification.status = status;
  }
  food.status = status;
  if (status !== 'verified') {
    food.verification.verifiedAt = null;
    food.verification.verifiedBy = null;
  }
  return food;
}

export function hasStatusMismatch(food) {
  if (!food) return false;
  if (!food.verification || food.verification.status == null) {
    // Missing verification is a structural/schema issue, not STATUS_MISMATCH alone
    return false;
  }
  return food.status !== food.verification.status;
}

export function isVerifiedFood(food) {
  return getFoodStatus(food) === 'verified';
}

export function isRejectedFood(food) {
  return getFoodStatus(food) === 'rejected';
}

export function isActiveFood(food) {
  return getFoodStatus(food) !== 'rejected';
}
