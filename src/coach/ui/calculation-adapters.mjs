/**
 * UI calculation adapters for the Coach calculator.
 *
 * Intended flow (browser runtime mirrors this):
 *   1. Read form / DOM values in the UI layer
 *   2. Normalize / convert values (pure helpers below)
 *   3. Call the shared engine
 *   4. Write results back to the DOM in the UI layer
 *
 * This module must never import browser globals or Web Storage APIs.
 * Dual-brand banque / completeness / reconcile tolerances stay in UI inject scripts.
 */

export {
  // Structure / defaults
  CATS,
  MEAL_COUNT,
  MOYENNES,
  createEmptyJourData,
  normalizeProteinesPct,
  normalizeMacroPct,
  // Macro energy
  kcalFromMacros,
  macroPercentagesFromGrams,
  getPortionTotals,
  // Plan totals / configuration
  computePlannedTotalsFromRepartition,
  isJourClientPlanConfigured,
  // Portion distribution / suggestion (pure core)
  roundHalf,
  distribuerPortions,
  scorePortions,
  suggestBanque,
} from '../../lib/coach-calculator-engine.mjs';
