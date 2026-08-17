/**
 * questionnaire-v4.3 seeds. Does not mutate questionnaire-v4.1 or v4.2.
 * Same 34 base codes + scoring adaptive bank + refined narrative bank.
 */

import {
  SEED_QUESTIONS_V42,
  SEED_QUESTIONS_V42_BASE,
  SEED_QUESTIONS_V42_NARRATIVE,
  SEED_QUESTIONS_V42_SCORING_ADAPTIVE,
  V42_BASE_CODES,
  V42_SCORING_ADAPTIVE_CODES,
} from './seed-questions-v42.mjs';

export const V43_BASE_CODES = [...V42_BASE_CODES];
export const V43_SCORING_ADAPTIVE_CODES = [...V42_SCORING_ADAPTIVE_CODES];
export const V43_NARRATIVE_BANK_CODES = Object.freeze([
  'CLARIFY_WHY_NOW_01',
  'CLARIFY_GOAL_MEANING_01',
  'CLARIFY_SUCCESS_01',
  'CLARIFY_RECOVERY_01',
  'CLARIFY_BARRIER_01',
  'CLARIFY_NUT_QUALITY_01',
  'NUT_SUCCESS_01',
]);

const CLARIFY_WHY_NOW_01 = {
  code: 'CLARIFY_WHY_NOW_01',
  section: 'Précision rapide',
  text: 'Pourquoi cet objectif est-il important pour vous maintenant?',
  helper: 'Une phrase suffit.',
  type: 'short_text',
  tags: ['narrative', 'narrative_clarification', 'why_now'],
  scoringDirection: 'none',
  required: false,
  maxLength: 240,
};

export const SEED_QUESTIONS_V43_BASE = SEED_QUESTIONS_V42_BASE.map((question) => ({ ...question }));
export const SEED_QUESTIONS_V43_SCORING_ADAPTIVE = SEED_QUESTIONS_V42_SCORING_ADAPTIVE.map((question) => ({ ...question }));
export const SEED_QUESTIONS_V43_NARRATIVE = [
  CLARIFY_WHY_NOW_01,
  ...SEED_QUESTIONS_V42_NARRATIVE.map((question) => ({ ...question })),
];

export const SEED_QUESTIONS_V43 = [
  ...SEED_QUESTIONS_V43_BASE,
  ...SEED_QUESTIONS_V43_SCORING_ADAPTIVE,
  ...SEED_QUESTIONS_V43_NARRATIVE,
];

export const QUESTIONNAIRE_V43_BASE_COUNT = SEED_QUESTIONS_V43_BASE.length;
export const QUESTIONNAIRE_V43_SCORING_ADAPTIVE_MAX = 4;
export const QUESTIONNAIRE_V43_NARRATIVE_MAX = 2;
export const QUESTIONNAIRE_V43_HARD_MAX = 40;

export const V43_ADAPTIVE_BANK_CODES = [
  ...V43_SCORING_ADAPTIVE_CODES,
  ...V43_NARRATIVE_BANK_CODES,
];

void SEED_QUESTIONS_V42;
