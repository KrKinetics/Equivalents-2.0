/**
 * Deterministic athlete operating brief. Assembles official fields only.
 * No LLM. No invented facts.
 */

function text(value) {
  return String(value ?? '').trim();
}

function openText(openAnswers, code) {
  const row = (openAnswers || []).find((item) => item.questionCode === code);
  return text(row?.originalAnswer);
}

function optionOrText(directAnswers, code) {
  const row = (directAnswers || []).find((item) => item.questionCode === code);
  return text(row?.displayValue || row?.answerText || row?.value);
}

function splitGoalWhyNow(goalText) {
  const raw = text(goalText);
  const match = raw.match(/^(.+?)(?:\s+(?:parce que|car|afin de|afin qu['’]?|pour)\s+)(.+)$/i);
  if (match) {
    return { primaryGoal: match[1].trim(), whyNow: match[2].trim() };
  }
  return { primaryGoal: raw, whyNow: '' };
}

function domain(domains, id) {
  return (domains || []).find((item) => item.domainId === id);
}

function driverFrom(domainRow, fallback) {
  if (!domainRow || domainRow.itemCount === 0) return fallback;
  if (domainRow.itemCount === 1) {
    return `Premier signal — ${domainRow.label}`;
  }
  return domainRow.classificationLabel || domainRow.label;
}

export function buildAthleteOperatingBrief({
  openAnswers = [],
  directAnswers = [],
  domains = [],
  readiness = {},
  choiceApproach = {},
  communicationApproach = {},
  declaredObstacles = [],
  conflicts = [],
  supportBlock = {},
  usability = {},
}) {
  const goalRaw = openText(openAnswers, 'GOAL_01');
  const split = splitGoalWhyNow(goalRaw);
  const whyClarify = openText(openAnswers, 'CLARIFY_GOAL_MEANING_01');
  const success = openText(openAnswers, 'GOAL_02');
  const successClarify = openText(openAnswers, 'CLARIFY_SUCCESS_01');
  const recovery = optionOrText(directAnswers, 'CLARIFY_RECOVERY_01')
    || openText(openAnswers, 'CLARIFY_RECOVERY_01');
  const barrierMoment = optionOrText(directAnswers, 'CLARIFY_BARRIER_01')
    || openText(openAnswers, 'CLARIFY_BARRIER_01');
  const nutGoal = openText(openAnswers, 'NUT_GOAL_01');
  const nutQuality = optionOrText(directAnswers, 'CLARIFY_NUT_QUALITY_01')
    || openText(openAnswers, 'CLARIFY_NUT_QUALITY_01');
  const nutSuccess = openText(openAnswers, 'NUT_SUCCESS_01');
  const barriers = [
    openText(openAnswers, 'OBS_01'),
    ...((declaredObstacles || []).map((item) => text(item.label || item.title || item))),
  ].filter(Boolean);

  const results = domain(domains, 'results_orientation');
  const auto = domain(domains, 'autonomous_motivation');
  const structure = domain(domains, 'structure_need');
  const itemsToValidate = [
    ...(usability.highImpactDomainsToValidate || []),
    ...(conflicts || []).map((item) => item.title || item.message).filter(Boolean),
  ].slice(0, 6);

  return {
    primaryGoal: split.primaryGoal || null,
    whyNow: split.whyNow || whyClarify || null,
    successDefinition: success || successClarify || null,
    motivationDrivers: [
      driverFrom(results),
      driverFrom(auto),
    ].filter(Boolean),
    likelyDropoffPattern: barrierMoment
      || (readiness.recoveryCapacity ? `Reprise : ${readiness.recoveryCapacity}` : null),
    recoveryStrategy: recovery || readiness.missedSessionProtocol || null,
    structurePreference: readiness.structureLabel || structure?.classificationLabel || null,
    choicePreference: choiceApproach.label || readiness.choiceApproachLabel || null,
    communicationPreference: communicationApproach.label || readiness.communicationStyle || null,
    progressSignals: [success, successClarify, nutSuccess].filter(Boolean),
    nutritionFocus: nutQuality || nutGoal || null,
    declaredBarriers: [...new Set(barriers)],
    confidence: usability.level === 'strong'
      ? 'SOLIDE'
      : usability.level === 'limited'
        ? 'LIMITÉ'
        : 'UTILISABLE AVEC VALIDATION',
    itemsToValidate,
    supportStance: supportBlock.title || null,
  };
}
