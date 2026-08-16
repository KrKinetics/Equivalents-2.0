/**
 * Display-only grouping and split helpers for the KR v4.2 PDF.
 * Never scores, never invents analytical text, never mutates a snapshot.
 */

import { normalizeDisplayKey } from '../../report/dedupe-display-items.mjs';

export const DIMENSION_GROUP_DEFS = [
  {
    id: 'motivation',
    title: 'Motivation et adhésion',
    ids: [
      'autonomous_motivation',
      'autonomous_value_without_results',
      'results_orientation',
      'results_delay_sensitivity',
      'adherence_recovery',
      'adherence_maintenance',
      'adherence_recovery_signal',
      'adherence_history',
      'all_or_nothing',
      'delay_tolerance',
      'long_term_projection',
    ],
  },
  {
    id: 'coaching',
    title: 'Encadrement et prise de décision',
    ids: [
      'structure_need',
      'explanation_need',
      'choice_interest',
      'option_overload',
      'coach_receptivity',
      'autonomy_need',
      'choice_need',
    ],
  },
  {
    id: 'nutrition',
    title: 'Nutrition et comportements alimentaires',
    ids: [
      'nutrition_value',
      'performance_fueling',
      'nutrition_planning',
      'food_flexibility',
      'compensatory_food',
      'emotional_stress_food',
      'emotional_reward_food',
      'nutrition_structure',
      'hunger_signals',
    ],
  },
];

export const EVIDENCE_LEGEND = [
  { badge: 'Donnée unique', note: 'une seule réponse' },
  { badge: 'Mixte', note: 'signaux divergents' },
  { badge: 'Cohérente', note: 'plusieurs réponses alignées' },
];

function dimensionId(row) {
  return String(row?.id || row?.domainId || '').trim();
}

function guessGroupId(row) {
  const id = dimensionId(row).toLowerCase();
  if (/nutrition|food|hunger|compensatory|emotional/.test(id)) return 'nutrition';
  if (/structure|explanation|choice|coach|autonomy/.test(id)) return 'coaching';
  return 'motivation';
}

export function groupDimensions(dimensions) {
  const rows = Array.isArray(dimensions) ? dimensions.filter(Boolean) : [];
  const used = new Set();
  const groups = DIMENSION_GROUP_DEFS.map((def) => {
    const items = rows.filter((row) => def.ids.includes(dimensionId(row)));
    items.forEach((row) => used.add(row));
    return { id: def.id, title: def.title, items };
  });
  for (const row of rows) {
    if (used.has(row)) continue;
    const fallback = groups.find((group) => group.id === guessGroupId(row));
    if (fallback) fallback.items.push(row);
  }
  return groups.filter((group) => group.items.length);
}

export function isEmphasizedDimension(row) {
  const badge = normalizeDisplayKey(row?.evidenceBadge);
  if (badge === 'cohérente' || badge === 'coherente') return true;
  const score = Number(row?.score);
  return Number.isFinite(score) && (score >= 75 || score <= 30);
}

export function displayKeys(items) {
  return new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => normalizeDisplayKey(typeof item === 'string' ? item : item?.verbatim || item?.text || item))
      .filter(Boolean),
  );
}

export function excludeExact(items, excluded) {
  const keys = excluded instanceof Set ? excluded : displayKeys(excluded);
  return (Array.isArray(items) ? items : []).filter((item) => {
    const key = normalizeDisplayKey(typeof item === 'string' ? item : item?.verbatim || item?.text || item);
    return key && !keys.has(key);
  });
}

/**
 * Split existing nutrition copy into scan blocks. Does not invent sentences.
 * First longer paragraph stays as lecture; remaining lecture lines become signals.
 */
export function splitNutritionBlocks(nutrition) {
  if (!nutrition) return null;
  const lecture = Array.isArray(nutrition.lecture) ? nutrition.lecture.filter(Boolean) : [];
  const structure = String(nutrition.structure || '').trim();
  const obstacles = Array.isArray(nutrition.obstacles) ? nutrition.obstacles.filter(Boolean) : [];
  const actions = Array.isArray(nutrition.actions) ? nutrition.actions.filter(Boolean) : [];
  const used = displayKeys([structure, ...obstacles, ...actions]);
  const unusedLecture = lecture.filter((line) => !used.has(normalizeDisplayKey(line)));
  const featured = unusedLecture[0] && unusedLecture[0].length > 140
    ? unusedLecture[0]
    : '';
  const signals = featured ? unusedLecture.slice(1) : unusedLecture;
  if (!featured && !signals.length && !structure && !obstacles.length && !actions.length) return null;
  return {
    lecture: featured ? [featured] : (signals.length <= 2 ? signals : []),
    signals: featured ? signals : (signals.length > 2 ? signals : []),
    structure,
    obstacles,
    actions,
  };
}
