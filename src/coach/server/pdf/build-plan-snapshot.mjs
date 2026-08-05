import {
  MOYENNES, computeBanqueTotals, computePlannedTotalsFromRepartition, reconcilePlanTotals,
  computeHydration, macroPercentagesFromGrams, kcalFromMacros,
} from '../../../lib/coach-calculator-engine.mjs';
import { CATS, MEAL_COUNT, CATEGORY_LABELS, MEAL_LABELS, JOUR_LABELS_PDF } from './category-labels.mjs';

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function formatTime(time) {
  if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) return '';
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

function normalizeTiming(day, jourKey, locale) {
  if (day?.timing && typeof day.timing === 'object') return { active: !!day.timing.active, ...day.timing };
  if (jourKey !== 'entrainement' || !day?.heureEntrainement || day.repartitionSelonEntrainement === false) {
    return { active: false };
  }
  const heureLabel = formatTime(day.heureEntrainement);
  return { active: !!heureLabel, heure: day.heureEntrainement, heureLabel, summary: heureLabel };
}

/**
 * Produce a DOM-free representation used by server PDF rendering.
 */
export function buildPlanSnapshot({ day, targets, locale = 'fr', jourKey = 'entrainement' } = {}) {
  const language = locale === 'en' ? 'en' : 'fr';
  const banque = day?.banque || {};
  const repartition = Array.isArray(day?.repartition) ? day.repartition : [];
  const safeTargets = {
    kcal: number(targets?.kcal), pro: number(targets?.pro),
    glu: number(targets?.glu), lip: number(targets?.lip),
  };
  const banqueTotals = computeBanqueTotals(banque);
  const plannedTotals = computePlannedTotalsFromRepartition(repartition);
  const reconciliation = reconcilePlanTotals({ targets: safeTargets, banqueTotals, plannedTotals });
  const calculatedWater = computeHydration(banqueTotals.kcal > 0 ? banqueTotals.kcal : safeTargets.kcal, day?.eauAjout);
  const manualTotal = number(day?.eauLitres);
  const eau = {
    ...calculatedWater,
    total: day?.eauManuel && manualTotal >= 0 ? manualTotal : calculatedWater.total,
    manuel: !!day?.eauManuel,
  };
  const meals = [];
  for (let mealIndex = 0; mealIndex < MEAL_COUNT; mealIndex += 1) {
    const items = CATS.map((cat, catIndex) => ({
      cat,
      portions: number(repartition[(mealIndex * CATS.length) + catIndex]),
      label: CATEGORY_LABELS[language][cat],
    })).filter((item) => item.portions > 0);
    if (items.length) meals.push({ mealIndex, label: MEAL_LABELS[language][mealIndex], items });
  }
  const totalKcal = kcalFromMacros(plannedTotals.pro, plannedTotals.glu, plannedTotals.lip);
  const macroPercentages = macroPercentagesFromGrams(plannedTotals.pro, plannedTotals.glu, plannedTotals.lip);
  const midpoint = Math.ceil(meals.length / 2);
  return {
    jourKey,
    jourLabel: JOUR_LABELS_PDF[language][jourKey] || JOUR_LABELS_PDF[language].entrainement,
    targets: safeTargets,
    banqueTotals,
    plannedTotals,
    reconciliation,
    eau,
    meals,
    mealsLeft: meals.slice(0, midpoint),
    mealsRight: meals.slice(midpoint),
    timing: normalizeTiming(day, jourKey, language),
    totals: { ...plannedTotals, kcal: totalKcal },
    macroPercentages,
    moyennes: MOYENNES,
  };
}
