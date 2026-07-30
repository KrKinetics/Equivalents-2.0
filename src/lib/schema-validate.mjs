/**
 * Lightweight schema validation (no external deps).
 * Mirrors food-equivalents.schema.json required rules.
 */

import {
  CALCULATION_GROUPS,
  CLASSIFICATION_STATUSES,
  DISPLAY_CATEGORIES,
  FOOD_STATUSES,
  PORTION_UNITS,
  PREPARATION_STATES,
  SOURCE_TYPES,
} from './nutrition-constants.mjs';

function err(path, message) {
  return { path, message };
}

export function validateFoodEquivalentsPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: [err('$', 'Payload must be an object')] };
  }
  if (!payload.meta || typeof payload.meta !== 'object') {
    errors.push(err('meta', 'meta is required'));
  } else {
    if (!Number.isInteger(payload.meta.schemaVersion) || payload.meta.schemaVersion < 1) {
      errors.push(err('meta.schemaVersion', 'schemaVersion must be a positive integer'));
    }
    if (!Number.isInteger(payload.meta.totalFoods) || payload.meta.totalFoods < 0) {
      errors.push(err('meta.totalFoods', 'totalFoods must be a non-negative integer'));
    }
  }
  if (!Array.isArray(payload.foods)) {
    errors.push(err('foods', 'foods must be an array'));
    return { ok: false, errors };
  }

  const ids = new Set();
  payload.foods.forEach((food, i) => {
    const p = `foods[${i}]`;
    if (!food || typeof food !== 'object') {
      errors.push(err(p, 'food must be an object'));
      return;
    }
    if (!food.id || typeof food.id !== 'string') errors.push(err(`${p}.id`, 'id required'));
    else if (ids.has(food.id)) errors.push(err(`${p}.id`, `duplicate id ${food.id}`));
    else ids.add(food.id);

    if (!DISPLAY_CATEGORIES.includes(food.displayCategory)) {
      errors.push(err(`${p}.displayCategory`, 'invalid displayCategory'));
    }
    if (!CALCULATION_GROUPS.includes(food.calculationGroup)) {
      errors.push(err(`${p}.calculationGroup`, 'invalid calculationGroup'));
    }
    if (!CLASSIFICATION_STATUSES.includes(food.classificationStatus || 'pending')) {
      errors.push(err(`${p}.classificationStatus`, 'invalid classificationStatus'));
    }
    if (!food.names?.fr || !food.names?.en) {
      errors.push(err(`${p}.names`, 'names.fr and names.en required'));
    }
    const portion = food.portion || {};
    if (!portion.labelFr || !portion.labelEn) {
      errors.push(err(`${p}.portion.labels`, 'labelFr and labelEn required'));
    }
    if (!(typeof portion.amount === 'number' && portion.amount > 0)) {
      errors.push(err(`${p}.portion.amount`, 'amount must be a positive number'));
    }
    if (!PORTION_UNITS.includes(portion.unit)) {
      errors.push(err(`${p}.portion.unit`, 'invalid unit'));
    }
    if (portion.grams != null && !(typeof portion.grams === 'number' && portion.grams > 0)) {
      errors.push(err(`${p}.portion.grams`, 'grams must be positive number or null'));
    }
    if (
      portion.preparationState != null &&
      !PREPARATION_STATES.includes(portion.preparationState)
    ) {
      errors.push(err(`${p}.portion.preparationState`, 'invalid preparationState'));
    }
    if (!food.nutrients || typeof food.nutrients !== 'object') {
      errors.push(err(`${p}.nutrients`, 'nutrients required'));
    }
    if (!FOOD_STATUSES.includes(food.status)) {
      errors.push(err(`${p}.status`, 'invalid status'));
    }
    if (!Number.isInteger(food.version) || food.version < 1) {
      errors.push(err(`${p}.version`, 'version must be positive integer'));
    }
    if (!food.verification || !FOOD_STATUSES.includes(food.verification.status)) {
      errors.push(err(`${p}.verification`, 'verification.status required/valid'));
    }
    if (!food.source || typeof food.source !== 'object') {
      errors.push(err(`${p}.source`, 'source object required'));
    } else if (food.source.type != null && !SOURCE_TYPES.includes(food.source.type)) {
      errors.push(err(`${p}.source.type`, 'invalid source.type'));
    }
    if (food.legacySource === undefined) {
      errors.push(err(`${p}.legacySource`, 'legacySource required (object or null)'));
    }
  });

  if (payload.meta && Number.isInteger(payload.meta.totalFoods) && payload.meta.totalFoods !== payload.foods.length) {
    errors.push(err('meta.totalFoods', `totalFoods (${payload.meta.totalFoods}) != foods.length (${payload.foods.length})`));
  }

  return { ok: errors.length === 0, errors };
}
