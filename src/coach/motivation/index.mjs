export {
  QUESTIONNAIRE_V41,
  RULESET_V41,
  REPORT_MODEL_V42,
  resolveMotivationEngine,
  buildMotivationProvenance,
  buildMotivationDefinitionSnapshot,
  hashMotivationDefinitions,
  UnknownMotivationEngineError,
} from './versions/motivation-versions.mjs';
export { analyzeMotivationAssessment } from './engine/analyze-motivation.mjs';
export { calculateDimensionScores, getScoreMap } from './scoring/engine.mjs';
export { calculateNutritionScores, hasNutritionData } from './scoring/nutrition.mjs';
export { evaluateRuleset, evaluateCondition } from './rules/engine.mjs';
export { selectAdaptiveQuestionsV41 } from './lib/adaptive-questions-v41.mjs';
export { assembleCoachReportSnapshotV42 } from './report/v42/assemble.mjs';
export { renderMotivationPdf, motivationPdfFilename } from './pdf/render-motivation-pdf.mjs';
