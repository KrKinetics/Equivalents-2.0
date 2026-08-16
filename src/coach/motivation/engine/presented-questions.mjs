/**
 * presentedQuestionCodes are the only caller-controlled questionnaire input.
 * Definitions always come from the resolved engine.
 */

export class PresentedQuestionCodesError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PresentedQuestionCodesError';
    this.details = details;
  }
}

export class AdaptiveSelectionMismatchError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AdaptiveSelectionMismatchError';
    this.details = details;
  }
}

/**
 * @param {{
 *   engine: {
 *     questionInputs: object[],
 *     baseQuestionCodes: readonly string[],
 *     adaptiveQuestionCodes: readonly string[],
 *     adaptiveMax: number,
 *     questionnaireVersion: string,
 *   },
 *   presentedQuestionCodes: unknown,
 * }} input
 */
export function resolvePresentedMotivationQuestions({ engine, presentedQuestionCodes }) {
  if (!Array.isArray(presentedQuestionCodes) || presentedQuestionCodes.length === 0) {
    throw new PresentedQuestionCodesError('presentedQuestionCodes is required');
  }

  const codes = presentedQuestionCodes.map((code) => String(code ?? '').trim());
  if (codes.some((code) => !code)) {
    throw new PresentedQuestionCodesError('presentedQuestionCodes contains an empty code');
  }

  const seen = new Set();
  for (const code of codes) {
    if (seen.has(code)) {
      throw new PresentedQuestionCodesError(`Duplicate presented question code: ${code}`, {
        code,
      });
    }
    seen.add(code);
  }

  const byCode = new Map(engine.questionInputs.map((question) => [question.code, question]));
  const unknown = codes.filter((code) => !byCode.has(code));
  if (unknown.length > 0) {
    throw new PresentedQuestionCodesError(
      `Unknown question codes for ${engine.questionnaireVersion}: ${unknown.join(', ')}`,
      { unknown },
    );
  }

  const baseSet = new Set(engine.baseQuestionCodes);
  const adaptiveSet = new Set(engine.adaptiveQuestionCodes);
  const missingBase = engine.baseQuestionCodes.filter((code) => !seen.has(code));
  if (missingBase.length > 0) {
    throw new PresentedQuestionCodesError(
      `Missing required base question codes: ${missingBase.join(', ')}`,
      { missingBase },
    );
  }

  const extraNonAdaptive = codes.filter((code) => !baseSet.has(code) && !adaptiveSet.has(code));
  if (extraNonAdaptive.length > 0) {
    throw new PresentedQuestionCodesError(
      `Question codes are not part of ${engine.questionnaireVersion}: ${extraNonAdaptive.join(', ')}`,
      { extraNonAdaptive },
    );
  }

  const adaptiveCodes = codes.filter((code) => adaptiveSet.has(code));
  if (adaptiveCodes.length > engine.adaptiveMax) {
    throw new PresentedQuestionCodesError(
      `Too many adaptive questions: ${adaptiveCodes.length} > ${engine.adaptiveMax}`,
      { adaptiveCodes },
    );
  }

  return {
    questions: codes.map((code) => byCode.get(code)),
    presentedQuestionCodes: codes,
    baseQuestionCodes: codes.filter((code) => baseSet.has(code)),
    adaptiveQuestionCodes: adaptiveCodes,
  };
}
