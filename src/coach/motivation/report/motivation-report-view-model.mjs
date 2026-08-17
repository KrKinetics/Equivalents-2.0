/**
 * Display-only mapping of an official report-model-v4.2 snapshot.
 * Never scores. Never runs the rules engine. Never invents interpretation.
 */

import { dedupeDisplayItems, normalizeDisplayKey } from './dedupe-display-items.mjs';
import { presentDomain } from './v43/dimension-presentation.mjs';
import { buildAthleteOperatingBrief } from './v43/operating-brief.mjs';
import { buildFirstClassConflictsV43 } from './v43/conflicts.mjs';
import { buildSupportBlock } from './v43/strengths.mjs';
import { DIMENSION_GROUP_DEFS } from '../lib/pdf/pdf-v42-display.mjs';

function text(value) {
  if (value == null) return '';
  return String(value).trim();
}

function list(value) {
  if (!Array.isArray(value)) return [];
  return dedupeDisplayItems(value
    .map((item) => {
      if (item == null) return '';
      if (typeof item === 'string') return item.trim();
      return text(item.title || item.label || item.text || item.message || item.value);
    })
    .filter(Boolean));
}

function paragraphs(value) {
  if (!value) return [];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) {
    return dedupeDisplayItems(value.flatMap((item) => {
      if (typeof item === 'string') return item.trim() ? [item.trim()] : [];
      if (item && Array.isArray(item.paragraphs)) return item.paragraphs.map(text).filter(Boolean);
      const line = text(item?.text || item?.message || item?.label);
      return line ? [line] : [];
    }));
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

function sourceScoreRows(report) {
  const sport = Array.isArray(report?.sport?.scores) ? report.sport.scores : [];
  const nutrition = Array.isArray(report?.nutrition?.scores) ? report.nutrition.scores : [];
  const domains = Array.isArray(report?.domainInterpretations) ? report.domainInterpretations : [];
  return sport.length || nutrition.length
    ? [...sport, ...nutrition]
    : domains;
}

function scoreRows(report) {
  return sourceScoreRows(report).map((row) => {
    const label = text(row.label || row.dimension);
    if (!label) return null;
    const parts = [];
    if (row.score != null && row.score !== '') parts.push(String(row.score));
    else if (row.technicalScore != null && row.technicalScore !== '') parts.push(String(row.technicalScore));
    if (row.level) parts.push(String(row.level));
    if (row.agreement?.classification) parts.push(String(row.agreement.classification));
    else if (row.agreementLabel) parts.push(String(row.agreementLabel));
    return { label, value: parts.join(' · ') || '—' };
  }).filter(Boolean);
}

function existingScore(row) {
  if (row?.score != null && row.score !== '') return row.score;
  if (row?.technicalScore != null && row.technicalScore !== '') return row.technicalScore;
  return null;
}

function domainLookup(report) {
  const rows = [
    ...(Array.isArray(report?.domainInterpretations) ? report.domainInterpretations : []),
    ...(Array.isArray(report?.presentedDomains) ? report.presentedDomains : []),
    ...(Array.isArray(report?.canonicalFindings) ? report.canonicalFindings : []),
  ];
  return new Map(rows.map((row) => [text(row.domainId || row.dimension || row.key || row.domain), row]));
}

function dimensionItems(report) {
  const lookup = domainLookup(report);
  return sourceScoreRows(report).map((row) => {
    const id = text(row.domainId || row.dimension);
    const label = text(row.label || row.dimension);
    if (!label) return null;
    const domain = lookup.get(id) || row;
    const presented = domain.displayLabel
      ? domain
      : presentDomain({
        ...domain,
        domainId: id,
        label,
        itemCount: domain.itemCount ?? row.itemCount ?? row.agreement?.itemCount ?? 1,
        agreement: domain.agreement?.agreementLevel || domain.agreement || 'insufficient',
        evidenceStrength: domain.evidenceStrength || 'limited',
        level: domain.level || 'uncertain',
        technicalScore: existingScore(domain) ?? existingScore(row),
        classificationLabel: domain.classificationLabel || row.agreementLabel,
        affectedDecisionIds: domain.affectedDecisionIds || ['coaching'],
      });
    return {
      id,
      label,
      score: presented.displayScore,
      technicalScore: presented.technicalScore ?? presented.rawScore,
      evidenceBadge: presented.evidenceBadge || presented.confidenceStatus,
      displayLabel: presented.displayLabel,
      tendency: presented.tendency || presented.level,
      confidence: presented.confidence,
      confidenceStatus: presented.confidenceStatus || presented.evidenceBadge,
      claimStrength: presented.claimStrength,
      interpretation: presented.interpretation || presented.coachMeaning,
      signalDirection: presented.signalDirection || presented.direction,
      coachMeaning: presented.coachMeaning || presented.interpretation,
      itemCount: presented.itemCount ?? presented.evidenceCount,
      changesCoaching: presented.changesCoaching,
    };
  }).filter(Boolean);
}

function portraitSections(report) {
  if (Array.isArray(report?.portraitCoach?.sections) && report.portraitCoach.sections.length) {
    return report.portraitCoach.sections.map((section) => ({
      key: text(section.key),
      title: text(section.title),
      paragraphs: paragraphs(section.paragraphs || section),
    })).filter((section) => section.title && section.paragraphs.length);
  }
  return paragraphs(report?.sport?.narrativeSections).length
    ? (report.sport.narrativeSections || []).map((section) => ({
      key: text(section.key),
      title: text(section.title),
      paragraphs: paragraphs(section.paragraphs),
    })).filter((section) => section.title && section.paragraphs.length)
    : [];
}

function interviewObjects(report) {
  const rows = Array.isArray(report?.priorityInterviewQuestions)
    ? report.priorityInterviewQuestions
    : [];
  return rows.slice(0, 5).map((item, index) => {
    if (typeof item === 'string') {
      return { text: item, whyItMatters: '', affectedDecision: '', priority: index + 1 };
    }
    return {
      text: text(item.text || item.label),
      whyItMatters: text(item.whyItMatters),
      affectedDecision: text(item.affectedDecision),
      sourceEvidence: item.sourceEvidence || [],
      priority: item.priority || index + 1,
    };
  }).filter((item) => item.text);
}

function conflictCards(report) {
  if (Array.isArray(report?.conflicts) && report.conflicts.some((item) => item.sourceA || item.title)) {
    return report.conflicts.map((item) => ({
      title: text(item.title) || 'CONTRADICTION À CLARIFIER',
      sourceA: text(item.sourceA),
      sourceB: text(item.sourceB),
      coachImplication: text(item.coachImplication || item.message),
      validationQuestion: text(item.validationQuestion),
    })).filter((item) => item.sourceA || item.coachImplication);
  }
  return buildFirstClassConflictsV43({
    domains: report.domainInterpretations || [],
    obstacles: report.normalizedObstacles || [],
    openAnswers: report.openAnswers || [],
    existing: report.conflicts || [],
  });
}

function openAnswerRows(report) {
  const answers = report?.openAnswers || report?.normalizedOpenAnswers || [];
  if (!Array.isArray(answers)) return [];
  return answers.map((answer) => {
    const label = text(answer.label || answer.questionCode || answer.code || answer.id);
    const value = text(
      answer.originalAnswer
      || answer.text
      || answer.value
      || answer.normalizedText
      || answer.answer,
    );
    if (!label && !value) return null;
    return { label: label || 'Réponse ouverte', value };
  }).filter((row) => row && row.value);
}

function questionSource(report, code) {
  const direct = Array.isArray(report?.directAnswers) ? report.directAnswers : [];
  const match = direct.find((row) => text(row.questionCode) === text(code));
  return text(match?.questionText) || text(code);
}

function verbatimItems(report) {
  const answers = Array.isArray(report?.openAnswers) ? report.openAnswers : [];
  return answers.map((answer) => {
    const verbatim = text(answer.originalAnswer);
    if (!verbatim || verbatim === 'Non répondu') return null;
    return {
      questionCode: text(answer.questionCode || answer.code),
      questionText: questionSource(report, answer.questionCode || answer.code),
      verbatim,
    };
  }).filter(Boolean);
}

function weekActions(week) {
  if (Array.isArray(week?.coachActions) && week.coachActions.length) return list(week.coachActions);
  if (Array.isArray(week?.actions) && week.actions.length) return list(week.actions);
  return [];
}

function fourWeekCards(report) {
  const weeks = Array.isArray(report?.fourWeekPlan?.weeks)
    ? report.fourWeekPlan.weeks
    : Array.isArray(report?.fourWeekPlanDetailed)
      ? report.fourWeekPlanDetailed
      : Array.isArray(report?.fourWeekFollowUp)
        ? report.fourWeekFollowUp
        : [];
  return weeks.map((week, index) => {
    const number = week.week != null ? Number(week.week) : index + 1;
    const title = text(week.title || week.label || (Number.isFinite(number) ? `Semaine ${number}` : ''));
    const focus = text(week.focus || week.objective);
    const actions = weekActions(week);
    if (!title && !focus && !actions.length) return null;
    return {
      week: number,
      title,
      focus,
      objective: text(week.objective || focus),
      coachAction: text(week.coachAction) || actions[0] || '',
      observe: text(week.observe),
      validationCriterion: text(week.validationCriterion),
      actions,
    };
  }).filter(Boolean);
}

function obstacleSourceCode(item) {
  if (!item || typeof item === 'string') return '';
  if (Array.isArray(item.directSourceCodes) && item.directSourceCodes.length) {
    return text(item.directSourceCodes.find((code) => /^NUT_OBS_/i.test(String(code))) || item.directSourceCodes[0]);
  }
  return text(
    item.questionCode
    || item.sourceQuestionCode
    || item.sourceCode
    || item.code
    || item.source,
  );
}

function isNutritionObstacleSource(code) {
  return /^NUT_OBS_/i.test(text(code));
}

function splitObstacleLabels(value) {
  return text(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Nutrition obstacles only when the snapshot names a NUT_OBS_* source.
 * Generic OBS_* items stay out of this subsection — omit if provenance is ambiguous.
 */
function nutritionObstacleItems(report) {
  const coded = [
    ...(Array.isArray(report?.declaredObstacles) ? report.declaredObstacles : []),
    ...(Array.isArray(report?.normalizedObstacles) ? report.normalizedObstacles : []),
    ...(Array.isArray(report?.nutrition?.obstacles) ? report.nutrition.obstacles : []),
  ].filter((item) => isNutritionObstacleSource(obstacleSourceCode(item)));

  const fromAnswers = [
    ...(Array.isArray(report?.directAnswers) ? report.directAnswers : []),
    ...(Array.isArray(report?.openAnswers) ? report.openAnswers : []),
    ...(Array.isArray(report?.normalizedOpenAnswers) ? report.normalizedOpenAnswers : []),
  ].filter((row) => isNutritionObstacleSource(row?.questionCode || row?.code));

  const labels = [
    ...coded,
    ...fromAnswers.flatMap((row) => splitObstacleLabels(
      row.displayValue
      || row.originalAnswer
      || row.text
      || row.value
      || row.normalizedText,
    )),
  ];
  return list(labels);
}

function validationQuestionKeys(report) {
  const rows = [
    ...(Array.isArray(report?.conflicts) ? report.conflicts : []),
    ...(Array.isArray(report?.findings) ? report.findings : []),
  ];
  return new Set(
    rows.map((item) => normalizeDisplayKey(item?.validationQuestion)).filter(Boolean),
  );
}

function statementFromSnapshotItem(item) {
  if (item == null) return '';
  if (typeof item === 'string') return item.trim();
  return text(item.title || item.label || item.text || item.message || item.value);
}

function nutritionBlock(report, plan) {
  const lectureRaw = paragraphs(report.nutrition?.narrativeSections);
  const structure = text(plan.nutritionApproach);
  const lecture = structure
    ? lectureRaw.filter((line) => !normalizeDisplayKey(line).includes(normalizeDisplayKey(structure)))
    : lectureRaw;
  const obstacles = nutritionObstacleItems(report);
  const actions = list(report.nutrition?.priorityActions || plan.nutritionActions);
  if (!lecture.length && !structure && !obstacles.length && !actions.length) return null;
  return { lecture, structure, obstacles, actions };
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

  const summaryLines = [
    text(plan.profileSummary),
    text(plan.portraitOperational) !== text(plan.profileSummary) ? text(plan.portraitOperational) : '',
  ].filter(Boolean);
  addSection(sections, 'summary', 'Synthèse', { lines: summaryLines });

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

  const supportBlock = report.supportBlock || buildSupportBlock({
    confirmedStrengths: report.confirmedStrengths,
    probableStrengths: report.probableStrengths,
    probableLevers: report.probableLevers,
    declaredLevers: report.declaredLevers,
  });
  const strengthItems = list([
    supportBlock.summary,
    ...list(supportBlock.items?.map((item) => item.title || item)),
    ...list(plan.mainStrengths),
    ...list(report.probableStrengths),
    ...list(report.confirmedStrengths),
    ...list(plan.probableLevers),
    ...list(report.declaredLevers),
  ]).filter((item) => !/Aucune force suffisamment appuyée/i.test(item));
  addSection(sections, 'strengths', supportBlock.title || 'Appuis', { items: strengthItems });

  const excludedValidation = validationQuestionKeys(report);
  const vigilanceItems = list([
    ...list(plan.mainRisks),
    ...list(report.initialApproachWarnings),
    ...list((report.findings || []).map(statementFromSnapshotItem)),
    ...list((report.conflicts || []).map(statementFromSnapshotItem)),
  ]).filter((item) => !excludedValidation.has(normalizeDisplayKey(item)));
  addSection(sections, 'vigilance', 'Points de vigilance', { items: vigilanceItems });

  addSection(sections, 'conflicts', 'Contradictions', {
    lines: list((report.conflicts || []).map(statementFromSnapshotItem))
      .filter((item) => !excludedValidation.has(normalizeDisplayKey(item))),
  });

  addSection(sections, 'obstacles', 'Obstacles', {
    items: list([
      ...list(report.declaredObstacles),
      ...list(report.normalizedObstacles),
    ]),
  });

  addSection(sections, 'coaching', 'Style d’encadrement', {
    lines: [
      text(plan.choiceApproachLabel || readiness.choiceApproachLabel || plan.choiceApproach?.label),
      text(plan.communicationStyle || plan.communicationApproach?.label),
    ].filter(Boolean),
  });

  const priorityItems = list(plan.priorities || plan.initialPriorities);
  const decisionItems = list([
    ...priorityItems,
    ...list(plan.clarifications),
    ...list(plan.mainDecisions),
  ]);
  addSection(sections, 'recommendations', 'Recommandations Coach', {
    items: decisionItems,
  });

  const nutrition = nutritionBlock(report, plan);
  addSection(sections, 'nutrition', 'Nutrition', {
    lines: [
      ...(nutrition?.lecture || []),
      nutrition?.structure || '',
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

  const weekCards = fourWeekCards(report);
  addSection(sections, 'plan', 'Plan et priorités', {
    items: list([
      ...list(plan.firstFourWeeksActions),
      ...list(report.fourWeekPlan),
    ]),
  });

  const interviewDetailed = interviewObjects(report);
  const interviewItems = interviewDetailed.length
    ? interviewDetailed.map((item) => item.text)
    : list(plan.priorityInterviewQuestions || report.priorityInterviewQuestions);
  addSection(sections, 'interview', 'Questions d’entrevue', {
    items: interviewItems,
  });

  addSection(sections, 'open', 'Réponses ouvertes', {
    rows: openAnswerRows(report),
  });

  const followUp = report.fourWeekFollowUp || report.fourWeekPlanDetailed;
  addSection(sections, 'week4', 'Suivi 4 semaines', {
    lines: Array.isArray(followUp)
      ? followUp.flatMap((week) => {
        const title = text(week.title || week.label || (week.week != null ? `Semaine ${week.week}` : ''));
        const actions = weekActions(week);
        if (!title && !actions.length) return [];
        return [title, ...actions];
      })
      : paragraphs(followUp),
  });

  const preparation = text(
    plan.preparationLabel
    || readiness.preparationLabeled?.value
    || readiness.overallLabel,
  );
  const structure = text(
    plan.structureLabel
    || readiness.structureLabeled?.value
    || readiness.structureLabel,
  );
  const followUpLabel = text(plan.followUpLabel || readiness.followUpLabel);
  const coachingStyle = text(
    plan.choiceApproachLabel
    || plan.choiceApproachLabeled?.value
    || readiness.choiceApproachLabel
    || plan.choiceApproach?.label,
  );

  const quickRead = [
    preparation ? { id: 'preparation', label: 'Niveau de préparation', value: preparation } : null,
    structure ? { id: 'structure', label: 'Structure recommandée', value: structure } : null,
    followUpLabel ? { id: 'follow-up', label: 'Fréquence de suivi', value: followUpLabel } : null,
    coachingStyle ? { id: 'coaching', label: 'Style d’encadrement', value: coachingStyle } : null,
  ].filter(Boolean).slice(0, 4);

  const technical = {
    questionnaireVersion: text(provenance.questionnaireVersion || report.questionnaireVersion),
    rulesetVersion: text(provenance.rulesetVersion || report.rulesetVersion),
    reportModelVersion: text(
      provenance.reportModelVersion || report.schemaVersion || report.metadata?.reportModelVersion,
    ),
    analysisVersion: input.analysisVersion ?? null,
    contentHash: text(provenance.contentHash),
    submittedAt: input.submittedAt || null,
    analyzedAt: input.analyzedAt || null,
  };

  const usability = report.usability || report.reportUsability || {};
  const reportConfidence = report.reportConfidence || {
    id: usability.level || usability.overall || 'usable_with_validation',
    label: usability.level === 'strong' || usability.overall === 'strong'
      ? 'SOLIDE'
      : usability.level === 'limited' || usability.overall === 'limited'
        ? 'LIMITÉ'
        : 'UTILISABLE AVEC VALIDATION',
    coachLabel: usability.level === 'strong' || usability.overall === 'strong'
      ? 'Lecture Coach : solide'
      : usability.level === 'limited' || usability.overall === 'limited'
        ? 'Lecture Coach : limitée'
        : 'Lecture Coach : utilisable avec validation',
  };

  const athleteOperatingBrief = report.athleteOperatingBrief || buildAthleteOperatingBrief({
    openAnswers: report.openAnswers,
    directAnswers: report.directAnswers,
    domains: report.domainInterpretations,
    readiness,
    choiceApproach: plan.choiceApproach,
    communicationApproach: plan.communicationApproach,
    declaredObstacles: report.declaredObstacles,
    conflicts: report.conflicts,
    supportBlock,
    usability,
  });

  const portrait = portraitSections(report);
  const conflicts = conflictCards(report);
  const buckets = report.riskBuckets || {
    risksToPrevent: vigilanceItems.filter((item) => /risque|vigilance|tout-ou-rien|reprise/i.test(item)).slice(0, 4),
    hypothesesToTest: list(plan.clarifications).slice(0, 5),
    contradictionsToResolve: conflicts.map((item) => item.title || item.coachImplication),
  };
  const allDimensions = dimensionItems(report);
  const decisionFactors = allDimensions.filter((row) => row.changesCoaching).slice(0, 8);
  const dimensionGroups = DIMENSION_GROUP_DEFS.map((def) => ({
    id: def.id,
    title: def.title,
    items: allDimensions.filter((row) => def.ids.includes(row.id)),
  })).filter((group) => group.items.length);

  const justifiedQuickRead = quickRead.map((item) => ({
    ...item,
    justification: item.id === 'preparation'
      ? text(readiness.explanation || plan.followUpRationale)
      : item.id === 'structure'
        ? text(plan.structureLabel)
        : item.id === 'follow-up'
          ? text(plan.followUpRationale)
          : text(plan.communicationApproach?.guidance || plan.choiceApproach?.summary),
  }));

  return {
    title: 'Profil motivationnel',
    identity: input.identity || null,
    clientName: text(input.identity?.fullName || input.clientName || report.metadata?.clientName),
    clientId: text(input.identity?.clientId || input.clientId || report.metadata?.clientId),
    submittedAt: input.submittedAt || report.metadata?.completedAt || null,
    analyzedAt: input.analyzedAt || null,
    analysisVersion: input.analysisVersion ?? null,
    sections,
    hero: {
      title: 'Profil motivationnel',
      clientName: text(input.identity?.fullName || input.clientName || report.metadata?.clientName),
      identity: input.identity || null,
      submittedAt: input.submittedAt || report.metadata?.completedAt || null,
      analyzedAt: input.analyzedAt || null,
      analysisVersion: input.analysisVersion ?? null,
      reportConfidence,
    },
    coachDecisionBrief: report.coachDecisionBrief || null,
    coachPriorities: (report.coachPriorities || []).length
      ? report.coachPriorities
      : decisionItems.filter((item) => !/[?？]$/.test(item)).slice(0, 5),
    nutritionAction: report.nutritionAction || null,
    canonicalFindings: report.canonicalFindings || allDimensions,
    reportConfidence,
    quickRead: justifiedQuickRead,
    summary: summaryLines.slice(0, 4),
    supports: strengthItems,
    supportBlock,
    athleteOperatingBrief,
    portraitCoach: portrait,
    vigilance: vigilanceItems,
    riskBuckets: buckets,
    conflicts,
    interviewQuestions: interviewItems,
    interviewDetailed,
    dimensions: allDimensions,
    decisionFactors,
    dimensionGroups,
    nutrition,
    fourWeekPlan: weekCards,
    verbatims: verbatimItems(report),
    technical,
    provenance: technical,
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
    case 'client_identity_missing':
      return 'Identité client manquante';
    case 'client_identity_mismatch':
      return 'Identité client incohérente';
    default:
      return 'Analyse temporairement indisponible';
  }
}
