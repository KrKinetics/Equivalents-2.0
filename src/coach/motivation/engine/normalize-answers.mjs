import { optionIdByLabel } from './to-question-input.mjs';

export class MotivationAnswerError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'MotivationAnswerError';
    this.details = details;
  }
}

function answerCode(answer) {
  const code = String(answer?.questionCode ?? answer?.questionId ?? '').trim();
  return code || null;
}

/**
 * Accepts answers keyed by questionCode (preferred) or questionId-as-code.
 * Never trusts caller-supplied question definitions.
 */
export function normalizeMotivationAnswers(answers, presentedQuestions) {
  if (!Array.isArray(answers)) {
    throw new MotivationAnswerError('answers must be an array');
  }
  const byCode = new Map(presentedQuestions.map((question) => [question.code, question]));
  const seen = new Set();
  const normalized = [];

  for (const answer of answers) {
    const code = answerCode(answer);
    if (!code) {
      throw new MotivationAnswerError('Each answer must include questionCode');
    }
    const question = byCode.get(code);
    if (!question) {
      throw new MotivationAnswerError(
        `Answer for ${code} is not in presentedQuestionCodes`,
        { code },
      );
    }
    if (seen.has(code)) {
      throw new MotivationAnswerError(`Duplicate answer for ${code}`, { code });
    }
    seen.add(code);

    let selectedOptionIds = answer.selectedOptionIds;
    if ((!selectedOptionIds || selectedOptionIds.length === 0) && Array.isArray(answer.selectedOptions)) {
      selectedOptionIds = answer.selectedOptions.map((label) => optionIdByLabel(question, label));
    }

    normalized.push({
      questionId: question.id,
      questionCode: code,
      numericValue: answer.numericValue,
      textValue: answer.textValue,
      selectedOptionIds,
    });
  }

  return normalized;
}
