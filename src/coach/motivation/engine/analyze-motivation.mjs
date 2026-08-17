/**
 * Pure motivation analysis. No HTTP, auth, mail, DOM, or database.
 * Question definitions come only from resolveMotivationEngine.
 */

import { calculateDimensionScores, getScoreMap } from '../scoring/engine.mjs';
import { calculateNutritionScores } from '../scoring/nutrition.mjs';
import { evaluateRuleset } from '../rules/engine.mjs';
import { assembleCoachReportSnapshotV42 } from '../report/v42/assemble.mjs';
import { assembleCoachReportSnapshotV43 } from '../report/v43/assemble.mjs';
import { assembleCoachReportSnapshotV44 } from '../report/v44/assemble.mjs';
import { selectAdaptiveQuestionsV41 } from '../lib/adaptive-questions-v41.mjs';
import { selectAdaptiveQuestionsV42 } from '../lib/adaptive-questions-v42.mjs';
import { selectAdaptiveQuestionsV43 } from '../lib/adaptive-questions-v43.mjs';
import {
  QUESTIONNAIRE_V42,
  QUESTIONNAIRE_V43,
  REPORT_MODEL_V43,
  REPORT_MODEL_V44,
  resolveMotivationEngine,
} from '../versions/motivation-versions.mjs';
import { buildEngineOptionLabels } from './to-question-input.mjs';
import {
  AdaptiveSelectionMismatchError,
  resolvePresentedMotivationQuestions,
} from './presented-questions.mjs';
import { normalizeMotivationAnswers } from './normalize-answers.mjs';

export class ExternalQuestionDefinitionsError extends Error {
  constructor() {
    super(
      'External question definitions are not accepted. Pass presentedQuestionCodes; the engine supplies the questionnaire.',
    );
    this.name = 'ExternalQuestionDefinitionsError';
  }
}

/**
 * Recalculates the deterministic adaptive set from complete BASE answers + the
 * full engine bank. Intermediate autosave states are not replayed — only the
 * final submitted base set is checked. That historical limitation remains:
 * a client who saw different adaptive items mid-questionnaire is validated
 * against the final base answers, not the live path they clicked through.
 */
function normalizeEngineAnswers(baseAnswers) {
  return baseAnswers.map((answer) => {
    const code = String(answer.questionCode ?? answer.questionId ?? '').trim();
    return {
      ...answer,
      questionCode: code,
      questionId: answer.questionId ?? code,
    };
  });
}

export function expectedAdaptiveQuestionCodes(engine, baseAnswers) {
  const answers = normalizeEngineAnswers(baseAnswers);
  if (engine.questionnaireVersion === QUESTIONNAIRE_V43) {
    return selectAdaptiveQuestionsV43({
      questions: engine.questionInputs,
      answers,
    }).scoring.map((question) => question.code);
  }
  if (engine.questionnaireVersion === QUESTIONNAIRE_V42) {
    return selectAdaptiveQuestionsV42({
      questions: engine.questionInputs,
      answers,
    }).scoring.map((question) => question.code);
  }
  return selectAdaptiveQuestionsV41({
    questions: engine.questionInputs,
    answers,
  }).map((question) => question.code);
}

export function expectedNarrativeQuestionCodes(engine, answers) {
  if (engine.questionnaireVersion === QUESTIONNAIRE_V43) {
    return selectAdaptiveQuestionsV43({
      questions: engine.questionInputs,
      answers: normalizeEngineAnswers(answers),
    }).narrative.map((question) => question.code);
  }
  if (engine.questionnaireVersion !== QUESTIONNAIRE_V42) return [];

  // Narrative clarifications are selected before the client answers them.
  // Re-validating a submitted questionnaire with those answers included can
  // erase the very trigger that caused a clarification to be presented (for
  // example NUT_SUCCESS_01 is asked when nutrition success is missing). Strip
  // narrative answers before replaying the deterministic selection so the
  // server validates the same decision point the browser used.
  const narrativeCodes = new Set(engine.narrativeQuestionCodes ?? []);
  const selectionAnswers = normalizeEngineAnswers(answers)
    .filter((answer) => !narrativeCodes.has(answer.questionCode));

  return selectAdaptiveQuestionsV42({
    questions: engine.questionInputs,
    answers: selectionAnswers,
  }).narrative.map((question) => question.code);
}

export function assertAdaptiveSelectionMatches(engine, presented, answers) {
  const baseAnswers = answers.filter((answer) =>
    engine.baseQuestionCodes.includes(answer.questionCode),
  );
  const expected = expectedAdaptiveQuestionCodes(engine, baseAnswers);
  const actual = [...presented.adaptiveQuestionCodes];
  const expectedSorted = [...expected].sort();
  const actualSorted = [...actual].sort();
  if (expectedSorted.join('\0') !== actualSorted.join('\0')) {
    throw new AdaptiveSelectionMismatchError(
      `Presented adaptive codes do not match the deterministic selection. expected=${expected.join(',')} presented=${actual.join(',')}`,
      { expected, presented: actual },
    );
  }
  const expectedNarrative = expectedNarrativeQuestionCodes(engine, answers);
  const actualNarrative = [...(presented.narrativeQuestionCodes ?? [])];
  const expectedNarrativeSorted = [...expectedNarrative].sort();
  const actualNarrativeSorted = [...actualNarrative].sort();
  if (expectedNarrativeSorted.join('\0') !== actualNarrativeSorted.join('\0')) {
    throw new AdaptiveSelectionMismatchError(
      `Presented narrative codes do not match the deterministic selection. expected=${expectedNarrative.join(',')} presented=${actualNarrative.join(',')}`,
      { expected: expectedNarrative, presented: actualNarrative },
    );
  }
}

/**
 * @param {{
 *   questionnaireVersion: string,
 *   rulesetVersion: string,
 *   reportModelVersion: string,
 *   answers: object[],
 *   presentedQuestionCodes: string[],
 *   assessmentId?: string,
 *   clientId?: string,
 *   clientName?: string,
 *   clientCoachId?: string,
 *   status?: string,
 *   completedAt?: Date | null,
 *   coachValidations?: object[],
 *   openAnswerOverrides?: Map<string, string>,
 * }} input
 */
export function analyzeMotivationAssessment(input) {
  if (input?.questions != null || input?.questionDefinitions != null) {
    throw new ExternalQuestionDefinitionsError();
  }

  const engine = resolveMotivationEngine({
    questionnaireVersion: input.questionnaireVersion,
    rulesetVersion: input.rulesetVersion,
    reportModelVersion: input.reportModelVersion,
  });

  const presented = resolvePresentedMotivationQuestions({
    engine,
    presentedQuestionCodes: input.presentedQuestionCodes,
  });
  const answers = normalizeMotivationAnswers(input.answers, presented.questions);
  assertAdaptiveSelectionMatches(engine, presented, answers);

  const scoring = calculateDimensionScores(presented.questions, answers);
  const nutrition = calculateNutritionScores(presented.questions, answers);
  const evaluation = evaluateRuleset({
    rules: engine.rules,
    contradictions: engine.contradictions,
    scores: getScoreMap(scoring),
    rulesetVersion: engine.rulesetVersion,
  });
  const optionLabels = buildEngineOptionLabels(presented.questions);

  const assemble = engine.reportModelVersion === REPORT_MODEL_V44
    ? assembleCoachReportSnapshotV44
    : engine.reportModelVersion === REPORT_MODEL_V43
      ? assembleCoachReportSnapshotV43
      : assembleCoachReportSnapshotV42;
  const report = assemble({
    assessmentId: input.assessmentId ?? 'assessment',
    clientId: input.clientId ?? 'client',
    clientName: input.clientName ?? 'Client',
    clientCoachId: input.clientCoachId ?? 'coach',
    status: input.status ?? 'completed',
    completedAt: input.completedAt ?? null,
    questionnaireVersion: engine.questionnaireVersion,
    rulesetVersion: engine.rulesetVersion,
    reportModelVersion: engine.reportModelVersion,
    questions: presented.questions,
    answers,
    scoring,
    insights: evaluation.insights,
    contradictions: evaluation.contradictions,
    optionLabels,
    openAnswerOverrides: input.openAnswerOverrides,
    coachValidations: input.coachValidations,
  });

  return {
    scoring,
    nutrition,
    evaluation,
    report,
    presentedQuestionCodes: presented.presentedQuestionCodes,
    adaptiveQuestionCodes: presented.adaptiveQuestionCodes,
    narrativeQuestionCodes: presented.narrativeQuestionCodes ?? [],
    provenance: {
      questionnaireVersion: engine.questionnaireVersion,
      rulesetVersion: engine.rulesetVersion,
      reportModelVersion: engine.reportModelVersion,
      contentHash: engine.contentHash,
      definitionSnapshot: engine.definitionSnapshot,
    },
  };
}
