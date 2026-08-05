/**
 * Server macro / calorie-goal targets — wraps pure engine.
 * Does not return MACRO_PRESETS wholesale or internal coefficients.
 */

import {
  computeMacroTargets,
  computeProteinGrams,
  computeHydration,
  adjustComplementaryCustomMacro,
  kcalFromMacros,
} from '../../../lib/coach-calculator-engine.mjs';

/**
 * @param {object} input
 */
export function calculateMacroTargets(input) {
  const targets = computeMacroTargets(input);
  const hydration = computeHydration(
    input?.hydrationKcal != null ? input.hydrationKcal : targets.kcal,
    input?.manualAddL ?? 0,
  );
  return {
    targets,
    hydration,
    goalKcal: Math.round((parseFloat(input?.tdee) || 0) * (parseFloat(input?.goalMultiplier) || 1)),
  };
}

export {
  computeMacroTargets,
  computeProteinGrams,
  computeHydration,
  adjustComplementaryCustomMacro,
  kcalFromMacros,
};
