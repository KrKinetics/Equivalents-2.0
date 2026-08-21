/**
 * Coach notes used ONLY by the seventh-meal OWNER REVIEW demo scenarios.
 *
 * These are scenario/demo data (not a per-day-type feature): a single neutral
 * note that suits both training and rest days, with a French version for the
 * French PDFs and an English version for the English PDFs. Free coach notes
 * typed by a real coach are never auto-translated — this only fixes the
 * demonstration payload shown in the eight control PDFs.
 */
export const SCENARIO_NOTE_FR = 'Prioriser l’hydratation et une répartition régulière des protéines au cours de la journée.';
export const SCENARIO_NOTE_EN = 'Prioritize hydration and distribute protein evenly throughout the day.';

export function scenarioNoteForLang(lang) {
  return lang === 'en' ? SCENARIO_NOTE_EN : SCENARIO_NOTE_FR;
}
