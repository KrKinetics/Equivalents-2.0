function isMeaningful(value) {
  return Boolean(value && value.trim() && value.trim() !== 'Non répondu');
}

function answerValue(answers, code) {
  const hit = (answers ?? []).find((a) => a.questionCode === code);
  if (!hit || !isMeaningful(hit.displayValue)) return undefined;
  return hit.displayValue.trim();
}

function nutritionDirectAnswers(report) {
  return (report.directClientAnswers ?? [])
    .filter(
      (a) =>
        a.domain === 'nutrition' || String(a.questionCode ?? '').startsWith('NUT_'),
    )
    .map((a) => ({
      questionCode: a.questionCode,
      questionText: a.questionText,
      displayValue: a.displayValue,
      section: a.section,
      domain: 'nutrition',
    }));
}

/** Pure nutrition slice from a stored CoachReport. No database. */
export function toNutritionViewModel(report) {
  const directAnswers = nutritionDirectAnswers(report);
  const nut = report.nutrition;
  if (!nut && directAnswers.length === 0) return null;

  const goals =
    (nut?.goals?.filter((g) => isMeaningful(g)) ?? []).length > 0
      ? (nut?.goals ?? []).filter((g) => isMeaningful(g))
      : [answerValue(report.directClientAnswers, 'NUT_GOAL_01')].filter(Boolean);

  const successDefinition =
    (nut?.successDefinition && isMeaningful(nut.successDefinition)
      ? nut.successDefinition
      : undefined) ?? answerValue(report.directClientAnswers, 'NUT_SUCCESS_01');

  const obstaclesFromSection = (nut?.obstacles ?? []).filter((o) => isMeaningful(o));
  const obstacles =
    obstaclesFromSection.length > 0
      ? obstaclesFromSection
      : (answerValue(report.directClientAnswers, 'NUT_OBS_01') ?? '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);

  const preferredStructure =
    (nut?.preferredStructure && isMeaningful(nut.preferredStructure)
      ? nut.preferredStructure
      : undefined) ?? answerValue(report.directClientAnswers, 'NUT_PREF_01');

  const contextualConstraints =
    (nut?.contextualConstraints && isMeaningful(nut.contextualConstraints)
      ? nut.contextualConstraints
      : undefined) ?? answerValue(report.directClientAnswers, 'NUT_CONTEXT_01');

  return {
    available: true,
    summary: nut?.summary ?? '',
    scores: nut?.scores ?? [],
    narrativeTitle: nut?.narrative?.title || 'Profil alimentaire et approche recommandée',
    narrativeParagraphs: nut?.narrative?.paragraphs ?? [],
    coachingTips: nut?.coachingTips ?? [],
    interviewPoints: nut?.interviewPoints ?? [],
    goals,
    successDefinition,
    obstacles,
    preferredStructure,
    contextualConstraints,
    directAnswers,
  };
}
