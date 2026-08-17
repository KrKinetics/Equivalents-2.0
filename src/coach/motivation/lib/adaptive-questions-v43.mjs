/**
 * v4.3 adaptive selection: v4.2 scoring confirmations + v4.3 narrative bank.
 */

import { selectScoringAdaptiveQuestionsV42 } from './adaptive-questions-v42.mjs';
import { selectNarrativeClarificationsV43 } from './narrative-clarifications-v43.mjs';

export function selectAdaptiveQuestionsV43(input) {
  const scoring = selectScoringAdaptiveQuestionsV42(input);
  const scoringCodes = new Set(scoring.map((question) => question.code));
  const narrative = selectNarrativeClarificationsV43(input)
    .filter((question) => !scoringCodes.has(question.code));
  return { scoring, narrative, questions: [...scoring, ...narrative] };
}
