/**
 * Canonical pre-narrative snapshot for adaptive clarification replay.
 * Narrative questions are selected before the client answers them.
 * Those answers must never participate in the selection replay.
 */

/**
 * @param {unknown} answers
 * @returns {object[]}
 */
export function normalizeSelectionAnswers(answers) {
  return (Array.isArray(answers) ? answers : []).map((answer) => {
    const code = String(answer?.questionCode ?? answer?.questionId ?? '').trim();
    return {
      ...answer,
      questionCode: code,
      questionId: answer?.questionId ?? code,
    };
  }).filter((answer) => answer.questionCode);
}

/**
 * @param {Iterable<string> | null | undefined} narrativeQuestionCodes
 * @param {unknown} answers
 * @returns {object[]}
 */
export function selectionAnswersForNarrative(narrativeQuestionCodes, answers) {
  const narrativeSet = new Set(narrativeQuestionCodes ?? []);
  return normalizeSelectionAnswers(answers)
    .filter((answer) => !narrativeSet.has(answer.questionCode));
}

/**
 * Narrative codes already presented for this submission. Immutable once chosen.
 * @param {Iterable<string> | null | undefined} existingCodes
 * @param {Iterable<string> | null | undefined} narrativeQuestionCodes
 * @returns {string[]}
 */
export function frozenNarrativePresentedCodes(existingCodes, narrativeQuestionCodes) {
  const narrativeSet = new Set(narrativeQuestionCodes ?? []);
  return (Array.isArray(existingCodes) ? existingCodes : [])
    .filter((code) => narrativeSet.has(code));
}
