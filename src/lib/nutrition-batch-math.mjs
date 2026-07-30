/**
 * Deterministic rounding and portion conversion for approved nutrition batches.
 */

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
  const keys = [
    'declaredKcal',
    'proteinG',
    'carbsG',
    'fiberG',
    'fatG',
    'saturatedFatG',
    'polyunsaturatedFatG',
    'monounsaturatedFatG',
  ];
  const derivedUnrounded = {};
  const storedRounded = {};
  for (const key of keys) {
    const sourceValue = labelNutrients?.[key];
    if (sourceValue == null) {
      derivedUnrounded[key] = null;
      storedRounded[key] = null;
      continue;
    }
    const derived = Number(sourceValue) * factor;
    derivedUnrounded[key] = derived;
    storedRounded[key] = key === 'declaredKcal' ? roundKcal(derived) : roundMacro(derived);
  }
  return {
    formula: `valuePer100ml = valueBottle × 100 / ${ml}`,
    bottleMl: ml,
    labelNutrients: { ...labelNutrients },
    derivedUnrounded,
    storedRounded,
  };
}
