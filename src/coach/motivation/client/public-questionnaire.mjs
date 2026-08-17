/**
 * Browser-safe questionnaire helpers. Display + adaptive selection only.
 * Never computes or returns an official report.
 */

import {
  OFFICIAL_ADAPTIVE_MAX,
  OFFICIAL_BASE_COUNT,
  OFFICIAL_V42_HARD_MAX,
  OFFICIAL_V42_NARRATIVE_MAX,
  OFFICIAL_V42_SCORING_ADAPTIVE_MAX,
  OFFICIAL_V43_HARD_MAX,
  OFFICIAL_V43_NARRATIVE_MAX,
  OFFICIAL_V43_SCORING_ADAPTIVE_MAX,
  assertOfficialMotivationBundle,
} from './official-bundle.mjs';
import {
  SEED_QUESTIONS_V41,
  V41_BASE_CODES,
} from '../questionnaire/seed-questions-v41.mjs';
import {
  SEED_QUESTIONS_V42,
  V42_BASE_CODES,
  V42_NARRATIVE_BANK_CODES,
  V42_SCORING_ADAPTIVE_CODES,
} from '../questionnaire/seed-questions-v42.mjs';
import {
  SEED_QUESTIONS_V43,
  V43_BASE_CODES,
  V43_NARRATIVE_BANK_CODES,
  V43_SCORING_ADAPTIVE_CODES,
} from '../questionnaire/seed-questions-v43.mjs';
import { toEngineQuestionInput } from '../engine/to-question-input.mjs';
import { selectAdaptiveQuestionsV41 } from '../lib/adaptive-questions-v41.mjs';
import { selectAdaptiveQuestionsV42 } from '../lib/adaptive-questions-v42.mjs';
import { selectAdaptiveQuestionsV43 } from '../lib/adaptive-questions-v43.mjs';
import {
  frozenNarrativePresentedCodes,
  selectionAnswersForNarrative,
} from '../engine/narrative-selection.mjs';

const V41_INPUTS = SEED_QUESTIONS_V41.map((seed, index) => toEngineQuestionInput(seed, index));
const V41_BY_CODE = new Map(SEED_QUESTIONS_V41.map((question) => [question.code, question]));
const V42_INPUTS = SEED_QUESTIONS_V42.map((seed, index) => toEngineQuestionInput(seed, index));
const V42_BY_CODE = new Map(SEED_QUESTIONS_V42.map((question) => [question.code, toEngineQuestionInput(question, 0)]));
const V43_INPUTS = SEED_QUESTIONS_V43.map((seed, index) => toEngineQuestionInput(seed, index));
const V43_BY_CODE = new Map(SEED_QUESTIONS_V43.map((question) => [question.code, toEngineQuestionInput(question, 0)]));

function runtimeFor(version) {
  if (version === 'questionnaire-v4.3') {
    return {
      version: 'questionnaire-v4.3',
      baseCodes: V43_BASE_CODES,
      scoringCodes: V43_SCORING_ADAPTIVE_CODES,
      narrativeCodes: V43_NARRATIVE_BANK_CODES,
      questionsByCode: V43_BY_CODE,
      questionInputs: V43_INPUTS,
      baseCount: OFFICIAL_BASE_COUNT,
      adaptiveMax: OFFICIAL_V43_SCORING_ADAPTIVE_MAX,
      narrativeMax: OFFICIAL_V43_NARRATIVE_MAX,
      hardMax: OFFICIAL_V43_HARD_MAX,
    };
  }
  if (version === 'questionnaire-v4.2') {
    return {
      version: 'questionnaire-v4.2',
      baseCodes: V42_BASE_CODES,
      scoringCodes: V42_SCORING_ADAPTIVE_CODES,
      narrativeCodes: V42_NARRATIVE_BANK_CODES,
      questionsByCode: V42_BY_CODE,
      questionInputs: V42_INPUTS,
      baseCount: OFFICIAL_BASE_COUNT,
      adaptiveMax: OFFICIAL_V42_SCORING_ADAPTIVE_MAX,
      narrativeMax: OFFICIAL_V42_NARRATIVE_MAX,
      hardMax: OFFICIAL_V42_HARD_MAX,
    };
  }
  return {
    version: 'questionnaire-v4.1',
    baseCodes: V41_BASE_CODES,
    scoringCodes: [],
    narrativeCodes: [],
    questionsByCode: V41_BY_CODE,
    questionInputs: V41_INPUTS,
    baseCount: OFFICIAL_BASE_COUNT,
    adaptiveMax: OFFICIAL_ADAPTIVE_MAX,
    narrativeMax: 0,
    hardMax: OFFICIAL_BASE_COUNT + OFFICIAL_ADAPTIVE_MAX,
  };
}

export function createQuestionnaireRuntime(inviteOrVersion) {
  const version = typeof inviteOrVersion === 'string'
    ? inviteOrVersion
    : inviteOrVersion?.questionnaire_version || inviteOrVersion?.questionnaireVersion || 'questionnaire-v4.1';
  return runtimeFor(version);
}

export function getMotivationQuestion(code, runtime = runtimeFor('questionnaire-v4.1')) {
  return runtime.questionsByCode.get(code) || V41_BY_CODE.get(code) || V42_BY_CODE.get(code) || V43_BY_CODE.get(code) || null;
}

export function getBaseMotivationQuestions(runtime = runtimeFor('questionnaire-v4.1')) {
  return runtime.baseCodes.map((code) => runtime.questionsByCode.get(code)).filter(Boolean);
}

export function selectClientAdaptiveQuestions(answers, runtime = runtimeFor('questionnaire-v4.1')) {
  if (runtime.version === 'questionnaire-v4.3') {
    return selectAdaptiveQuestionsV43({
      questions: runtime.questionInputs,
      answers,
    }).scoring.map((question) => question.code);
  }
  if (runtime.version === 'questionnaire-v4.2') {
    return selectAdaptiveQuestionsV42({
      questions: runtime.questionInputs,
      answers,
    }).scoring.map((question) => question.code);
  }
  return selectAdaptiveQuestionsV41({
    questions: runtime.questionInputs,
    answers,
    max: runtime.adaptiveMax,
  }).map((question) => question.code);
}

export function selectClientNarrativeQuestions(answers, runtime = runtimeFor('questionnaire-v4.1')) {
  const selectionAnswers = selectionAnswersForNarrative(runtime.narrativeCodes, answers);
  if (runtime.version === 'questionnaire-v4.3') {
    return selectAdaptiveQuestionsV43({
      questions: runtime.questionInputs,
      answers: selectionAnswers,
    }).narrative.map((question) => question.code);
  }
  if (runtime.version !== 'questionnaire-v4.2') return [];
  return selectAdaptiveQuestionsV42({
    questions: runtime.questionInputs,
    answers: selectionAnswers,
  }).narrative.map((question) => question.code);
}

export function presentedCodesFromAnswers(answers, existingCodes = [], runtime = runtimeFor('questionnaire-v4.1')) {
  const base = [...runtime.baseCodes];
  const baseAnswers = answers.filter((answer) => runtime.baseCodes.includes(answer.questionCode));
  const adaptive = baseAnswers.length >= runtime.baseCodes.length
    ? selectClientAdaptiveQuestions(baseAnswers, runtime)
    : [];
  const allBaseAnswered = baseAnswers.length >= runtime.baseCodes.length;
  const scoringAnswered = adaptive.every((code) => answers.some((answer) => answer.questionCode === code));
  const readyForNarrative = allBaseAnswered
    && (runtime.version === 'questionnaire-v4.2' || runtime.version === 'questionnaire-v4.3')
    && (adaptive.length === 0 || scoringAnswered);
  const frozenNarrative = frozenNarrativePresentedCodes(existingCodes, runtime.narrativeCodes);
  const narrative = frozenNarrative.length > 0
    ? frozenNarrative
    : readyForNarrative
      ? selectClientNarrativeQuestions(answers, runtime)
      : [];
  const merged = [...base];
  for (const code of existingCodes) {
    if (!merged.includes(code) && runtime.questionsByCode.has(code)) merged.push(code);
  }
  for (const code of adaptive) {
    if (!merged.includes(code)) merged.push(code);
  }
  for (const code of narrative) {
    if (!merged.includes(code)) merged.push(code);
  }
  return merged.slice(0, runtime.hardMax);
}

export function answerFromControl(question, value) {
  const keyed = { questionCode: question.code, questionId: question.code };
  const type = question.type ?? 'likert';
  if (type === 'multiple_choice') {
    return { ...keyed, selectedOptions: Array.isArray(value) ? value : [] };
  }
  if (type === 'single_choice') {
    return { ...keyed, selectedOptions: value ? [value] : [] };
  }
  if (type === 'short_text' || type === 'long_text') {
    return { ...keyed, textValue: String(value || '') };
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? { ...keyed, numericValue: numeric } : keyed;
}

export function controlValueFromAnswer(question, answer) {
  if (!answer) return question.type === 'multiple_choice' ? [] : '';
  if (question.type === 'multiple_choice') return [...(answer.selectedOptions || [])];
  if (question.type === 'single_choice') return answer.selectedOptions?.[0] || '';
  if (question.type === 'short_text' || question.type === 'long_text') return answer.textValue || '';
  return answer.numericValue == null ? '' : String(answer.numericValue);
}

export function isQuestionAnswered(question, answer) {
  if (!answer) return false;
  const type = question.type ?? 'likert';
  if (type === 'multiple_choice' || type === 'single_choice') {
    return Array.isArray(answer.selectedOptions) && answer.selectedOptions.length > 0;
  }
  if (type === 'short_text' || type === 'long_text') {
    if (question.required === false) return true;
    return String(answer.textValue || '').trim().length > 0;
  }
  return Number.isFinite(Number(answer.numericValue));
}

export {
  assertOfficialMotivationBundle,
  frozenNarrativePresentedCodes,
  V41_BASE_CODES,
  V42_BASE_CODES,
  OFFICIAL_BASE_COUNT,
  OFFICIAL_ADAPTIVE_MAX,
};
