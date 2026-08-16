/**
 * Browser-safe official questionnaire bundle metadata.
 * Versions/hash must match resolveMotivationEngine in Node.
 * This module must not import node:crypto or versions.mjs.
 */

export const OFFICIAL_QUESTIONNAIRE_VERSION = 'questionnaire-v4.1';
export const OFFICIAL_RULESET_VERSION = 'ruleset-v4.1';
export const OFFICIAL_REPORT_MODEL_VERSION = 'report-model-v4.2';
export const OFFICIAL_CONTENT_HASH = '1265924371782d8818c6d8a0121a51495d3716257303febb5afc238fade49533';
export const OFFICIAL_BASE_COUNT = 34;
export const OFFICIAL_ADAPTIVE_MAX = 4;

export const OFFICIAL_V42_QUESTIONNAIRE_VERSION = 'questionnaire-v4.2';
export const OFFICIAL_V42_RULESET_VERSION = 'ruleset-v4.2';
export const OFFICIAL_V42_REPORT_MODEL_VERSION = 'report-model-v4.3';
export const OFFICIAL_V42_CONTENT_HASH = '484a314890c802947b5f8c6dee71ab29e331259a426606cfd7aa9d2ee315902f';
export const OFFICIAL_V42_BASE_COUNT = 34;
export const OFFICIAL_V42_SCORING_ADAPTIVE_MAX = 4;
export const OFFICIAL_V42_NARRATIVE_MAX = 2;
export const OFFICIAL_V42_HARD_MAX = 40;

export const OFFICIAL_BUNDLES = Object.freeze([
  Object.freeze({
    questionnaireVersion: OFFICIAL_QUESTIONNAIRE_VERSION,
    rulesetVersion: OFFICIAL_RULESET_VERSION,
    reportModelVersion: OFFICIAL_REPORT_MODEL_VERSION,
    contentHash: OFFICIAL_CONTENT_HASH,
    baseCount: OFFICIAL_BASE_COUNT,
    adaptiveMax: OFFICIAL_ADAPTIVE_MAX,
    narrativeMax: 0,
  }),
  Object.freeze({
    questionnaireVersion: OFFICIAL_V42_QUESTIONNAIRE_VERSION,
    rulesetVersion: OFFICIAL_V42_RULESET_VERSION,
    reportModelVersion: OFFICIAL_V42_REPORT_MODEL_VERSION,
    contentHash: OFFICIAL_V42_CONTENT_HASH,
    baseCount: OFFICIAL_V42_BASE_COUNT,
    adaptiveMax: OFFICIAL_V42_SCORING_ADAPTIVE_MAX,
    narrativeMax: OFFICIAL_V42_NARRATIVE_MAX,
  }),
]);

/**
 * @param {{ questionnaire_version?: string, ruleset_version?: string, report_model_version?: string, content_hash?: string }} invite
 * @returns {{ ok: true, bundle: object } | { ok: false, error: 'incompatible_bundle' }}
 */
export function assertOfficialMotivationBundle(invite) {
  const bundle = OFFICIAL_BUNDLES.find((item) => (
    invite?.questionnaire_version === item.questionnaireVersion
    && invite?.ruleset_version === item.rulesetVersion
    && invite?.report_model_version === item.reportModelVersion
    && invite?.content_hash === item.contentHash
  ));
  if (bundle) return { ok: true, bundle };
  return { ok: false, error: 'incompatible_bundle' };
}

export const LIKERT_LABELS = Object.freeze([
  'Pas du tout d’accord',
  'Peu d’accord',
  'Neutre',
  'D’accord',
  'Tout à fait d’accord',
]);
