export {
  QUESTIONNAIRE_V41,
  RULESET_V41,
  REPORT_MODEL_V42,
  QUESTIONNAIRE_V42,
  RULESET_V42,
  REPORT_MODEL_V43,
  resolveMotivationEngine,
  buildMotivationProvenance,
  buildMotivationDefinitionSnapshot,
  hashMotivationDefinitions,
  UnknownMotivationEngineError,
} from './versions/motivation-versions.mjs';
export {
  analyzeMotivationAssessment,
  expectedAdaptiveQuestionCodes,
  expectedNarrativeQuestionCodes,
  ExternalQuestionDefinitionsError,
} from './engine/analyze-motivation.mjs';
export {
  selectionAnswersForNarrative,
  frozenNarrativePresentedCodes,
} from './engine/narrative-selection.mjs';
export {
  resolvePresentedMotivationQuestions,
  PresentedQuestionCodesError,
  AdaptiveSelectionMismatchError,
} from './engine/presented-questions.mjs';
export { calculateDimensionScores, getScoreMap } from './scoring/engine.mjs';
export { calculateNutritionScores, hasNutritionData } from './scoring/nutrition.mjs';
export { evaluateRuleset, evaluateCondition } from './rules/engine.mjs';
export { selectAdaptiveQuestionsV41 } from './lib/adaptive-questions-v41.mjs';
export { selectAdaptiveQuestionsV42 } from './lib/adaptive-questions-v42.mjs';
export { assembleCoachReportSnapshotV42 } from './report/v42/assemble.mjs';
export { assembleCoachReportSnapshotV43 } from './report/v43/assemble.mjs';
export { renderMotivationPdf, motivationPdfFilename } from './pdf/render-motivation-pdf.mjs';
