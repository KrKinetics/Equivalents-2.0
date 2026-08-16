import { buildInterviewQuestionsV42 } from '../v42/plan.mjs';

const ANSWERED_BY_CLARIFICATION = {
  CLARIFY_GOAL_MEANING_01: ['wellbeing_goal', 'general_health', 'general_fitness', 'experience_goal', 'body_composition'],
  CLARIFY_SUCCESS_01: ['outcome_indicator', 'wellbeing_success_indicator'],
  CLARIFY_RECOVERY_01: ['follow_up_frequency'],
  CLARIFY_BARRIER_01: ['food_planning'],
  CLARIFY_NUT_QUALITY_01: ['food_quality'],
  NUT_SUCCESS_01: ['food_consistency'],
};

function answeredKeys(openAnswers, directAnswers) {
  const keys = new Set();
  const rows = [...(openAnswers || []), ...(directAnswers || [])];
  for (const row of rows) {
    const code = row.questionCode;
    const value = String(row.originalAnswer || row.displayValue || row.textValue || '').trim();
    if (!code || !value) continue;
    for (const key of (ANSWERED_BY_CLARIFICATION[code] || [])) keys.add(key);
  }
  return keys;
}

function whyItMatters(question, conflicts) {
  if (question.category === 'objective') {
    return 'Précise ce que l\'athlète cherche réellement et comment juger le progrès.';
  }
  if (question.category === 'obstacle') {
    return 'Identifie le moment et le contexte où l\'adhésion casse.';
  }
  if ((conflicts || []).some((item) => item.validationQuestion === question.text)) {
    return 'Résout une contradiction qui changerait le plan.';
  }
  return 'Peut modifier une décision de coaching des 4 premières semaines.';
}

function affectedDecision(question) {
  if (question.category === 'objective') return 'success_indicators';
  if (question.category === 'obstacle') return 'recovery_protocol';
  if (question.category === 'coaching_preference') return 'choice_approach';
  if (question.category === 'follow_up') return 'follow_up_frequency';
  return 'interview_calibration';
}

export function buildInterviewQuestionsV43(input) {
  const answered = answeredKeys(input.openAnswers, input.directAnswers);
  const conflicts = input.conflicts || [];
  const fromConflicts = conflicts.map((conflict, index) => ({
    canonicalKey: conflict.id || `conflict_${index}`,
    sourceQuestionCode: conflict.id,
    category: 'conflict',
    text: conflict.validationQuestion,
    priority: 'high',
    whyItMatters: conflict.coachImplication || 'Clarifie une contradiction visible.',
    affectedDecision: 'plan_adjustment',
    sourceEvidence: [conflict.sourceA, conflict.sourceB].filter(Boolean),
  })).filter((item) => item.text);

  const base = buildInterviewQuestionsV42(input).filter((question) => !answered.has(question.canonicalKey));
  const ranked = [...fromConflicts, ...base]
    .filter((question) => question.text)
    .map((question, index) => ({
      text: question.text,
      whyItMatters: question.whyItMatters || whyItMatters(question, conflicts),
      affectedDecision: question.affectedDecision || affectedDecision(question),
      sourceEvidence: question.sourceEvidence || [question.sourceQuestionCode].filter(Boolean),
      priority: question.priority || 'moderate',
      canonicalKey: question.canonicalKey || `q_${index}`,
    }));

  const seen = new Set();
  return ranked.filter((item) => {
    if (seen.has(item.canonicalKey) || seen.has(item.text)) return false;
    seen.add(item.canonicalKey);
    seen.add(item.text);
    return true;
  }).slice(0, 5);
}
