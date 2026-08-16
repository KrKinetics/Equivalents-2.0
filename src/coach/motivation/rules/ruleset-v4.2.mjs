/**
 * Analysis rules for questionnaire-v4.2 / report-model-v4.3.
 * Thresholds match v4.1; version id is explicit so historical v4.1 stays immutable.
 */

import { CONTRADICTIONS_V41, RULES_V41, RULESET_V41_THRESHOLDS } from './ruleset-v4.1.mjs';

export const RULESET_V42_VERSION = 'ruleset-v4.2';
export const RULESET_V42_THRESHOLDS = {
  ...RULESET_V41_THRESHOLDS,
  adaptiveMax: 4,
  narrativeMax: 2,
  hardQuestionMax: 40,
};
export const RULES_V42 = RULES_V41;
export const CONTRADICTIONS_V42 = CONTRADICTIONS_V41;
