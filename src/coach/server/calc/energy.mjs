/**
 * Server energy needs — wraps pure engine without exposing coefficients.
 */

import {
  computeEerTdee,
  computeIom2005Eer,
  computeNasem2023Eer,
} from '../../../lib/coach-calculator-engine.mjs';

/**
 * @param {object} input
 * @returns {{ bmr: number, tdee: number, method: string, goals: object }}
 */
export function calculateEnergyNeeds(input) {
  const result = computeEerTdee(input);
  const tdee = result.tdee;
  const age = parseFloat(input?.age) || 0;
  const youth = age > 0 && age < 19;
  return {
    bmr: result.bmr,
    tdee: result.tdee,
    method: result.method,
    goals: {
      perteSevere: youth ? null : tdee * 0.8,
      perteLegere: youth ? null : tdee * 0.9,
      maintien: tdee * 1.0,
      priseLegere: youth ? null : tdee * 1.1,
      priseSevere: youth ? null : tdee * 1.2,
    },
  };
}

/** Direct helpers for golden parity tests (server-internal). */
export { computeEerTdee, computeIom2005Eer, computeNasem2023Eer };
