const NO_FALSE_PRECISION = /Donnée unique — à confirmer|Signal (faible|modéré|élevé)|Signal mixte|Tendance à confirmer/;

export function assertReportModelV43(snapshot) {
  const errors = [];
  if (snapshot.schemaVersion !== 'report-model-v4.3') {
    errors.push('schemaVersion must be report-model-v4.3');
  }
  if (!snapshot.athleteOperatingBrief) {
    errors.push('athleteOperatingBrief is required');
  }
  if (!snapshot.portraitCoach?.sections?.length) {
    errors.push('portraitCoach.sections is required');
  }
  if (!snapshot.reportConfidence?.label) {
    errors.push('reportConfidence.label is required');
  }
  for (const domain of snapshot.presentedDomains || []) {
    if (domain.itemCount === 1 && domain.displayScore != null) {
      errors.push(`single-item domain ${domain.domainId} must not expose a precise displayScore`);
    }
    if (domain.itemCount === 1 && !NO_FALSE_PRECISION.test(`${domain.displayLabel} ${domain.evidenceBadge}`)) {
      errors.push(`single-item domain ${domain.domainId} must be evidence-gated`);
    }
  }
  if ((snapshot.priorityInterviewQuestions || []).length > 5) {
    errors.push('interview questions exceed 5');
  }
  return errors;
}

export function isCoachReportSnapshotV43(value) {
  return Boolean(value && typeof value === 'object' && value.schemaVersion === 'report-model-v4.3');
}
