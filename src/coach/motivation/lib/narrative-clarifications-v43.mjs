/**
 * Narrative clarifications for questionnaire-v4.3.
 * Broader success/why-now triggers. Max 2. Distinct from Likert adaptive.
 */

import { QUESTIONNAIRE_V43_NARRATIVE_MAX, V43_NARRATIVE_CANDIDATES } from '../questionnaire/adaptive-bank-v43.mjs';
import { interpretAllDomainsV42 } from '../scoring/domain-interpretation-v42.mjs';

const AESTHETIC = /\b(miroir|poids|abdos?|balance|mincir|maigrir|silhouette|esth[eé]tique|d[eé]finition)\b/i;
const QUALITY = /qualit[eé]|mieux manger|manger sain|alimentation saine|\bsain\b/i;
const VAGUE_SUCCESS = /^(miroir|poids|balance|abdos?|le poids|le miroir|me sentir fort|me sentir mieux|être mieux|etre mieux|forme)$/i;
const ABSTRACT_SUCCESS = /me sentir|être mieux|etre mieux|plus fort|mieux dans mon corps|en forme/i;
const VAGUE_BARRIER = /^(temps|motivation|vie|autre|rien|je sais pas|je ne sais pas)$/i;
const WHY_NOW = /parce que|\bcar\b|afin |important maintenant|pour (moi|ma|mon|me |etre|être|retrouver|avoir)/i;

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

function hasPersonalValue(value) {
  return WHY_NOW.test(value) || value.length >= 48;
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
    || recovery?.level === 'low'
    || maintenance?.level === 'low'
    || rigidity?.level === 'high',
  );
}

export function evaluateNarrativeClarificationsV43({ questions, answers }) {
  const domains = interpretAllDomainsV42({ questions, answers });
  const goal = textOf(questions, answers, 'GOAL_01');
  const success = textOf(questions, answers, 'GOAL_02');
  const barrier = textOf(questions, answers, 'OBS_01');
  const nutGoal = textOf(questions, answers, 'NUT_GOAL_01');
  const nutSuccess = textOf(questions, answers, 'NUT_SUCCESS_01');
  const whyNow = textOf(questions, answers, 'CLARIFY_WHY_NOW_01');

  const triggers = {
    why_now_missing: Boolean(goal) && !hasPersonalValue(goal) && !whyNow,
    goal_meaning: !goal || goal.length < 24 || (AESTHETIC.test(goal) && !hasPersonalValue(goal)),
    success_vague: !success || VAGUE_SUCCESS.test(success) || (ABSTRACT_SUCCESS.test(success) && success.length < 36),
    recovery_fragile: recoveryFragile(domains),
    barrier_vague: Boolean(barrier) && (barrier.length < 16 || VAGUE_BARRIER.test(barrier) || /^(manque de temps|fatigue|motivation)$/i.test(barrier)),
    nutrition_quality: QUALITY.test(nutGoal),
    nutrition_success_missing: Boolean(nutGoal) && !nutSuccess && !QUALITY.test(nutGoal),
  };

  return V43_NARRATIVE_CANDIDATES.map((candidate) => {
    const triggered = Boolean(triggers[candidate.trigger]);
    const priorityScore = (candidate.priority === 'critical' ? 300 : candidate.priority === 'high' ? 200 : 100)
      + (candidate.frontPageImpact === 'high' ? 40 : 0)
      + (candidate.narrativeImpact === 'high' ? 20 : 0);
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

export function selectNarrativeClarificationsV43(input) {
  const max = Math.min(input.max ?? QUESTIONNAIRE_V43_NARRATIVE_MAX, QUESTIONNAIRE_V43_NARRATIVE_MAX);
  const evaluations = evaluateNarrativeClarificationsV43(input)
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
    || V43_NARRATIVE_CANDIDATES.some((candidate) => candidate.code === question.code)
  ));
  return bank
    .filter((question) => selected.includes(question.code))
    .sort((a, b) => selected.indexOf(a.code) - selected.indexOf(b.code));
}
