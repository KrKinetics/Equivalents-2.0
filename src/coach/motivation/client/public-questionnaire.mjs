/**
 * Browser-safe v4.1 questionnaire helpers. Display + adaptive selection only.
 * Never computes or returns an official report.
 */

import {
  OFFICIAL_ADAPTIVE_MAX,
  OFFICIAL_BASE_COUNT,
  assertOfficialMotivationBundle,
} from './official-bundle.mjs';
import {
  SEED_QUESTIONS_V41,
  V41_BASE_CODES,
} from '../questionnaire/seed-questions-v41.mjs';
import { toEngineQuestionInput } from '../engine/to-question-input.mjs';
import { selectAdaptiveQuestionsV41 } from '../lib/adaptive-questions-v41.mjs';

const QUESTION_INPUTS = SEED_QUESTIONS_V41.map((seed, index) => toEngineQuestionInput(seed, index));
const QUESTION_BY_CODE = new Map(SEED_QUESTIONS_V41.map((question) => [question.code, question]));

export function getMotivationQuestion(code) {
  return QUESTION_BY_CODE.get(code) || null;
}

export function getBaseMotivationQuestions() {
  return V41_BASE_CODES.map((code) => QUESTION_BY_CODE.get(code)).filter(Boolean);
}

export function selectClientAdaptiveQuestions(answers) {
  return selectAdaptiveQuestionsV41({
    questions: QUESTION_INPUTS,
    answers,
    max: OFFICIAL_ADAPTIVE_MAX,
  }).map((question) => question.code);
}

export function presentedCodesFromAnswers(answers, existingCodes = []) {
  const base = [...V41_BASE_CODES];
  const adaptive = selectClientAdaptiveQuestions(
    answers.filter((answer) => V41_BASE_CODES.includes(answer.questionCode)),
  );
  const merged = [...base];
  for (const code of existingCodes) {
    if (!merged.includes(code) && QUESTION_BY_CODE.has(code)) merged.push(code);
  }
  for (const code of adaptive) {
    if (!merged.includes(code)) merged.push(code);
  }
  return merged.slice(0, OFFICIAL_BASE_COUNT + OFFICIAL_ADAPTIVE_MAX);
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

export { assertOfficialMotivationBundle, V41_BASE_CODES, OFFICIAL_BASE_COUNT, OFFICIAL_ADAPTIVE_MAX };
