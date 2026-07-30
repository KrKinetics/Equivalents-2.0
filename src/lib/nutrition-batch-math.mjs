/**
 * Deterministic rounding and portion conversion for approved nutrition batches.
 */

export const MANUFACTURER_ERROR_CODES = {
  MANUFACTURER_CONVERSION_UNSUPPORTED: 'MANUFACTURER_CONVERSION_UNSUPPORTED',
  MANUFACTURER_LABEL_NUTRIENT_MISSING: 'MANUFACTURER_LABEL_NUTRIENT_MISSING',
  MANUFACTURER_UNKNOWN_COERCED_TO_ZERO: 'MANUFACTURER_UNKNOWN_COERCED_TO_ZERO',
  MANUFACTURER_CANONICAL_MISMATCH: 'MANUFACTURER_CANONICAL_MISMATCH',
};

const MANUFACTURER_NUTRIENT_KEYS = [
  'declaredKcal',
  'proteinG',
  'carbsG',
  'fiberG',
  'fatG',
  'saturatedFatG',
  'polyunsaturatedFatG',
  'monounsaturatedFatG',
];

export function roundMacro(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) < 0.05) return 0;
  return Math.round(n * 10) / 10;
}

export function roundKcal(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

export function normalizeManufacturerUnit(unit) {
  const raw = String(unit || '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
  const aliases = {
    g: 'g',
    gram: 'g',
    grams: 'g',
    ml: 'ml',
    milliliter: 'ml',
    milliliters: 'ml',
    millilitre: 'ml',
    millilitres: 'ml',
    scoop: 'scoop',
    scoops: 'scoop',
    tbsp: 'tbsp',
    tablespoon: 'tbsp',
    tablespoons: 'tbsp',
    'c à table': 'tbsp',
    'c a table': 'tbsp',
    wrap: 'wrap',
    wraps: 'wrap',
    bar: 'bar',
    bars: 'bar',
  };
  return aliases[raw] || raw;
}

function servingParts(servingOrAmount, fallbackUnit = null) {
  if (servingOrAmount != null && typeof servingOrAmount === 'object') {
    return {
      amount: Number(servingOrAmount.amount),
      unit: servingOrAmount.unit ?? fallbackUnit,
      grams:
        servingOrAmount.grams == null || servingOrAmount.grams === ''
          ? null
          : Number(servingOrAmount.grams),
    };
  }
  return {
    amount: Number(servingOrAmount),
    unit: fallbackUnit,
    grams: null,
  };
}

function scaleManufacturerNutrients(labelNutrients, factor, formula, meta = {}) {
  const derivedUnrounded = {};
  const storedRounded = {};
  const undeclaredNutrients = [];
  const declaredZeroNutrients = [];
  for (const key of MANUFACTURER_NUTRIENT_KEYS) {
    const sourceValue = labelNutrients?.[key];
    if (sourceValue == null) {
      derivedUnrounded[key] = null;
      storedRounded[key] = null;
      undeclaredNutrients.push(key);
      continue;
    }
    const n = Number(sourceValue);
    if (!Number.isFinite(n)) {
      return {
        ok: false,
        code: MANUFACTURER_ERROR_CODES.MANUFACTURER_LABEL_NUTRIENT_MISSING,
        message: `Manufacturer label nutrient ${key} is not a finite number`,
      };
    }
    if (n === 0) declaredZeroNutrients.push(key);
    const derived = n * factor;
    derivedUnrounded[key] = derived;
    storedRounded[key] = key === 'declaredKcal' ? roundKcal(derived) : roundMacro(derived);
  }
  return {
    ok: true,
    formula,
    labelNutrients: { ...labelNutrients },
    derivedUnrounded,
    storedRounded,
    undeclaredNutrients,
    declaredZeroNutrients,
    ...meta,
  };
}

/**
 * Resolve label → canonical conversion factor.
 * 1) same normalized unit → amount ratio
 * 2) else both grams available → grams ratio
 * 3) else unsupported
 *
 * Back-compat: (nutrients, labelAmount, canonicalAmount)
 * Preferred: (nutrients, labelServing, canonicalPortion)
 */
export function resolveManufacturerConversionFactor(labelServingOrAmount, canonicalOrAmount) {
  const label = servingParts(labelServingOrAmount);
  const canonical = servingParts(canonicalOrAmount);
  if (!Number.isFinite(label.amount) || label.amount <= 0) {
    return {
      ok: false,
      code: MANUFACTURER_ERROR_CODES.MANUFACTURER_CONVERSION_UNSUPPORTED,
      message: `Invalid label serving amount: ${labelServingOrAmount?.amount ?? labelServingOrAmount}`,
    };
  }
  if (!Number.isFinite(canonical.amount) || canonical.amount <= 0) {
    return {
      ok: false,
      code: MANUFACTURER_ERROR_CODES.MANUFACTURER_CONVERSION_UNSUPPORTED,
      message: `Invalid canonical portion amount: ${canonicalOrAmount?.amount ?? canonicalOrAmount}`,
    };
  }

  const labelUnit = label.unit == null ? null : normalizeManufacturerUnit(label.unit);
  const canonicalUnit =
    canonical.unit == null ? null : normalizeManufacturerUnit(canonical.unit);

  // Same normalized unit, or legacy numeric API with no units provided.
  if (
    (labelUnit && canonicalUnit && labelUnit === canonicalUnit) ||
    (labelUnit == null && canonicalUnit == null)
  ) {
    const factor = canonical.amount / label.amount;
    return {
      ok: true,
      method: labelUnit == null ? 'amount_ratio' : 'same_unit',
      factor,
      formula: `valueCanonical = valueLabel × ${canonical.amount} / ${label.amount}`,
      labelAmount: label.amount,
      canonicalAmount: canonical.amount,
      labelUnit,
      canonicalUnit,
      labelGrams: Number.isFinite(label.grams) ? label.grams : null,
      canonicalGrams: Number.isFinite(canonical.grams) ? canonical.grams : null,
    };
  }

  if (
    Number.isFinite(label.grams) &&
    label.grams > 0 &&
    Number.isFinite(canonical.grams) &&
    canonical.grams > 0
  ) {
    const factor = canonical.grams / label.grams;
    return {
      ok: true,
      method: 'grams_ratio',
      factor,
      formula: `valueCanonical = valueLabel × ${canonical.grams} g / ${label.grams} g`,
      labelAmount: label.amount,
      canonicalAmount: canonical.amount,
      labelUnit,
      canonicalUnit,
      labelGrams: label.grams,
      canonicalGrams: canonical.grams,
    };
  }

  return {
    ok: false,
    code: MANUFACTURER_ERROR_CODES.MANUFACTURER_CONVERSION_UNSUPPORTED,
    message: `Unsupported manufacturer conversion from ${label.amount} ${label.unit || '?'} to ${canonical.amount} ${canonical.unit || '?'} (need same unit or both gram weights)`,
  };
}

export function convertCnfPer100gToPortion(per100g, grams) {
  const g = Number(grams);
  if (!Number.isFinite(g) || g <= 0) {
    throw new Error(`Invalid portion grams: ${grams}`);
  }
  const factor = g / 100;
  const mapKey = {
    energy_kcal: 'declaredKcal',
    protein_g: 'proteinG',
    carbohydrate_g: 'carbsG',
    fibre_g: 'fiberG',
    total_fat_g: 'fatG',
    saturated_fat_g: 'saturatedFatG',
    polyunsaturated_fat_g: 'polyunsaturatedFatG',
    monounsaturated_fat_g: 'monounsaturatedFatG',
  };
  const derivedUnrounded = {};
  const storedRounded = {};
  for (const [sourceKey, targetKey] of Object.entries(mapKey)) {
    const sourceValue = per100g?.[sourceKey];
    if (sourceValue == null) {
      derivedUnrounded[targetKey] = null;
      storedRounded[targetKey] = null;
      continue;
    }
    const derived = Number(sourceValue) * factor;
    derivedUnrounded[targetKey] = derived;
    storedRounded[targetKey] =
      targetKey === 'declaredKcal' ? roundKcal(derived) : roundMacro(derived);
  }
  return {
    formula: `valuePortion = valuePer100g × ${g} / 100`,
    sourcePer100g: { ...per100g },
    derivedUnrounded,
    storedRounded,
  };
}

export function convertManufacturerBottleTo100ml(labelNutrients, bottleMl = 414) {
  const ml = Number(bottleMl);
  if (!Number.isFinite(ml) || ml <= 0) throw new Error(`Invalid bottle ml: ${bottleMl}`);
  const factor = 100 / ml;
  const result = scaleManufacturerNutrients(
    labelNutrients,
    factor,
    `valuePer100ml = valueBottle × 100 / ${ml}`,
    { bottleMl: ml }
  );
  if (!result.ok) throw new Error(result.message);
  return result;
}

export function convertManufacturerLabelToCanonicalPortion(
  labelNutrients,
  labelServingOrAmount,
  canonicalOrAmount
) {
  const resolved = resolveManufacturerConversionFactor(
    labelServingOrAmount,
    canonicalOrAmount
  );
  if (!resolved.ok) {
    const error = new Error(resolved.message);
    error.code = resolved.code;
    throw error;
  }
  const result = scaleManufacturerNutrients(
    labelNutrients,
    resolved.factor,
    resolved.formula,
    {
      labelServingAmount: resolved.labelAmount,
      canonicalAmount: resolved.canonicalAmount,
      labelUnit: resolved.labelUnit,
      canonicalUnit: resolved.canonicalUnit,
      labelGrams: resolved.labelGrams,
      canonicalGrams: resolved.canonicalGrams,
      method: resolved.method,
      factor: resolved.factor,
    }
  );
  if (!result.ok) {
    const error = new Error(result.message);
    error.code = result.code;
    throw error;
  }
  return result;
}

/**
 * Compare approved stored nutrients against recomputed conversion.
 * Distinguishes null→0 coercion from ordinary mismatches.
 */
export function validateManufacturerStoredAgainstConversion(approvedStored, conversion) {
  const errors = [];
  for (const key of MANUFACTURER_NUTRIENT_KEYS) {
    const approved = approvedStored?.[key] ?? null;
    const computed = conversion.storedRounded?.[key] ?? null;
    const label = conversion.labelNutrients?.[key] ?? null;
    if (label == null && approved === 0) {
      errors.push({
        code: MANUFACTURER_ERROR_CODES.MANUFACTURER_UNKNOWN_COERCED_TO_ZERO,
        key,
        message: `${key}: undeclared label nutrient coerced to 0`,
      });
      continue;
    }
    if (label == null && approved != null) {
      errors.push({
        code: MANUFACTURER_ERROR_CODES.MANUFACTURER_LABEL_NUTRIENT_MISSING,
        key,
        message: `${key}: approved stored value present but label nutrient is undeclared`,
      });
      continue;
    }
    if (approved === computed) continue;
    if (approved == null && computed == null) continue;
    errors.push({
      code: MANUFACTURER_ERROR_CODES.MANUFACTURER_CANONICAL_MISMATCH,
      key,
      message: `${key}: approved ${approved} != computed ${computed}`,
    });
  }
  return {
    ok: errors.length === 0,
    errors,
  };
}
