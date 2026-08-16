/**
 * Distinct narrative-clarification bank for questionnaire-v4.2.
 * Max 2 per questionnaire. Never scored as Likert adaptive.
 */

import { QUESTIONNAIRE_V42_NARRATIVE_MAX, V42_NARRATIVE_CANDIDATES } from '../questionnaire/adaptive-bank-v42.mjs';
import { interpretAllDomainsV42 } from '../scoring/domain-interpretation-v42.mjs';

const AESTHETIC = /\b(miroir|poids|abdos?|balance|mincir|maigrir|silhouette|esth[eé]tique|d[eé]finition)\b/i;
const QUALITY = /qualit[eé]|mieux manger|manger sain|alimentation saine|\bsain\b/i;
const VAGUE_SUCCESS = /^(miroir|poids|balance|abdos?|le poids|le miroir)$/i;
const VAGUE_BARRIER = /^(temps|motivation|vie|autre|rien|je sais pas|je ne sais pas)$/i;
const WHY_NOW = /parce que|\bcar\b|afin |important|maintenant|pour (moi|ma|mon|me |etre|être|retrouver|avoir)/i;

function answerFor(questions, answers, code) {
  const question = questions.find((item) => item.code === code);
  return answers.find((item) => (
    item.questionId === question?.id
    || item.questionCode === code
    || item.questionId === code
  ));
}

function textOf(questions, answers, code) {
  const answer = answerFor(questions, answers, code);
  return String(answer?.textValue || '').trim();
}

function hasPersonalValue(text) {
  return WHY_NOW.test(text) || text.length >= 40;
}

function domain(domains, id) {
  return domains.find((item) => item.domainId === id);
}

function recoveryFragile(domains) {
  const adherence = domain(domains, 'adherence_recovery');
  const recovery = domain(domains, 'adherence_recovery_signal');
  const maintenance = domain(domains, 'adherence_maintenance');
  const rigidity = domain(domains, 'all_or_nothing');
  return Boolean(
    adherence?.level === 'low'
    || adherence?.level === 'uncertain'
    || adherence?.trendDisplay === 'low_to_confirm'
    || recovery?.level === 'low'
    || recovery?.level === 'uncertain'
    || maintenance?.level === 'low'
    || rigidity?.level === 'high'
    || rigidity?.trendDisplay === 'high_to_confirm',
  );
}

export function evaluateNarrativeClarificationsV42({ questions, answers }) {
  const domains = interpretAllDomainsV42({ questions, answers });
  const goal = textOf(questions, answers, 'GOAL_01');
  const success = textOf(questions, answers, 'GOAL_02');
  const barrier = textOf(questions, answers, 'OBS_01');
  const nutGoal = textOf(questions, answers, 'NUT_GOAL_01');
  const nutSuccess = textOf(questions, answers, 'NUT_SUCCESS_01');

  const triggers = {
    goal_meaning: !goal || goal.length < 24 || AESTHETIC.test(goal) && !hasPersonalValue(goal) || !hasPersonalValue(goal),
    success_vague: !success || VAGUE_SUCCESS.test(success) || AESTHETIC.test(success) && success.length < 28,
    recovery_fragile: recoveryFragile(domains),
    barrier_vague: Boolean(barrier) && (barrier.length < 16 || VAGUE_BARRIER.test(barrier) || /^(manque de temps|fatigue|motivation)$/i.test(barrier)),
    nutrition_quality: QUALITY.test(nutGoal),
    nutrition_success_missing: Boolean(nutGoal) && !nutSuccess && !QUALITY.test(nutGoal),
  };

  return V42_NARRATIVE_CANDIDATES.map((candidate) => {
    const triggered = Boolean(triggers[candidate.trigger]);
    const priorityScore = (candidate.priority === 'critical' ? 300 : candidate.priority === 'high' ? 200 : 100)
      + (candidate.frontPageImpact === 'high' ? 40 : 0)
      + (candidate.narrativeImpact === 'high' ? 20 : 0)
      + (200 - candidate.code.charCodeAt(0));
    return {
      questionCode: candidate.code,
      trigger: candidate.trigger,
      narrativeImpact: candidate.narrativeImpact,
      frontPageImpact: candidate.frontPageImpact,
      uncertaintyReduction: candidate.uncertaintyReduction,
      priorityScore,
      selected: false,
      rejectionReason: triggered ? undefined : 'trigger_not_met',
    };
  });
}

export function selectNarrativeClarificationsV42(input) {
  const max = Math.min(input.max ?? QUESTIONNAIRE_V42_NARRATIVE_MAX, QUESTIONNAIRE_V42_NARRATIVE_MAX);
  const evaluations = evaluateNarrativeClarificationsV42(input)
    .filter((item) => !item.rejectionReason)
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      return a.questionCode.localeCompare(b.questionCode);
    });
  const selected = [];
  for (const item of evaluations) {
    if (selected.length >= max) break;
    item.selected = true;
    selected.push(item.questionCode);
  }
  const bank = input.questions.filter((question) => (
    question.interpretationTags?.includes('narrative_clarification')
    || V42_NARRATIVE_CANDIDATES.some((candidate) => candidate.code === question.code)
  ));
  return bank
    .filter((question) => selected.includes(question.code))
    .sort((a, b) => selected.indexOf(a.code) - selected.indexOf(b.code));
}
