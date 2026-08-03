/**
 * Pure portion distribution / banque suggestion helpers.
 * Extracted from the coach calculator engine without formula changes.
 */

import { MEAL_COUNT } from '../domain/plan-structure.mjs';
import { MOYENNES, getPortionTotals } from '../domain/plans.mjs';

export function roundHalf(n) {
  return Math.max(0, Math.round(n * 2) / 2);
}

export function distribuerPortions(total, weights) {
  if (total <= 0) return new Array(MEAL_COUNT).fill(0);
  const raw = weights.map((w) => total * w);
  const portions = raw.map((v) => Math.floor(v * 2) / 2);
  let remain = Math.round((total - portions.reduce((a, b) => a + b, 0)) * 2) / 2;
  const order = raw
    .map((v, i) => ({ i, frac: v - portions[i] }))
    .sort((a, b) => b.frac - a.frac || b.i - a.i);
  let step = 0;
  while (remain >= 0.5 && step < 24) {
    portions[order[step % MEAL_COUNT].i] += 0.5;
    remain -= 0.5;
    step += 1;
  }
  return portions;
}

export function scorePortions(portions, targets) {
  const t = getPortionTotals(portions);
  const tol = { pro: 5, glu: 5, lip: 5, kcal: 50 };
  let score = Math.abs(t.pro - targets.pro) + Math.abs(t.glu - targets.glu) + Math.abs(t.lip - targets.lip);
  score += Math.abs(t.kcal - targets.kcal) * 0.1;
  if (Math.abs(t.pro - targets.pro) > tol.pro) score += 20;
  if (Math.abs(t.glu - targets.glu) > tol.glu) score += 20;
  if (Math.abs(t.lip - targets.lip) > tol.lip) score += 20;
  if (Math.abs(t.kcal - targets.kcal) > tol.kcal) score += 30;
  return score;
}

export function suggestBanque(targets) {
  if (!targets || targets.kcal === 0) {
    return null;
  }

  const tweaks = [-1, -0.5, 0, 0.5, 1];
  let best = null;
  let bestScore = Infinity;

  for (let leg = 1.5; leg <= 3; leg += 0.5) {
    for (let fru = 1; fru <= 3; fru += 0.5) {
      for (let lai = 0.5; lai <= 2; lai += 0.5) {
        const seed = { leg, fru, lai, whey: 0, pro: 0, fec: 0, lip: 0 };
        let used = getPortionTotals(seed);
        seed.fec = roundHalf((targets.glu - used.glu) / MOYENNES.fec.g);
        used = getPortionTotals(seed);
        seed.pro = roundHalf((targets.pro - used.pro) / MOYENNES.pro.p);
        used = getPortionTotals(seed);
        seed.lip = roundHalf((targets.lip - used.lip) / MOYENNES.lip.l);

        for (const dp of tweaks) {
          for (const df of tweaks) {
            for (const dl of tweaks) {
              for (const dw of [0, 0.5, 1]) {
                const trial = {
                  leg,
                  fru,
                  lai,
                  pro: Math.max(0, seed.pro + dp),
                  fec: Math.max(0, seed.fec + df),
                  lip: Math.max(0, seed.lip + dl),
                  whey: Math.max(0, seed.whey + dw),
                };
                const s = scorePortions(trial, targets);
                if (s < bestScore) {
                  bestScore = s;
                  best = trial;
                }
              }
            }
          }
        }
      }
    }
  }

  return best;
}
