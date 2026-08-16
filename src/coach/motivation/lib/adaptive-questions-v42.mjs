/**
 * v4.2 adaptive selection: scoring confirmations (max 4) + narrative clarifications (max 2).
 * Extends the v4.1 decision-impact simulation; does not replace it.
 */

import {
  MAX_ADAPTIVE_PER_DOMAIN,
  QUESTIONNAIRE_V42_SCORING_ADAPTIVE_MAX,
  V42_DOMAIN_SELECTION_PRIORITY,
  V42_FRONT_PAGE_CONFIRMATIONS,
  V42_SCORING_CANDIDATES,
} from '../questionnaire/adaptive-bank-v42.mjs';
import { interpretDomain } from '../scoring/domain-interpretation-v41.mjs';
import { interpretAllDomainsV42, V42_DOMAIN_DEFINITIONS } from '../scoring/domain-interpretation-v42.mjs';
import { deriveCoachingDecisions } from './adaptive-questions-v41.mjs';
import { selectNarrativeClarificationsV42 } from './narrative-clarifications-v42.mjs';

function safetyPriority(domainId) {
  if (domainId === 'all_or_nothing') return 0;
  if (domainId.startsWith('adherence')) return 1;
  if (domainId === 'compensatory_food' || domainId === 'results_orientation') return 2;
  return 3;
}

function priorityRank(priority) {
  return priority === 'critical' ? 0 : priority === 'high' ? 1 : 2;
}

function cloneAnswersWithLikert(questions, answers, code, numericValue) {
  const question = questions.find((item) => item.code === code);
  if (!question) return answers;
  return [
    ...answers.filter((answer) => answer.questionId !== question.id && answer.questionCode !== code),
    { questionId: question.id, questionCode: code, numericValue },
  ];
}

function deriveV42Decisions(domains) {
  const base = deriveCoachingDecisions(domains);
  const results = domains.find((item) => item.domainId === 'results_orientation');
  return {
    ...base,
    results_horizon: [
      results?.level ?? 'na',
      results?.itemCount ?? 0,
      results?.agreement ?? 'na',
      results?.evidenceStrength ?? 'na',
    ].join('|'),
  };
}

function canChangeDecision({ questions, answers, candidateQuestionCode, affectedDecisionIds }) {
  const baseDomains = interpretAllDomainsV42({ questions, answers }).filter((item) => item.itemCount > 0);
  const baseDecisions = deriveV42Decisions(baseDomains);
  const relevant = new Set([...affectedDecisionIds, 'results_horizon']);
  for (let value = 1; value <= 5; value += 1) {
    const simAnswers = cloneAnswersWithLikert(questions, answers, candidateQuestionCode, value);
    const simDomains = interpretAllDomainsV42({ questions, answers: simAnswers }).filter((item) => item.itemCount > 0);
    const simDecisions = deriveV42Decisions(simDomains);
    for (const id of relevant) {
      if (baseDecisions[id] !== simDecisions[id]) return true;
    }
  }
  return false;
}

function ambiguityScore(domain) {
  if (!domain) return 0;
  if (domain.agreement === 'strongly_divergent') return 100;
  if (domain.agreement === 'mixed') return 70;
  if (domain.agreement === 'insufficient' || domain.evidenceStrength === 'limited') return 55;
  if (domain.level === 'uncertain') return 60;
  return 20;
}

function frontPageNeedsConfirmation(domain) {
  if (!domain) return false;
  return domain.itemCount === 1 && (domain.level === 'high' || domain.level === 'low');
}

export function evaluateAdaptiveCandidatesV42(input) {
  const baseQuestions = input.questions.filter((question) => (
    !question.interpretationTags?.includes('adaptive_bank')
    && !question.interpretationTags?.includes('narrative_clarification')
  ));
  const domains = V42_DOMAIN_DEFINITIONS.map((definition) => interpretDomain({
    definition,
    questions: baseQuestions,
    answers: input.answers,
  }));
  const byDomain = new Map(domains.map((item) => [item.domainId, item]));
  const results = byDomain.get('results_orientation');

  return V42_SCORING_CANDIDATES.map((candidate) => {
    const domain = byDomain.get(candidate.domainId)
      ?? byDomain.get(candidate.domainId.startsWith('adherence') ? 'adherence_recovery' : candidate.domainId);
    const parent = candidate.domainId.startsWith('adherence')
      ? byDomain.get('adherence_recovery')
      : domain;
    const amb = ambiguityScore(parent ?? domain);
    const canChange = canChangeDecision({
      questions: input.questions,
      answers: input.answers,
      candidateQuestionCode: candidate.code,
      affectedDecisionIds: candidate.affectedDecisionIds,
    });
    const frontPage = V42_FRONT_PAGE_CONFIRMATIONS.some((item) => item.code === candidate.code)
      && frontPageNeedsConfirmation(results);
    const target = parent ?? domain;
    const safety = safetyPriority(candidate.domainId) <= 2;
    const fragileSafety = safety && (
      target?.level === 'low'
      || target?.level === 'uncertain'
      || target?.trendDisplay === 'low_to_confirm'
      || target?.trendDisplay === 'high_to_confirm'
      || (candidate.domainId === 'all_or_nothing' && (target?.level === 'high' || target?.level === 'moderate'))
    );
    const needsAsk = (canChange && (
      frontPage
      || fragileSafety
      || target?.agreement === 'strongly_divergent'
      || target?.agreement === 'mixed'
      || (target?.evidenceStrength === 'limited' && ['low', 'high', 'uncertain'].includes(target?.level))
    )) || frontPage;
    const domainIdx = V42_DOMAIN_SELECTION_PRIORITY.indexOf(candidate.domainId);
    const priorityScore = (4 - safetyPriority(candidate.domainId)) * 100_000
      + (frontPage ? 50_000 : 0)
      + (3 - priorityRank(candidate.priority)) * 10_000
      + amb * 100
      + (domainIdx === -1 ? 0 : (80 - domainIdx) * 10)
      + (200 - candidate.code.charCodeAt(0));
    return {
      questionCode: candidate.code,
      domainId: candidate.domainId,
      affectedDecisionIds: candidate.affectedDecisionIds,
      decisionImpact: needsAsk ? (frontPage ? 'high' : candidate.decisionImpact) : 'none',
      narrativeImpact: candidate.narrativeImpact,
      frontPageImpact: frontPage ? 'high' : candidate.frontPageImpact,
      uncertaintyReduction: candidate.uncertaintyReduction,
      ambiguityReductionPotential: amb,
      priorityScore,
      selected: false,
      rejectionReason: needsAsk ? undefined : (canChange ? 'insufficient_ambiguity' : 'no_decision_impact'),
    };
  });
}

export function selectScoringAdaptiveQuestionsV42(input) {
  const max = Math.min(input.max ?? QUESTIONNAIRE_V42_SCORING_ADAPTIVE_MAX, QUESTIONNAIRE_V42_SCORING_ADAPTIVE_MAX);
  const bank = input.questions.filter((question) => question.interpretationTags?.includes('adaptive_bank'));
  const evaluations = evaluateAdaptiveCandidatesV42(input)
    .filter((item) => item.decisionImpact !== 'none')
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      return a.questionCode.localeCompare(b.questionCode);
    });
  const finalCodes = [];
  const domains = new Set();
  const domainKey = (id) => (id.startsWith('adherence') ? 'adherence_family' : id);
  for (const item of evaluations) {
    const key = domainKey(item.domainId);
    if (domains.has(key)) continue;
    if (finalCodes.length >= max) break;
    domains.add(key);
    finalCodes.push(item.questionCode);
    item.selected = true;
  }
  return bank
    .filter((question) => finalCodes.includes(question.code))
    .sort((a, b) => finalCodes.indexOf(a.code) - finalCodes.indexOf(b.code));
}

export function selectAdaptiveQuestionsV42(input) {
  const scoring = selectScoringAdaptiveQuestionsV42(input);
  const scoringCodes = new Set(scoring.map((question) => question.code));
  const narrative = selectNarrativeClarificationsV42(input)
    .filter((question) => !scoringCodes.has(question.code));
  return { scoring, narrative, questions: [...scoring, ...narrative] };
}

export { MAX_ADAPTIVE_PER_DOMAIN, selectNarrativeClarificationsV42 };
