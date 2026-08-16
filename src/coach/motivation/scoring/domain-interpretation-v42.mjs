/**
 * Domain definitions for questionnaire-v4.2 / ruleset-v4.2.
 * MOT_RES_02 can confirm the front-page results-orientation signal.
 */

import {
  interpretDomain,
  V41_DOMAIN_DEFINITIONS,
  V41_PRIMARY_DOMAIN_IDS,
} from './domain-interpretation-v41.mjs';

export const V42_DOMAIN_DEFINITIONS = V41_DOMAIN_DEFINITIONS.map((definition) => {
  if (definition.domainId === 'results_orientation') {
    return {
      ...definition,
      adaptiveCodes: ['MOT_RES_02'],
    };
  }
  return { ...definition };
});

export const V42_PRIMARY_DOMAIN_IDS = V41_PRIMARY_DOMAIN_IDS;

export function interpretAllDomainsV42({ questions, answers }) {
  return V42_DOMAIN_DEFINITIONS.map((definition) => interpretDomain({
    definition,
    questions,
    answers,
  }));
}

export { interpretDomain };
