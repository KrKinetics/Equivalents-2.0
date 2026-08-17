/**
 * Adaptive scoring + narrative banks for questionnaire-v4.3.
 * Scoring bank is identical to v4.2. Narrative bank adds why-now.
 */

import {
  V42_SCORING_CANDIDATES,
  V42_NARRATIVE_CANDIDATES,
  V42_DOMAIN_SELECTION_PRIORITY,
  V42_FRONT_PAGE_CONFIRMATIONS,
  MAX_ADAPTIVE_PER_DOMAIN,
} from './adaptive-bank-v42.mjs';
import { V43_NARRATIVE_BANK_CODES, V43_SCORING_ADAPTIVE_CODES } from './seed-questions-v43.mjs';

export const QUESTIONNAIRE_V43_SCORING_ADAPTIVE_MAX = 4;
export const QUESTIONNAIRE_V43_NARRATIVE_MAX = 2;
export const QUESTIONNAIRE_V43_BASE_COUNT = 34;
export const QUESTIONNAIRE_V43_HARD_MAX = 40;
export { MAX_ADAPTIVE_PER_DOMAIN, V42_DOMAIN_SELECTION_PRIORITY as V43_DOMAIN_SELECTION_PRIORITY, V42_FRONT_PAGE_CONFIRMATIONS as V43_FRONT_PAGE_CONFIRMATIONS };

export const V43_SCORING_CANDIDATES = V42_SCORING_CANDIDATES.map((item) => ({ ...item }));
export const V43_SCORING_ADAPTIVE_CODES_LIST = [...V43_SCORING_ADAPTIVE_CODES];
export const V43_NARRATIVE_BANK_CODES_LIST = [...V43_NARRATIVE_BANK_CODES];

export const V43_NARRATIVE_CANDIDATES = Object.freeze([
  {
    code: 'CLARIFY_WHY_NOW_01',
    trigger: 'why_now_missing',
    narrativeImpact: 'high',
    frontPageImpact: 'high',
    uncertaintyReduction: 'high',
    priority: 'critical',
  },
  ...V42_NARRATIVE_CANDIDATES,
]);
