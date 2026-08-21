/**
 * Meal repartition presets + auto distribution (server-side).
 * Mirrors dual-brand calculator REPART_PRESETS / repartirAutomatique rules.
 * No DOM. Used exclusively via /api/coach-calc-portions.
 */

import { CATS, MEAL_COUNT } from '../domain/plan-structure.mjs';
import { distribuerPortions } from './portions.mjs';

const EQUAL_MEAL = 1 / MEAL_COUNT;

/** Breakfast, AM snack, PM snack — pro (meat/fish) never auto-placed here. */
export const PRO_AUTO_EXCLUDED = Object.freeze([0, 1, 3]);

export const REPART_PRESETS = Object.freeze({
  classique: Object.freeze({
    pro: Object.freeze([0.30, 0.05, 0.25, 0.10, 0.25, 0.05, 0.00]),
    fec: Object.freeze([0.25, 0.10, 0.25, 0.15, 0.20, 0.05, 0.00]),
    leg: Object.freeze([0.25, 0.10, 0.25, 0.10, 0.25, 0.05, 0.00]),
    fru: Object.freeze([0.15, 0.25, 0.10, 0.25, 0.10, 0.15, 0.00]),
    lai: Object.freeze([0.25, 0.15, 0.20, 0.15, 0.20, 0.05, 0.00]),
    lip: Object.freeze([0.30, 0.05, 0.25, 0.10, 0.25, 0.05, 0.00]),
    whey: Object.freeze([0.10, 0.20, 0.10, 0.25, 0.10, 0.25, 0.00]),
  }),
  performance: Object.freeze({
    pro: Object.freeze([0.20, 0.10, 0.25, 0.15, 0.25, 0.05, 0.00]),
    fec: Object.freeze([0.15, 0.10, 0.30, 0.25, 0.15, 0.05, 0.00]),
    leg: Object.freeze([0.20, 0.10, 0.25, 0.15, 0.25, 0.05, 0.00]),
    fru: Object.freeze([0.10, 0.20, 0.15, 0.30, 0.10, 0.15, 0.00]),
    lai: Object.freeze([0.20, 0.15, 0.20, 0.15, 0.20, 0.10, 0.00]),
    lip: Object.freeze([0.25, 0.05, 0.25, 0.10, 0.30, 0.05, 0.00]),
    whey: Object.freeze([0.05, 0.15, 0.15, 0.35, 0.10, 0.20, 0.00]),
  }),
  equilibre: Object.freeze({
    pro: Object.freeze([EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL]),
    fec: Object.freeze([EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL]),
    leg: Object.freeze([EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL]),
    fru: Object.freeze([EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL]),
    lai: Object.freeze([EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL]),
    lip: Object.freeze([EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL]),
    whey: Object.freeze([EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL, EQUAL_MEAL]),
  }),
});

function normalizeWeights(weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  return weights.map((w) => w / sum);
}

function parseHeureToMinutes(heure) {
  if (typeof heure !== 'string' || !/^\d{2}:\d{2}$/.test(heure)) return null;
  const [h, m] = heure.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** Midpoints match dual-brand calculator MEAL_MIDPOINTS (minutes from midnight). */
const MEAL_MIDPOINTS = Object.freeze([450, 600, 750, 930, 1110, 1260, 1350]);

function getIndicesEntrainement(trainMin) {
  if (trainMin < MEAL_MIDPOINTS[0]) {
    return { preIdx: 0, postIdx: 1 };
  }
  if (trainMin >= MEAL_MIDPOINTS[MEAL_COUNT - 1]) {
    return { preIdx: MEAL_COUNT - 2, postIdx: MEAL_COUNT - 1 };
  }
  let preIdx = -1;
  let postIdx = -1;
  for (let i = 0; i < MEAL_COUNT; i += 1) {
    if (MEAL_MIDPOINTS[i] < trainMin) preIdx = i;
    if (MEAL_MIDPOINTS[i] >= trainMin && postIdx === -1) postIdx = i;
  }
  if (preIdx === postIdx && preIdx > 0) preIdx = postIdx - 1;
  return { preIdx, postIdx };
}

/**
 * Training-aware preset (boost carbs/protein around session).
 * @param {string|null|undefined} heureEntrainement HH:mm
 */
export function buildPresetEntrainement(heureEntrainement) {
  const trainMin = parseHeureToMinutes(heureEntrainement);
  if (trainMin === null) {
    return Object.fromEntries(
      CATS.map((cat) => [cat, [...REPART_PRESETS.performance[cat]]]),
    );
  }
  const { preIdx, postIdx } = getIndicesEntrainement(trainMin);
  const boosts = {
    fec: { pre: 1.9, post: 2.3, other: 0.55 },
    fru: { pre: 1.7, post: 2.0, other: 0.65 },
    whey: { pre: 1.6, post: 2.8, other: 0.45 },
    pro: { pre: 1.2, post: 1.5, other: 0.88 },
    leg: { pre: 1.1, post: 1.1, other: 0.95 },
    lai: { pre: 1.2, post: 1.3, other: 0.9 },
    lip: { pre: 0.85, post: 0.9, other: 1.05 },
  };
  const preset = {};
  for (const cat of CATS) {
    const base = [...REPART_PRESETS.classique[cat]];
    const b = boosts[cat];
    for (let i = 0; i < MEAL_COUNT; i += 1) {
      if (i === preIdx) base[i] *= b.pre;
      else if (i === postIdx) base[i] *= b.post;
      else base[i] *= b.other;
    }
    preset[cat] = normalizeWeights(base);
  }
  return preset;
}

/**
 * Resolve named mode → weight matrix per category.
 * @param {'classique'|'equilibre'|'performance'|'entrainement'} mode
 * @param {{ heureEntrainement?: string|null }} [opts]
 */
export function resolveRepartPreset(mode, opts = {}) {
  if (mode === 'entrainement') return buildPresetEntrainement(opts.heureEntrainement);
  const preset = REPART_PRESETS[mode];
  if (!preset) return null;
  return Object.fromEntries(
    CATS.map((cat) => [cat, [...preset[cat]]]),
  );
}

/**
 * Build a flat 49-length meal×category repartition from banque totals.
 * Protein (pro) is distributed only to non-excluded meals (lunch/dinner/evening).
 *
 * @param {{
 *   banque: Record<string, number>,
 *   mode?: 'classique'|'equilibre'|'performance'|'entrainement',
 *   heureEntrainement?: string|null,
 * }} input
 * @returns {{ repartition: number[], mode: string } | null}
 */
export function buildAutoRepartition(input) {
  const mode = String(input?.mode || 'classique');
  const banque = input?.banque || {};
  const preset = resolveRepartPreset(mode, {
    heureEntrainement: input?.heureEntrainement,
  });
  if (!preset) return null;

  let banqueTotal = 0;
  for (const cat of CATS) banqueTotal += Number(banque[cat]) || 0;
  if (banqueTotal <= 0) return null;

  const repartition = new Array(MEAL_COUNT * CATS.length).fill(0);

  for (const cat of CATS) {
    const total = Number(banque[cat]) || 0;
    const catIndex = CATS.indexOf(cat);
    if (total <= 0) continue;

    let weights = [...preset[cat]];
    if (cat === 'pro') {
      weights = weights.map((w, i) => (PRO_AUTO_EXCLUDED.includes(i) ? 0 : w));
      weights = normalizeWeights(weights);
    }

    const mealVals = distribuerPortions(total, weights);
    for (let m = 0; m < MEAL_COUNT; m += 1) {
      repartition[m * CATS.length + catIndex] = mealVals[m];
    }
  }

  return { repartition, mode };
}
