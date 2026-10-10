/**
 * Pure projection of one saved client_dossiers payload into the KR KINETICS
 * release contract and the existing PDF day shape.
 * Does not read or write Supabase, and does not render or parse a PDF.
 */

import { CATS } from '../domain/plan-structure.mjs';
import { normalizeLegacyRepartition } from '../domain/clients.mjs';
import { computeBanqueTotals } from '../domain/plans.mjs';
import { getIndicesEntrainement } from '../calculations/repartition-presets.mjs';

const RELEASE_MEAL_MAX = 7;
const HISTORICAL_MEAL_COUNT = 6;
const CELL_COUNT = CATS.length * RELEASE_MEAL_MAX;
const GOAL_MULTIPLIERS = Object.freeze([0.8, 0.9, 1, 1.1, 1.2]);
const PRESET_RATIOS = new Set([
  '30,40,30',
  '40,35,25',
  '25,45,30',
  '33,33,33',
  '25,50,25',
  '20,55,25',
  '15,60,25',
  '45,35,20',
]);

function fail(code) {
  return { ok: false, code, writesDossier: false, releasesAthlete: false };
}

function portion(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(',', '.');
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 500) return null;
    return parsed;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 500) return value;
  return null;
}

function cellsFromRepartition(repartition) {
  if (Array.isArray(repartition)) {
    if (repartition.length > CELL_COUNT) return null;
    const cells = repartition.map((value) => portion(value));
    if (cells.some((value) => value === null)) return null;
    while (cells.length < CELL_COUNT) cells.push(0);
    return cells;
  }
  const normalized = normalizeLegacyRepartition(repartition);
  if (!normalized.ok || !Array.isArray(normalized.value)) return null;
  return normalized.value;
}

function canonicalGoal(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return GOAL_MULTIPLIERS.find((allowed) => Math.abs(allowed - parsed) < 1e-9) ?? null;
}

function macroDistribution(payload) {
  if (payload.macroMode === 'custom') {
    const carbsPercent = portion(payload.macroCustomG);
    const fatPercent = portion(payload.macroCustomL);
    if (carbsPercent === null || fatPercent === null) return null;
    if (!Number.isInteger(carbsPercent) || !Number.isInteger(fatPercent)) return null;
    if (carbsPercent < 5 || carbsPercent > 80 || fatPercent < 5 || fatPercent > 80) return null;
    if (carbsPercent + fatPercent > 95) return null;
    return { mode: 'CUSTOM', carbsPercent, fatPercent };
  }
  const ratio = typeof payload.macroRatio === 'string' ? payload.macroRatio.trim() : '';
  if (!PRESET_RATIOS.has(ratio)) return null;
  return { mode: 'PRESET', ratio };
}

function coachNotes(value) {
  if (value == null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const notes = value.trim();
  if (!notes) return { ok: true, value: null };
  if (notes.length > 4000 || /\0|<script|javascript:/i.test(notes)) return { ok: false };
  return { ok: true, value: notes };
}

function totalsFrom(banque, explicit) {
  if (explicit && typeof explicit === 'object') {
    const calories = portion(explicit.kcal);
    const proteinG = portion(explicit.pro);
    const carbsG = portion(explicit.glu);
    const fatG = portion(explicit.lip);
    if (calories === null || proteinG === null || carbsG === null || fatG === null) return null;
    return { calories, proteinG, carbsG, fatG };
  }
  const computed = computeBanqueTotals(banque);
  return {
    calories: computed.kcal,
    proteinG: computed.pro,
    carbsG: computed.glu,
    fatG: computed.lip,
  };
}

function hydrationFor(day, calories) {
  const addedL = portion(day.eauAjout ?? 0);
  if (addedL === null || addedL > 100) return null;
  const manual = day.eauManuel === true;
  const stored = day.eauLitres == null || day.eauLitres === '' ? null : portion(day.eauLitres);
  if (stored === null && (manual || day.eauLitres != null)) return null;
  if (stored !== null && stored > 100) return null;
  const autoL = manual
    ? Math.max(0, Math.round(((stored ?? 0) - addedL) * 10) / 10)
    : Math.round((calories / 1000) * 10) / 10;
  const totalL = stored ?? Math.round((autoL + addedL) * 10) / 10;
  if (autoL > 100 || totalL > 100) return null;
  return { totalL, autoL, addedL, manual };
}

function workoutTiming(day) {
  if (day.repartitionSelonEntrainement === false) return { ok: true, value: null };
  if (typeof day.heureEntrainement !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.heureEntrainement)) {
    return { ok: true, value: null };
  }
  const [hours, minutes] = day.heureEntrainement.split(':').map(Number);
  const indexes = getIndicesEntrainement(hours * 60 + minutes);
  if (indexes.preIdx > RELEASE_MEAL_MAX - 1 || indexes.postIdx > RELEASE_MEAL_MAX - 1 || indexes.preIdx < 0 || indexes.postIdx < 0) {
    return { ok: false, code: 'INCOMPLETE_DOSSIER' };
  }
  if (indexes.preIdx === indexes.postIdx) return { ok: false, code: 'INCOMPLETE_DOSSIER' };
  return {
    ok: true,
    value: {
      trainingTime: day.heureEntrainement,
      preMealIndex: indexes.preIdx,
      postMealIndex: indexes.postIdx,
    },
  };
}

function projectDay(day, dayKind) {
  if (!day || typeof day !== 'object') return fail('INCOMPLETE_DOSSIER');
  const cells = cellsFromRepartition(day.repartition ?? []);
  if (!cells) return fail('INCOMPLETE_DOSSIER');
  const timing = dayKind === 'REST' ? { ok: true, value: null } : workoutTiming(day);
  if (!timing.ok) return fail(timing.code);
  let mealCount = HISTORICAL_MEAL_COUNT;
  for (let mealIndex = HISTORICAL_MEAL_COUNT; mealIndex < RELEASE_MEAL_MAX; mealIndex += 1) {
    const start = mealIndex * CATS.length;
    if (cells.slice(start, start + CATS.length).some((value) => value > 0)) mealCount = mealIndex + 1;
  }
  if (timing.value) mealCount = Math.max(mealCount, timing.value.preMealIndex + 1, timing.value.postMealIndex + 1);
  if (mealCount > RELEASE_MEAL_MAX) return fail('INCOMPLETE_DOSSIER');
  const portionBank = CATS.map((category) => {
    const quantity = portion(day.banque?.[category] ?? 0);
    return quantity === null ? null : { category, quantity };
  });
  if (portionBank.some((item) => item === null)) return fail('INCOMPLETE_DOSSIER');
  const meals = [];
  for (let mealIndex = 0; mealIndex < mealCount; mealIndex += 1) {
    meals.push({
      mealIndex,
      portions: CATS.map((category, catIndex) => ({
        category,
        quantity: cells[mealIndex * CATS.length + catIndex],
      })),
    });
  }
  const banque = Object.fromEntries(portionBank.map((item) => [item.category, item.quantity]));
  const targets = totalsFrom(banque, day.targets);
  const bankTotals = totalsFrom(banque, null);
  if (!targets || !bankTotals) return fail('INCOMPLETE_DOSSIER');
  if (targets.calories === 0 && bankTotals.calories === 0) return fail('INCOMPLETE_DOSSIER');
  const hydration = hydrationFor(day, bankTotals.calories);
  if (!hydration) return fail('INCOMPLETE_DOSSIER');
  return {
    ok: true,
    planDay: {
      dayKind,
      targets,
      bankTotals,
      hydration,
      workoutTiming: timing.value,
      portionBank,
      meals,
    },
    pdfDay: {
      banque,
      repartition: cells,
      targets: {
        kcal: targets.calories,
        pro: targets.proteinG,
        glu: targets.carbsG,
        lip: targets.fatG,
      },
      eauLitres: hydration.totalL,
      eauAjout: hydration.addedL,
      eauManuel: hydration.manual,
      heureEntrainement: typeof day.heureEntrainement === 'string' ? day.heureEntrainement : undefined,
      repartitionSelonEntrainement: day.repartitionSelonEntrainement !== false,
    },
  };
}

function restDecision(payload) {
  const rest = payload.jours?.repos;
  if (!rest || typeof rest !== 'object') return payload.jourReposActif === true ? 'required' : 'absent';
  const cells = cellsFromRepartition(rest.repartition ?? []);
  if (!cells) return 'invalid';
  const used = payload.jourReposActif === true
    || cells.some((value) => value > 0)
    || CATS.some((category) => (portion(rest.banque?.[category] ?? 0) || 0) > 0);
  return used ? 'required' : 'absent';
}

/**
 * @param {unknown} payload saved client_dossiers payload
 * @param {{ language?: 'fr'|'en', brand?: 'kr'|'elevate' }} options
 */
export function prepareCanonicalPublication(payload, options = {}) {
  const brand = options.brand === 'elevate' ? 'elevate' : options.brand === 'kr' ? 'kr' : null;
  if (brand !== 'kr') return fail('ELEVATE_NOT_PUBLISHABLE');
  const language = options.language === 'en' ? 'en' : options.language === 'fr' || options.language == null ? 'fr' : null;
  if (!language) return fail('INCOMPLETE_DOSSIER');
  if (!payload || typeof payload !== 'object') return fail('INCOMPLETE_DOSSIER');
  const goalMultiplier = canonicalGoal(payload.goalMultiplier);
  if (goalMultiplier === null) return fail('UNSUPPORTED_GOAL');
  const distribution = macroDistribution(payload);
  if (!distribution) return fail('UNSUPPORTED_MACRO');
  const notes = coachNotes(payload.coachNotes);
  if (!notes.ok) return fail('INVALID_NOTES');
  const training = projectDay(payload.jours?.entrainement, 'TRAINING');
  if (!training.ok) return training;
  const days = [training.planDay];
  const pdfRequestDays = { training: training.pdfDay, rest: null };
  const rest = restDecision(payload);
  if (rest === 'invalid') return fail('INCOMPLETE_DOSSIER');
  if (rest === 'required') {
    const projected = projectDay(payload.jours?.repos, 'REST');
    if (!projected.ok) return projected;
    days.push(projected.planDay);
    pdfRequestDays.rest = projected.pdfDay;
  }
  return {
    ok: true,
    writesDossier: false,
    releasesAthlete: false,
    plan: {
      schemaVersion: 1,
      language,
      brand: 'kr',
      goalMultiplier,
      macroDistribution: distribution,
      coachNotes: notes.value,
      days,
    },
    pdfRequestDays,
  };
}
