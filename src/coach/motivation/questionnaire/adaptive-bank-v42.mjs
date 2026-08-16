/**
 * Adaptive scoring + narrative banks for questionnaire-v4.2.
 * Scoring bank extends v4.1; narrative bank is distinct.
 */

import { V41_ADAPTIVE_CANDIDATES, V41_DOMAIN_SELECTION_PRIORITY } from './adaptive-bank-v41.mjs';
import { V42_NARRATIVE_BANK_CODES, V42_SCORING_ADAPTIVE_CODES } from './seed-questions-v42.mjs';

export const QUESTIONNAIRE_V42_SCORING_ADAPTIVE_MAX = 4;
export const QUESTIONNAIRE_V42_NARRATIVE_MAX = 2;
export const QUESTIONNAIRE_V42_BASE_COUNT = 34;
export const QUESTIONNAIRE_V42_HARD_MAX = 40;
export const MAX_ADAPTIVE_PER_DOMAIN = 1;

export const V42_SCORING_ADAPTIVE_CODES_LIST = [...V42_SCORING_ADAPTIVE_CODES];
export const V42_NARRATIVE_BANK_CODES_LIST = [...V42_NARRATIVE_BANK_CODES];

const FRONT_PAGE_DOMAINS = new Set([
  'results_orientation',
  'adherence_recovery',
  'all_or_nothing',
  'adherence_recovery_signal',
  'adherence_maintenance',
]);

function impactFor(candidate) {
  const frontPageImpact = FRONT_PAGE_DOMAINS.has(candidate.domainId)
    || candidate.code === 'MOT_RES_02'
    ? 'high'
    : candidate.priority === 'critical'
      ? 'high'
      : 'moderate';
  return {
    ...candidate,
    decisionImpact: candidate.priority === 'critical' ? 'high' : candidate.priority === 'high' ? 'moderate' : 'low',
    narrativeImpact: candidate.code === 'MOT_RES_02' || FRONT_PAGE_DOMAINS.has(candidate.domainId)
      ? 'high'
      : 'moderate',
    frontPageImpact,
    uncertaintyReduction: candidate.priority === 'critical' ? 'high' : 'moderate',
  };
}

export const V42_SCORING_CANDIDATES = V41_ADAPTIVE_CANDIDATES.map(impactFor);

/** MOT_RES_02 also confirms the front-page results-orientation claim. */
export const V42_FRONT_PAGE_CONFIRMATIONS = Object.freeze([
  {
    code: 'MOT_RES_02',
    domainId: 'results_orientation',
    frontPageImpact: 'high',
    narrativeImpact: 'high',
    uncertaintyReduction: 'high',
  },
]);

export const V42_DOMAIN_SELECTION_PRIORITY = [
  'results_orientation',
  ...V41_DOMAIN_SELECTION_PRIORITY,
];

export const V42_NARRATIVE_CANDIDATES = Object.freeze([
  {
    code: 'CLARIFY_GOAL_MEANING_01',
    trigger: 'goal_meaning',
    narrativeImpact: 'high',
    frontPageImpact: 'high',
    uncertaintyReduction: 'high',
    priority: 'critical',
  },
  {
    code: 'CLARIFY_SUCCESS_01',
    trigger: 'success_vague',
    narrativeImpact: 'high',
    frontPageImpact: 'moderate',
    uncertaintyReduction: 'high',
    priority: 'high',
  },
  {
    code: 'CLARIFY_RECOVERY_01',
    trigger: 'recovery_fragile',
    narrativeImpact: 'high',
    frontPageImpact: 'high',
    uncertaintyReduction: 'high',
    priority: 'critical',
  },
  {
    code: 'CLARIFY_BARRIER_01',
    trigger: 'barrier_vague',
    narrativeImpact: 'moderate',
    frontPageImpact: 'moderate',
    uncertaintyReduction: 'high',
    priority: 'high',
  },
  {
    code: 'CLARIFY_NUT_QUALITY_01',
    trigger: 'nutrition_quality',
    narrativeImpact: 'high',
    frontPageImpact: 'moderate',
    uncertaintyReduction: 'high',
    priority: 'high',
  },
  {
    code: 'NUT_SUCCESS_01',
    trigger: 'nutrition_success_missing',
    narrativeImpact: 'high',
    frontPageImpact: 'moderate',
    uncertaintyReduction: 'moderate',
    priority: 'moderate',
  },
]);
