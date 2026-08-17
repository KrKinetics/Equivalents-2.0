import {
  QUESTIONNAIRE_V43,
  REPORT_MODEL_V44,
  RULESET_V42,
  resolveMotivationEngine,
} from '../versions/motivation-versions.mjs';
import {
  analyzeMotivationAssessment,
  expectedAdaptiveQuestionCodes,
  expectedNarrativeQuestionCodes,
} from '../engine/analyze-motivation.mjs';
import {
  V42_AESTHETIC,
  V42_AUTONOMOUS,
  V42_FRAGILE,
  V42_PLANNING_CONFLICT,
  V42_RICH_NARRATIVE,
  V42_VAGUE,
} from './complete-profiles-v42.mjs';
import { PROFILE_A_STABLE, PROFILE_C_ADAPTIVE_NUTRITION } from './complete-profiles.mjs';

const VERSIONS = {
  questionnaireVersion: QUESTIONNAIRE_V43,
  rulesetVersion: RULESET_V42,
  reportModelVersion: REPORT_MODEL_V44,
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

export function buildCompleteMotivationSubmissionV43(values, extras = {}) {
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
    assessmentId: extras.assessmentId ?? 'asm_v43',
    clientId: extras.clientId ?? 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    clientName: extras.clientName ?? 'Client test KR',
    clientCoachId: extras.clientCoachId ?? 'coach',
    completedAt: extras.completedAt ?? new Date('2026-08-16T16:00:00.000Z'),
    expectedAdaptiveQuestionCodes: adaptiveCodes,
    expectedNarrativeQuestionCodes: narrativeCodes,
  };
}

export function analyzeCompleteMotivationProfileV43(values, extras = {}) {
  const submission = buildCompleteMotivationSubmissionV43(values, extras);
  return { submission, result: analyzeMotivationAssessment(submission) };
}

export const V43_COHERENT = {
  ...V42_RICH_NARRATIVE,
  id: 'coherent',
  likert: {
    ...PROFILE_A_STABLE.likert,
    ...PROFILE_C_ADAPTIVE_NUTRITION.likert,
    EFF_01: 5,
    EFF_02: 5,
    NUT_PLAN_02: 5,
    NUT_PLAN_03: 5,
  },
};

export const V43_MIXED = {
  ...V42_FRAGILE,
  id: 'mixed',
  likert: {
    ...V42_FRAGILE.likert,
    EFF_01: 5,
    EFF_02: 1,
    RIG_01: 5,
    RIG_03: 1,
  },
};

export const V43_NUTRITION = {
  ...V42_PLANNING_CONFLICT,
  id: 'nutrition',
  text: {
    ...V42_PLANNING_CONFLICT.text,
    NUT_GOAL_01: 'budget et planification',
    OBS_01: 'budget, horaire variable',
  },
  multi: { NUT_OBS_01: ['Budget', 'Manque de planification'] },
};

export const V43_WEAK = {
  ...V42_VAGUE,
  id: 'weak',
  text: {
    GOAL_01: 'forme',
    GOAL_02: 'me sentir fort',
    OBS_01: 'temps',
    NUT_GOAL_01: 'qualité',
    NUT_CONTEXT_01: '',
  },
};

export const V43_AESTHETIC = V42_AESTHETIC;
export const V43_AUTONOMOUS = V42_AUTONOMOUS;

/** Live 17 Aug 2026: WHY_NOW answer used to mutate the narrative set on v4.3 replay. */
export const V43_LIVE_WHY_NOW_REPLAY = {
  id: 'live_why_now_replay',
  likert: {
    ...PROFILE_C_ADAPTIVE_NUTRITION.likert,
    EFF_01: 1,
    EFF_02: 1,
    RIG_01: 5,
    RIG_03: 5,
  },
  text: {
    GOAL_01: 'reprendre une routine d entrainement',
    GOAL_02: 'tenir 3 seances par semaine sans abandonner',
    OBS_01: 'difficulte a reprendre apres un ecart de plusieurs jours',
    NUT_GOAL_01: 'budget et planification',
    NUT_CONTEXT_01: '',
    CLARIFY_WHY_NOW_01: 'parce que je veux reprendre maintenant pour ma sante',
    NUT_SUCCESS_01: 'des repas plus reguliers et moins de decrochages en semaine',
  },
  choice: {
    CLARIFY_RECOVERY_01: 'faire une version plus courte de la séance',
  },
  multi: { NUT_OBS_01: ['Budget', 'Manque de planification'] },
};
