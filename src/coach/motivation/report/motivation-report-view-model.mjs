/**
 * Display-only mapping of an official report-model-v4.2 snapshot.
 * Never scores, never runs the rules engine, never invents interpretation.
 */

function text(value) {
  if (value == null) return '';
  return String(value).trim();
}

function list(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (item == null) return '';
      if (typeof item === 'string') return item.trim();
      return text(item.title || item.label || item.text || item.message || item.value);
    })
    .filter(Boolean);
}

function paragraphs(value) {
  if (!value) return [];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === 'string') return item.trim() ? [item.trim()] : [];
      if (item && Array.isArray(item.paragraphs)) return item.paragraphs.map(text).filter(Boolean);
      const line = text(item?.text || item?.message || item?.label);
      return line ? [line] : [];
    });
  }
  return [];
}

function addSection(sections, id, title, body) {
  if (!body) return;
  const items = Array.isArray(body.items) ? body.items.filter(Boolean) : [];
  const lines = Array.isArray(body.lines) ? body.lines.filter(Boolean) : [];
  const rows = Array.isArray(body.rows) ? body.rows.filter((row) => row && (row.label || row.value)) : [];
  if (!items.length && !lines.length && !rows.length) return;
  sections.push({ id, title, ...body, items, lines, rows });
}

function scoreRows(report) {
  const sport = Array.isArray(report?.sport?.scores) ? report.sport.scores : [];
  const nutrition = Array.isArray(report?.nutrition?.scores) ? report.nutrition.scores : [];
  const domains = Array.isArray(report?.domainInterpretations) ? report.domainInterpretations : [];
  const source = sport.length || nutrition.length
    ? [...sport, ...nutrition]
    : domains;
  return source.map((row) => {
    const label = text(row.label || row.dimension);
    if (!label) return null;
    const parts = [];
    if (row.score != null && row.score !== '') parts.push(String(row.score));
    if (row.level) parts.push(String(row.level));
    if (row.agreement?.classification) parts.push(String(row.agreement.classification));
    return { label, value: parts.join(' · ') || '—' };
  }).filter(Boolean);
}

function openAnswerRows(report) {
  const answers = report?.openAnswers || report?.normalizedOpenAnswers || [];
  if (!Array.isArray(answers)) return [];
  return answers.map((answer) => {
    const label = text(answer.label || answer.questionCode || answer.code || answer.id);
    const value = text(answer.text || answer.value || answer.normalizedText || answer.answer);
    if (!label && !value) return null;
    return { label: label || 'Réponse ouverte', value };
  }).filter((row) => row && row.value);
}

/**
 * @param {{
 *   report: object,
 *   clientName?: string,
 *   submittedAt?: string|null,
 *   analyzedAt?: string|null,
 *   analysisVersion?: number|null,
 *   provenance?: object|null,
 * }} input
 */
export function buildMotivationReportViewModel(input = {}) {
  const report = input.report && typeof input.report === 'object' ? input.report : {};
  const plan = report.initialPlan && typeof report.initialPlan === 'object' ? report.initialPlan : {};
  const readiness = report.readiness || report.behavioralReadiness || {};
  const provenance = input.provenance || report.metadata || {};
  const sections = [];

  addSection(sections, 'summary', 'Synthèse', {
    lines: [
      text(plan.profileSummary),
      text(plan.portraitOperational) !== text(plan.profileSummary) ? text(plan.portraitOperational) : '',
    ].filter(Boolean),
  });

  addSection(sections, 'readiness', 'Niveau de préparation', {
    lines: [
      text(plan.preparationLabel || readiness.overallLabel || readiness.preparationLabeled?.value),
      text(readiness.explanation),
      text(plan.followUpLabel || readiness.followUpLabel),
      text(plan.followUpRationale || readiness.followUpRationale),
    ].filter(Boolean),
  });

  addSection(sections, 'scores', 'Dimensions', {
    rows: scoreRows(report),
  });

  addSection(sections, 'strengths', 'Forces', {
    items: [
      ...list(plan.mainStrengths),
      ...list(report.probableStrengths),
      ...list(report.confirmedStrengths),
      ...list(plan.probableLevers),
      ...list(report.declaredLevers),
    ],
  });

  addSection(sections, 'vigilance', 'Points de vigilance', {
    items: [
      ...list(plan.mainRisks),
      ...list(report.initialApproachWarnings),
      ...list(report.findings),
    ],
  });

  addSection(sections, 'conflicts', 'Contradictions', {
    lines: list(report.conflicts).concat(
      Array.isArray(report.conflicts)
        ? report.conflicts.map((item) => text(item.validationQuestion)).filter(Boolean)
        : [],
    ),
  });

  addSection(sections, 'obstacles', 'Obstacles', {
    items: [
      ...list(report.declaredObstacles),
      ...list(report.normalizedObstacles),
    ],
  });

  addSection(sections, 'coaching', 'Style d’encadrement', {
    lines: [
      text(plan.choiceApproachLabel || readiness.choiceApproachLabel || plan.choiceApproach?.label),
      text(plan.communicationStyle || plan.communicationApproach?.label),
    ].filter(Boolean),
  });

  addSection(sections, 'recommendations', 'Recommandations Coach', {
    items: [
      ...list(plan.priorities || plan.initialPriorities),
      ...list(plan.clarifications),
      ...list(plan.mainDecisions),
    ],
  });

  addSection(sections, 'nutrition', 'Nutrition', {
    lines: [
      ...paragraphs(report.nutrition?.narrativeSections),
      text(plan.nutritionApproach),
    ].filter(Boolean),
  });

  addSection(sections, 'communication', 'Stratégie de communication', {
    lines: [
      text(plan.communicationApproach?.guidance || plan.communicationApproach?.detail),
      ...list(plan.communicationApproach?.points),
    ].filter(Boolean),
  });

  addSection(sections, 'structure', 'Structure recommandée', {
    lines: [
      text(plan.structureLabel || readiness.structureLabel || readiness.structureLabeled?.value),
    ].filter(Boolean),
  });

  addSection(sections, 'plan', 'Plan et priorités', {
    items: [
      ...list(plan.firstFourWeeksActions),
      ...list(report.fourWeekPlan),
    ],
  });

  addSection(sections, 'interview', 'Questions d’entrevue', {
    items: list(plan.priorityInterviewQuestions || report.priorityInterviewQuestions),
  });

  addSection(sections, 'open', 'Réponses ouvertes', {
    rows: openAnswerRows(report),
  });

  const followUp = report.fourWeekFollowUp || report.fourWeekPlanDetailed;
  addSection(sections, 'week4', 'Suivi 4 semaines', {
    lines: Array.isArray(followUp)
      ? followUp.flatMap((week) => {
        const title = text(week.title || week.label || (week.week != null ? `Semaine ${week.week}` : ''));
        const actions = list(week.actions);
        if (!title && !actions.length) return [];
        return [title, ...actions];
      })
      : paragraphs(followUp),
  });

  return {
    title: 'Profil motivationnel',
    clientName: text(input.clientName || report.metadata?.clientName) || 'Client',
    submittedAt: input.submittedAt || report.metadata?.completedAt || null,
    sections,
    provenance: {
      questionnaireVersion: text(provenance.questionnaireVersion || report.questionnaireVersion),
      rulesetVersion: text(provenance.rulesetVersion || report.rulesetVersion),
      reportModelVersion: text(
        provenance.reportModelVersion || report.schemaVersion || report.metadata?.reportModelVersion,
      ),
      analysisVersion: input.analysisVersion ?? null,
      contentHash: text(provenance.contentHash),
      submittedAt: input.submittedAt || null,
      analyzedAt: input.analyzedAt || null,
    },
  };
}

export function publicMotivationReportMessage(error) {
  switch (error) {
    case 'forbidden':
      return 'Accès refusé';
    case 'not_found':
      return 'Client introuvable';
    case 'not_submitted':
      return 'Questionnaire non soumis';
    case 'hash_mismatch':
    case 'unknown_engine':
    case 'incompatible':
      return 'Version incompatible';
    case 'invalid_client':
      return 'Identifiant client manquant ou invalide.';
    default:
      return 'Analyse temporairement indisponible';
  }
}
