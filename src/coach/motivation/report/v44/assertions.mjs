import { assertClaimLanguage, isInterviewQuestion } from './language.mjs';

export function assertReportModelV44(snapshot) {
  const errors = [];
  if (snapshot.schemaVersion !== 'report-model-v4.4') {
    errors.push('schemaVersion must be report-model-v4.4');
  }
  if (!Array.isArray(snapshot.canonicalFindings) || !snapshot.canonicalFindings.length) {
    errors.push('canonicalFindings are required');
  }
  if (!snapshot.coachDecisionBrief) {
    errors.push('coachDecisionBrief is required');
  }
  for (const finding of snapshot.canonicalFindings || []) {
    if (finding.claimStrength === 'single' && finding.displayScore != null) {
      errors.push(`single-item ${finding.key} must not expose a precise displayScore`);
    }
  }
  const priorities = snapshot.coachPriorities || snapshot.initialPlan?.priorities || [];
  for (const item of priorities) {
    if (isInterviewQuestion(item.text || item)) {
      errors.push(`priority must be an action, not a question: ${item.text || item}`);
    }
  }
  const languageErrors = assertClaimLanguage([
    ...(snapshot.canonicalFindings || []).map((item) => ({
      key: item.key,
      text: item.interpretation,
      claimStrength: item.claimStrength,
    })),
    ...(snapshot.fourWeekPlanDetailed || []).map((week) => ({
      key: 'adherence_recovery',
      text: `${week.coachAction} ${week.validationCriterion}`,
      claimStrength: snapshot.canonicalFindings?.find((item) => item.key === 'adherence_recovery')?.claimStrength,
    })),
  ], snapshot.canonicalFindings);
  errors.push(...languageErrors);
  return errors;
}

export function isCoachReportSnapshotV44(value) {
  return Boolean(value && typeof value === 'object' && value.schemaVersion === 'report-model-v4.4');
}
