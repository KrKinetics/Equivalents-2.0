/**
 * Pure macro energy helpers shared by Coach calculations and plan totals.
 */

export function kcalFromMacros(pro, glu, lip) {
  return Math.round(pro * 4 + glu * 4 + lip * 9);
}

/**
 * Display-only macro energy shares that always sum to exactly 100%.
 * Protein and carbs are independently rounded; fat absorbs the residual.
 * Does not alter grams, calories, or portions.
 */
export function macroPercentagesFromGrams(pro, glu, lip) {
  const total = kcalFromMacros(pro || 0, glu || 0, lip || 0);
  if (!total) return { pro: 0, glu: 0, lip: 0 };
  const proPct = Math.round(((pro || 0) * 4 / total) * 100);
  const gluPct = Math.round(((glu || 0) * 4 / total) * 100);
  return { pro: proPct, glu: gluPct, lip: Math.max(0, 100 - proPct - gluPct) };
}
