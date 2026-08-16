/**
 * Pure motivation analysis. No HTTP, auth, mail, DOM, or database.
 * Input = answers + explicit versions. Output = deterministic structured result.
 */

import { calculateDimensionScores, getScoreMap } from '../scoring/engine.mjs';
import { calculateNutritionScores } from '../scoring/nutrition.mjs';
import { evaluateRuleset } from '../rules/engine.mjs';
import { assembleCoachReportSnapshotV42 } from '../report/v42/assemble.mjs';
import { resolveMotivationEngine } from '../versions/motivation-versions.mjs';

/**
 * @param {{
 *   questionnaireVersion: string,
 *   rulesetVersion: string,
 *   reportModelVersion: string,
 *   questions: object[],
 *   answers: object[],
 *   optionLabels?: Map<string, string>,
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
  const engine = resolveMotivationEngine({
    questionnaireVersion: input.questionnaireVersion,
    rulesetVersion: input.rulesetVersion,
    reportModelVersion: input.reportModelVersion,
  });

  const scoring = calculateDimensionScores(input.questions, input.answers);
  const nutrition = calculateNutritionScores(input.questions, input.answers);
  const evaluation = evaluateRuleset({
    rules: engine.rules,
    contradictions: engine.contradictions,
    scores: getScoreMap(scoring),
    rulesetVersion: engine.rulesetVersion,
  });

  const report = assembleCoachReportSnapshotV42({
    assessmentId: input.assessmentId ?? 'assessment',
    clientId: input.clientId ?? 'client',
    clientName: input.clientName ?? 'Client',
    clientCoachId: input.clientCoachId ?? 'coach',
    status: input.status ?? 'completed',
    completedAt: input.completedAt ?? null,
    questionnaireVersion: engine.questionnaireVersion,
    rulesetVersion: engine.rulesetVersion,
    questions: input.questions,
    answers: input.answers,
    scoring,
    insights: evaluation.insights,
    contradictions: evaluation.contradictions,
    optionLabels: input.optionLabels,
    openAnswerOverrides: input.openAnswerOverrides,
    coachValidations: input.coachValidations,
  });

  return {
    scoring,
    nutrition,
    evaluation,
    report,
    provenance: {
      questionnaireVersion: engine.questionnaireVersion,
      rulesetVersion: engine.rulesetVersion,
      reportModelVersion: engine.reportModelVersion,
      contentHash: engine.contentHash,
    },
  };
}
