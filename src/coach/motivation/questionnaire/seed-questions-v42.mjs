/**
 * questionnaire-v4.2 seeds. Does not mutate questionnaire-v4.1.
 * Same 34 base Likert/open codes + scoring adaptive bank + narrative clarifications.
 */

import {
  SEED_QUESTIONS_V41_ADAPTIVE,
  SEED_QUESTIONS_V41_BASE,
  V41_ADAPTIVE_BANK_CODES,
  V41_BASE_CODES,
} from './seed-questions-v41.mjs';
import { SEED_NUTRITION_QUESTIONS } from './seed-questions.mjs';

export const V42_BASE_CODES = [...V41_BASE_CODES];
export const V42_SCORING_ADAPTIVE_CODES = [...V41_ADAPTIVE_BANK_CODES];
export const V42_NARRATIVE_BANK_CODES = Object.freeze([
  'CLARIFY_GOAL_MEANING_01',
  'CLARIFY_SUCCESS_01',
  'CLARIFY_RECOVERY_01',
  'CLARIFY_BARRIER_01',
  'CLARIFY_NUT_QUALITY_01',
  'NUT_SUCCESS_01',
]);

const OBS_CHIPS = Object.freeze([
  'manque de temps',
  'horaire variable',
  'fatigue',
  'travail / famille',
  'manque de motivation',
  'difficulté à reprendre après un écart',
  'plan trop compliqué',
  'résultats trop lents',
  'accès / équipement',
  'autre',
]);

const NUT_GOAL_CHIPS = Object.freeze([
  'planification',
  'régularité des repas',
  'portions',
  'choix alimentaires',
  'performance / récupération',
  'faim / satiété',
  'flexibilité',
  'budget',
  'autre',
]);

const NUT_QUALITY_CHIPS = Object.freeze([
  'plus de repas préparés',
  'plus de protéines',
  'plus de fruits/légumes',
  'moins d\'aliments improvisés',
  'des portions plus adaptées',
  'plus de régularité',
  'autre',
]);

const RECOVERY_OPTIONS = Object.freeze([
  'reprendre simplement à la prochaine séance prévue',
  'faire une version plus courte de la séance',
  'recevoir un rappel ou un suivi du coach',
  'avoir un plan précis de reprise',
  'ajuster temporairement mes objectifs',
  'je ne sais pas encore',
]);

const BARRIER_OPTIONS = Object.freeze([
  'avant de commencer la séance',
  'lorsqu\'une journée devient trop chargée',
  'après avoir manqué une séance',
  'après plusieurs jours moins structurés',
  'lorsque les résultats semblent trop lents',
  'autre',
]);

function patchBase(question) {
  if (question.code === 'GOAL_01') {
    return {
      ...question,
      text: 'Quel changement voulez-vous obtenir en priorité avec votre entraînement, et pourquoi est-ce important pour vous maintenant?',
      helper: 'Une ou deux phrases suffisent.',
      examples: [
        'me sentir plus fort dans mon sport',
        'retrouver une routine',
        'améliorer ma composition corporelle',
        'avoir plus d\'énergie',
      ],
      maxLength: 320,
      required: true,
      type: 'short_text',
    };
  }
  if (question.code === 'GOAL_02') {
    return {
      ...question,
      text: 'Dans 8 à 12 semaines, qu\'est-ce qui vous ferait dire : « ça fonctionne vraiment »?',
      helper: 'Pensez à un ou plusieurs signes concrets : performance, constance, énergie, mesures, vêtements, récupération ou autre.',
      maxLength: 320,
      required: true,
      type: 'long_text',
    };
  }
  if (question.code === 'OBS_01') {
    return {
      ...question,
      text: 'Qu\'est-ce qui risque le plus de faire dérailler votre entraînement dans une semaine normale?',
      helper: 'Choisissez jusqu\'à 3 suggestions ou écrivez librement.',
      chips: [...OBS_CHIPS],
      maxSelections: 3,
      maxLength: 280,
      required: false,
      type: 'long_text',
    };
  }
  if (question.code === 'NUT_GOAL_01') {
    return {
      ...question,
      text: 'Quel changement alimentaire concret vous aiderait le plus dans une semaine normale?',
      helper: 'Une phrase suffit. Vous pouvez aussi choisir une suggestion.',
      chips: [...NUT_GOAL_CHIPS],
      maxLength: 240,
      required: false,
      type: 'long_text',
    };
  }
  if (question.code === 'NUT_CONTEXT_01') {
    return {
      ...question,
      text: 'Y a-t-il une contrainte ou préférence que votre structure alimentaire doit absolument respecter?',
      helper: 'Ex.: horaires, famille, culture, budget, aliments, temps disponible ou préférences.',
      maxLength: 280,
      required: false,
      type: 'long_text',
    };
  }
  return { ...question };
}

function nutSuccessSeed() {
  const source = SEED_NUTRITION_QUESTIONS.find((item) => item.code === 'NUT_SUCCESS_01');
  return {
    ...source,
    text: 'Après 8 à 12 semaines, quels changements vous feraient dire que votre structure alimentaire fonctionne?',
    helper: 'Une ou deux phrases suffisent.',
    maxLength: 280,
    required: false,
    type: 'long_text',
    tags: [...new Set([...(source?.tags ?? []), 'narrative', 'narrative_clarification'])],
    section: 'Précision rapide',
  };
}

export const SEED_QUESTIONS_V42_BASE = SEED_QUESTIONS_V41_BASE.map(patchBase);
export const SEED_QUESTIONS_V42_SCORING_ADAPTIVE = SEED_QUESTIONS_V41_ADAPTIVE.map((question) => ({
  ...question,
}));

export const SEED_QUESTIONS_V42_NARRATIVE = [
  {
    code: 'CLARIFY_GOAL_MEANING_01',
    section: 'Précision rapide',
    text: 'Qu\'est-ce que l\'atteinte de cet objectif changerait concrètement pour vous dans votre quotidien?',
    helper: 'Une phrase suffit.',
    type: 'short_text',
    tags: ['narrative', 'narrative_clarification', 'goal'],
    scoringDirection: 'none',
    required: false,
    maxLength: 240,
  },
  {
    code: 'CLARIFY_SUCCESS_01',
    section: 'Précision rapide',
    text: 'En plus du miroir ou du poids, quel autre signe vous montrerait que vous progressez?',
    helper: 'Une phrase suffit.',
    type: 'short_text',
    tags: ['narrative', 'narrative_clarification', 'success'],
    scoringDirection: 'none',
    required: false,
    maxLength: 240,
  },
  {
    code: 'CLARIFY_RECOVERY_01',
    section: 'Précision rapide',
    text: 'Quand une semaine se passe mal, qu\'est-ce qui vous aiderait le plus à reprendre rapidement?',
    type: 'single_choice',
    tags: ['narrative', 'narrative_clarification', 'recovery'],
    scoringDirection: 'none',
    required: false,
    options: [...RECOVERY_OPTIONS],
  },
  {
    code: 'CLARIFY_BARRIER_01',
    section: 'Précision rapide',
    text: 'À quel moment cet obstacle vous fait-il habituellement décrocher?',
    type: 'single_choice',
    tags: ['narrative', 'narrative_clarification', 'obstacle'],
    scoringDirection: 'none',
    required: false,
    options: [...BARRIER_OPTIONS],
  },
  {
    code: 'CLARIFY_NUT_QUALITY_01',
    section: 'Précision rapide',
    text: 'Quand vous dites « qualité alimentaire », qu\'aimeriez-vous changer concrètement?',
    helper: 'Choisissez la piste la plus proche.',
    type: 'single_choice',
    tags: ['narrative', 'narrative_clarification', 'nutrition'],
    scoringDirection: 'none',
    required: false,
    chips: [...NUT_QUALITY_CHIPS],
    options: [...NUT_QUALITY_CHIPS],
  },
  nutSuccessSeed(),
];

export const SEED_QUESTIONS_V42 = [
  ...SEED_QUESTIONS_V42_BASE,
  ...SEED_QUESTIONS_V42_SCORING_ADAPTIVE,
  ...SEED_QUESTIONS_V42_NARRATIVE,
];

export const QUESTIONNAIRE_V42_BASE_COUNT = SEED_QUESTIONS_V42_BASE.length;
export const QUESTIONNAIRE_V42_SCORING_ADAPTIVE_MAX = 4;
export const QUESTIONNAIRE_V42_NARRATIVE_MAX = 2;
export const QUESTIONNAIRE_V42_HARD_MAX = 40;
export const QUESTIONNAIRE_V42_TOTAL_MAX = QUESTIONNAIRE_V42_BASE_COUNT
  + QUESTIONNAIRE_V42_SCORING_ADAPTIVE_MAX
  + QUESTIONNAIRE_V42_NARRATIVE_MAX;

export const V42_ADAPTIVE_BANK_CODES = [
  ...V42_SCORING_ADAPTIVE_CODES,
  ...V42_NARRATIVE_BANK_CODES,
];
