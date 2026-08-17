/**
 * Call public.create_client_motivation_invite with the coach JWT.
 * Pins engine versions + content hash from resolveMotivationEngine.
 * Never logs the raw token.
 */

import {
  QUESTIONNAIRE_V43,
  REPORT_MODEL_V44,
  RULESET_V42,
  resolveMotivationEngine,
} from '../../motivation/versions/motivation-versions.mjs';

const EXPIRES_IN_DAYS = 14;

const CURRENT_MOTIVATION_VERSIONS = Object.freeze({
  questionnaireVersion: QUESTIONNAIRE_V43,
  rulesetVersion: RULESET_V42,
  reportModelVersion: REPORT_MODEL_V44,
});

/**
 * @returns {Promise<
 *   | { ok: true, inviteId: string, token: string, expiresAt: string, contentHash: string, versions: object }
 *   | { ok: false, error: 'forbidden' | 'unavailable' | 'unknown_engine' }
 * >}
 */
export async function createClientMotivationInvite({
  accessToken,
  clientId,
  supabaseUrl,
  publishableKey,
  fetchImpl = globalThis.fetch,
  versions = CURRENT_MOTIVATION_VERSIONS,
} = {}) {
  let engine;
  try {
    engine = resolveMotivationEngine(versions);
  } catch {
    return { ok: false, error: 'unknown_engine' };
  }

  try {
    if (!accessToken || !clientId || !supabaseUrl || !publishableKey || typeof fetchImpl !== 'function') {
      return { ok: false, error: 'forbidden' };
    }
    const base = String(supabaseUrl).replace(/\/$/, '');
    const response = await fetchImpl(`${base}/rest/v1/rpc/create_client_motivation_invite`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_client_id: clientId,
        p_questionnaire_version: engine.questionnaireVersion,
        p_ruleset_version: engine.rulesetVersion,
        p_report_model_version: engine.reportModelVersion,
        p_content_hash: engine.contentHash,
        p_expires_in_days: EXPIRES_IN_DAYS,
      }),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: 'forbidden' };
    }
    if (!response.ok) return { ok: false, error: 'unavailable' };

    const payload = await response.json();
    const created = Array.isArray(payload) ? payload[0] : payload;
    const token = created?.token;
    const expiresAt = created?.expires_at;
    const inviteId = created?.invite_id || created?.id;
    if (typeof token !== 'string' || token.length < 24 || !expiresAt) {
      return { ok: false, error: 'unavailable' };
    }
    return {
      ok: true,
      inviteId: inviteId || '',
      token,
      expiresAt: String(expiresAt),
      contentHash: engine.contentHash,
      versions: {
        questionnaireVersion: engine.questionnaireVersion,
        rulesetVersion: engine.rulesetVersion,
        reportModelVersion: engine.reportModelVersion,
      },
    };
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

export { EXPIRES_IN_DAYS, CURRENT_MOTIVATION_VERSIONS };
