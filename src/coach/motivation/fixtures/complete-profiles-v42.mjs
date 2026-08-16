import {
  QUESTIONNAIRE_V42,
  REPORT_MODEL_V43,
  RULESET_V42,
  resolveMotivationEngine,
} from '../versions/motivation-versions.mjs';
import {
  analyzeMotivationAssessment,
  expectedAdaptiveQuestionCodes,
  expectedNarrativeQuestionCodes,
} from '../engine/analyze-motivation.mjs';
import { PROFILE_A_STABLE, PROFILE_B_RISKS, PROFILE_C_ADAPTIVE_NUTRITION } from './complete-profiles.mjs';

const VERSIONS = {
  questionnaireVersion: QUESTIONNAIRE_V42,
  rulesetVersion: RULESET_V42,
  reportModelVersion: REPORT_MODEL_V43,
};

function answerForSeed(question, values) {
  const code = question.code;
  const keyed = { questionCode: code, questionId: code };
  if (question.type === 'multiple_choice') {
    return { ...keyed, selectedOptions: values.multi?.[code] ?? [] };
  }
  if (question.type === 'single_choice') {
    const label = values.choice?.[code];
    return label ? { ...keyed, selectedOptions: [label] } : keyed;
  }
  if (question.type === 'short_text' || question.type === 'long_text') {
    return { ...keyed, textValue: values.text?.[code] ?? '' };
  }
  return { ...keyed, numericValue: values.likert?.[code] ?? values.adaptiveLikert?.[code] ?? 3 };
}

export function buildCompleteMotivationSubmissionV42(values, extras = {}) {
  const engine = resolveMotivationEngine(VERSIONS);
  const baseQuestions = engine.questionInputs.filter((question) => (
    engine.baseQuestionCodes.includes(question.code)
  ));
  const baseAnswers = baseQuestions.map((question) => answerForSeed(question, values));
  const adaptiveCodes = expectedAdaptiveQuestionCodes(engine, baseAnswers);
  const adaptiveAnswers = adaptiveCodes.map((code) => {
    const question = engine.questionInputs.find((item) => item.code === code);
    return answerForSeed(question, values);
  });
  const afterScoring = [...baseAnswers, ...adaptiveAnswers];
  const narrativeCodes = expectedNarrativeQuestionCodes(engine, afterScoring);
  const narrativeAnswers = narrativeCodes.map((code) => {
    const question = engine.questionInputs.find((item) => item.code === code);
    return answerForSeed(question, values);
  });
  return {
    ...VERSIONS,
    presentedQuestionCodes: [...engine.baseQuestionCodes, ...adaptiveCodes, ...narrativeCodes],
    answers: [...afterScoring, ...narrativeAnswers],
    assessmentId: extras.assessmentId ?? 'asm_v42',
    clientId: extras.clientId ?? 'client_v42',
    clientName: extras.clientName ?? 'Client v4.2',
    clientCoachId: extras.clientCoachId ?? 'coach',
    completedAt: extras.completedAt ?? new Date('2026-08-16T16:00:00.000Z'),
    expectedAdaptiveQuestionCodes: adaptiveCodes,
    expectedNarrativeQuestionCodes: narrativeCodes,
  };
}

export function analyzeCompleteMotivationProfileV42(values, extras = {}) {
  const submission = buildCompleteMotivationSubmissionV42(values, extras);
  return { submission, result: analyzeMotivationAssessment(submission) };
}

export const V42_AESTHETIC = {
  id: 'aesthetic',
  likert: { ...PROFILE_B_RISKS.likert, MOT_RES_01: 5, MOT_AUTO_01: 2 },
  text: {
    GOAL_01: 'perdre du poids',
    GOAL_02: 'miroir',
    OBS_01: 'manque de temps',
    NUT_GOAL_01: 'qualité',
    NUT_CONTEXT_01: '',
    CLARIFY_GOAL_MEANING_01: 'me sentir plus à l\'aise dans mes vêtements au quotidien',
    CLARIFY_SUCCESS_01: 'plus d\'énergie après les séances',
    CLARIFY_NUT_QUALITY_01: '',
  },
  choice: {
    CLARIFY_NUT_QUALITY_01: 'plus de régularité',
  },
  multi: PROFILE_B_RISKS.multi || { NUT_OBS_01: ['Manque de planification'] },
};

export const V42_AUTONOMOUS = {
  id: 'autonomous',
  likert: { ...PROFILE_A_STABLE.likert, MOT_AUTO_01: 5, STRUCT_03: 1, CHOICE_01: 5, CHOICE_03: 1 },
  text: {
    GOAL_01: 'devenir plus fort pour mon sport parce que la saison commence',
    GOAL_02: 'charges plus élevées et meilleure récupération',
    OBS_01: 'horaire variable, travail / famille',
    NUT_GOAL_01: 'régularité des repas',
    NUT_CONTEXT_01: 'soupers familiaux',
  },
  multi: { NUT_OBS_01: ['Horaire de travail variable'] },
};

export const V42_FRAGILE = {
  id: 'fragile',
  likert: { ...PROFILE_C_ADAPTIVE_NUTRITION.likert, EFF_01: 1, EFF_02: 1, RIG_01: 5, RIG_03: 5 },
  text: {
    GOAL_01: 'retrouver une routine parce que j\'ai tout arrêté',
    GOAL_02: 'tenir 3 séances par semaine sans tout abandonner',
    OBS_01: 'difficulté à reprendre après un écart',
    NUT_GOAL_01: 'planification',
    NUT_CONTEXT_01: '',
  },
  choice: {
    CLARIFY_RECOVERY_01: 'faire une version plus courte de la séance',
    CLARIFY_BARRIER_01: 'après avoir manqué une séance',
  },
  multi: { NUT_OBS_01: ['Manque de constance'] },
};

export const V42_RICH_NARRATIVE = {
  id: 'rich',
  likert: { ...PROFILE_A_STABLE.likert },
  text: {
    GOAL_01: 'me sentir plus fort dans mon sport parce que je veux rester compétitif cette saison',
    GOAL_02: 'mieux récupérer, tenir 4 séances et remonter mes charges sur squat',
    OBS_01: 'horaire variable, fatigue, travail / famille',
    NUT_GOAL_01: 'préparer plus de repas pour les soirs de match',
    NUT_CONTEXT_01: 'budget limité et repas familiaux le dimanche',
  },
  multi: { NUT_OBS_01: ['Manque de temps', 'Budget'] },
};

export const V42_VAGUE = {
  id: 'vague',
  likert: { ...PROFILE_A_STABLE.likert, MOT_RES_01: 5 },
  text: {
    GOAL_01: 'forme',
    GOAL_02: 'poids',
    OBS_01: 'temps',
    NUT_GOAL_01: 'mieux manger',
    NUT_CONTEXT_01: '',
  },
  multi: { NUT_OBS_01: ['Manque de planification'] },
};

export const V42_PLANNING_CONFLICT = {
  id: 'planning_conflict',
  likert: {
    ...PROFILE_A_STABLE.likert,
    NUT_PLAN_02: 1,
    NUT_PLAN_03: 5,
  },
  text: {
    GOAL_01: 'améliorer ma composition corporelle pour mon sport',
    GOAL_02: 'plus d\'énergie et vêtements plus confortables',
    OBS_01: 'manque de temps',
    NUT_GOAL_01: 'planification',
    NUT_CONTEXT_01: '',
  },
  multi: { NUT_OBS_01: ['Manque de planification'] },
};
