import {
  QUESTIONNAIRE_V41,
  REPORT_MODEL_V42,
  RULESET_V41,
  resolveMotivationEngine,
} from '../versions/motivation-versions.mjs';
import { analyzeMotivationAssessment, expectedAdaptiveQuestionCodes } from '../engine/analyze-motivation.mjs';
import { TEST1000098_LIKERT, TEST1000098_MULTI, TEST1000098_TEXT } from './test-1000098.mjs';

const VERSIONS = {
  questionnaireVersion: QUESTIONNAIRE_V41,
  rulesetVersion: RULESET_V41,
  reportModelVersion: REPORT_MODEL_V42,
};

function answerForSeed(question, values) {
  const code = question.code;
  const keyed = { questionCode: code, questionId: code };
  if (question.type === 'multiple_choice') {
    return { ...keyed, selectedOptions: values.multi[code] ?? [] };
  }
  if (question.type === 'single_choice') {
    const label = values.choice[code];
    return label ? { ...keyed, selectedOptions: [label] } : keyed;
  }
  if (question.type === 'short_text' || question.type === 'long_text') {
    return { ...keyed, textValue: values.text[code] ?? '' };
  }
  return { ...keyed, numericValue: values.likert[code] ?? 3 };
}

/**
 * Builds a complete v4.1 submission: all base codes + the deterministic adaptive set.
 */
export function buildCompleteMotivationSubmission(values, extras = {}) {
  const engine = resolveMotivationEngine(VERSIONS);
  const baseQuestions = engine.questionInputs.filter((question) =>
    engine.baseQuestionCodes.includes(question.code),
  );
  const baseAnswers = baseQuestions.map((question) => answerForSeed(question, values));
  const adaptiveCodes = expectedAdaptiveQuestionCodes(engine, baseAnswers);
  const adaptiveAnswers = adaptiveCodes.map((code) => ({
    questionCode: code,
    numericValue: values.adaptiveLikert?.[code] ?? values.likert[code] ?? 3,
  }));

  return {
    ...VERSIONS,
    presentedQuestionCodes: [...engine.baseQuestionCodes, ...adaptiveCodes],
    answers: [...baseAnswers, ...adaptiveAnswers],
    assessmentId: extras.assessmentId ?? 'asm_complete',
    clientId: extras.clientId ?? 'client_complete',
    clientName: extras.clientName ?? 'Client complet',
    clientCoachId: extras.clientCoachId ?? 'coach',
    completedAt: extras.completedAt ?? new Date('2026-08-16T16:00:00.000Z'),
    expectedAdaptiveQuestionCodes: adaptiveCodes,
  };
}

export function analyzeCompleteMotivationProfile(values, extras = {}) {
  const submission = buildCompleteMotivationSubmission(values, extras);
  const result = analyzeMotivationAssessment(submission);
  return { submission, result };
}

/** A — relatively stable / favorable. */
export const PROFILE_A_STABLE = {
  id: 'A',
  likert: {
    MOT_AUTO_01: 4,
    MOT_RES_01: 3,
    EFF_01: 5,
    EFF_02: 4,
    CONS_01: 4,
    RIG_01: 2,
    RIG_03: 2,
    EFFORT_02: 2,
    LT_03: 4,
    STRUCT_03: 3,
    EXPL_01: 3,
    CHOICE_01: 3,
    CHOICE_03: 2,
    COACH_01: 4,
    NUT_ROLE_01: 4,
    NUT_PERF_01: 4,
    NUT_PLAN_02: 2,
    NUT_PLAN_03: 4,
    NUT_FLEX_01: 4,
    NUT_COMP_01: 2,
    NUT_COMP_03: 2,
    NUT_EMO_01: 2,
    NUT_EMO_02: 2,
    NUT_STRUCT_01: 3,
    NUT_STRUCT_03: 3,
    NUT_SIGNAL_01: 4,
    NUT_SIGNAL_03: 4,
  },
  text: {
    GOAL_01: 'améliorer mon endurance',
    GOAL_02: 'courir 10 km sans m\'arrêter',
    OBS_01: 'horaire chargé',
    NUT_GOAL_01: 'mieux planifier mes repas',
    NUT_CONTEXT_01: 'soupers familiaux le dimanche',
  },
  multi: {
    NUT_OBS_01: ['Manque de temps'],
  },
  choice: {
    NUT_PREF_01: 'Des principes flexibles avec beaucoup de liberté',
  },
  adaptiveLikert: {},
};

/** B — several risks and contradictions. */
export const PROFILE_B_RISKS = {
  id: 'B',
  likert: {
    MOT_AUTO_01: 5,
    MOT_RES_01: 5,
    EFF_01: 5,
    EFF_02: 5,
    CONS_01: 2,
    RIG_01: 5,
    RIG_03: 5,
    EFFORT_02: 5,
    LT_03: 1,
    STRUCT_03: 5,
    EXPL_01: 5,
    CHOICE_01: 2,
    CHOICE_03: 5,
    COACH_01: 2,
    NUT_ROLE_01: 2,
    NUT_PERF_01: 2,
    NUT_PLAN_02: 5,
    NUT_PLAN_03: 2,
    NUT_FLEX_01: 2,
    NUT_COMP_01: 5,
    NUT_COMP_03: 5,
    NUT_EMO_01: 5,
    NUT_EMO_02: 4,
    NUT_STRUCT_01: 5,
    NUT_STRUCT_03: 5,
    NUT_SIGNAL_01: 2,
    NUT_SIGNAL_03: 2,
  },
  text: {
    GOAL_01: 'perdre du poids rapidement',
    GOAL_02: 'voir le changement dans le miroir',
    OBS_01: 'je lâche dès que ça n\'avance pas',
    NUT_GOAL_01: 'couper le sucre',
    NUT_CONTEXT_01: 'je compenser après un écart',
  },
  multi: {
    NUT_OBS_01: ['Stress ou émotions', 'Envies fréquentes', 'Manque de planification'],
  },
  choice: {
    NUT_PREF_01: 'Un menu précis avec des quantités',
  },
  adaptiveLikert: {},
};

/** C — adaptive confirmation + nutrition levers. */
export const PROFILE_C_ADAPTIVE_NUTRITION = {
  id: 'C',
  likert: {
    MOT_AUTO_01: 3,
    MOT_RES_01: 4,
    EFF_01: 2,
    EFF_02: 2,
    CONS_01: 2,
    RIG_01: 4,
    RIG_03: 4,
    EFFORT_02: 4,
    LT_03: 2,
    STRUCT_03: 4,
    EXPL_01: 2,
    CHOICE_01: 4,
    CHOICE_03: 4,
    COACH_01: 3,
    NUT_ROLE_01: 3,
    NUT_PERF_01: 2,
    NUT_PLAN_02: 5,
    NUT_PLAN_03: 2,
    NUT_FLEX_01: 2,
    NUT_COMP_01: 4,
    NUT_COMP_03: 4,
    NUT_EMO_01: 4,
    NUT_EMO_02: 3,
    NUT_STRUCT_01: 4,
    NUT_STRUCT_03: 2,
    NUT_SIGNAL_01: 2,
    NUT_SIGNAL_03: 2,
  },
  text: {
    GOAL_01: 'être en forme',
    GOAL_02: 'avoir plus d\'énergie',
    OBS_01: 'manque de planification',
    NUT_GOAL_01: 'la constance',
    NUT_CONTEXT_01: 'horaires variables',
  },
  multi: {
    NUT_OBS_01: ['Manque de planification', 'Horaire de travail variable'],
  },
  choice: {
    NUT_PREF_01: 'Des modèles de repas interchangeables',
  },
  adaptiveLikert: {},
};

/** Historical TEST1000098 semantics, with adaptive codes resolved by the engine. */
export const PROFILE_TEST1000098 = {
  id: 'TEST1000098',
  likert: {
    MOT_AUTO_01: 3,
    RIG_03: 5,
    ...TEST1000098_LIKERT,
  },
  text: TEST1000098_TEXT,
  multi: TEST1000098_MULTI,
  choice: {
    NUT_PREF_01: 'Un menu précis avec des quantités',
  },
  adaptiveLikert: {},
};

export const COMPLETE_PROFILES = [
  PROFILE_A_STABLE,
  PROFILE_B_RISKS,
  PROFILE_C_ADAPTIVE_NUTRITION,
];
