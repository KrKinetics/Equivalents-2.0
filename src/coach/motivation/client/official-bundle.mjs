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

export const LIKERT_LABELS = Object.freeze([
  'Pas du tout d’accord',
  'Peu d’accord',
  'Neutre',
  'D’accord',
  'Tout à fait d’accord',
]);

/**
 * @param {{ questionnaire_version?: string, ruleset_version?: string, report_model_version?: string, content_hash?: string }} invite
 * @returns {{ ok: true } | { ok: false, error: 'incompatible_bundle' }}
 */
export function assertOfficialMotivationBundle(invite) {
  if (
    invite?.questionnaire_version === OFFICIAL_QUESTIONNAIRE_VERSION
    && invite?.ruleset_version === OFFICIAL_RULESET_VERSION
    && invite?.report_model_version === OFFICIAL_REPORT_MODEL_VERSION
    && invite?.content_hash === OFFICIAL_CONTENT_HASH
  ) {
    return { ok: true };
  }
  return { ok: false, error: 'incompatible_bundle' };
}
