/**
 * Server-only write of an official motivation analysis.
 * Uses SUPABASE_SERVICE_ROLE_KEY after Coach JWT authorization.
 * Never imported by browser code. Never writes config.js.
 */

const TRUSTED_PERSIST_RPC = 'persist_client_motivation_analysis';

/**
 * @param {NodeJS.ProcessEnv | Record<string, string|undefined>} [env]
 * @returns {{ ok: true, serviceRoleKey: string } | { ok: false, error: 'unavailable' }}
 */
export function readMotivationServiceRoleKey(env = process.env) {
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) return { ok: false, error: 'unavailable' };
  if (key.startsWith('sb_publishable_')) return { ok: false, error: 'unavailable' };
  return { ok: true, serviceRoleKey: key };
}

/**
 * Persist a server-computed analysis. Caller must already have:
 * coach JWT → org/client authorize → submitted reload → engine + hash checks.
 *
 * @returns {Promise<
 *   | { ok: true, id: string, analysis_version: number, idempotent: boolean, created_at: string|null }
 *   | { ok: false, error: 'forbidden' | 'unavailable' }
 * >}
 */
export async function persistTrustedMotivationAnalysis({
  supabaseUrl,
  publishableKey,
  serviceRoleKey,
  createdByUserId,
  fetchImpl = globalThis.fetch,
  responseId,
  clientId,
  engine,
  presentedQuestionCodes,
  answers,
  analysisSnapshot,
} = {}) {
  const role = serviceRoleKey || readMotivationServiceRoleKey().serviceRoleKey;
  if (
    !supabaseUrl
    || !publishableKey
    || !role
    || !createdByUserId
    || !responseId
    || !clientId
    || !engine
    || typeof fetchImpl !== 'function'
  ) {
    return { ok: false, error: 'unavailable' };
  }

  const base = String(supabaseUrl).replace(/\/$/, '');
  const response = await fetchImpl(`${base}/rest/v1/rpc/${TRUSTED_PERSIST_RPC}`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${role}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_response_id: responseId,
      p_client_id: clientId,
      p_questionnaire_version: engine.questionnaireVersion,
      p_ruleset_version: engine.rulesetVersion,
      p_report_model_version: engine.reportModelVersion,
      p_content_hash: engine.contentHash,
      p_definition_snapshot: engine.definitionSnapshot,
      p_presented_question_codes: presentedQuestionCodes,
      p_answers_snapshot: answers,
      p_analysis_snapshot: analysisSnapshot,
      p_created_by: createdByUserId,
    }),
  });
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: 'forbidden' };
  }
  if (!response.ok) return { ok: false, error: 'unavailable' };
  const payload = await response.json();
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row?.id || !row.analysis_version) return { ok: false, error: 'unavailable' };
  return {
    ok: true,
    id: row.id,
    analysis_version: row.analysis_version,
    idempotent: row.idempotent === true,
    created_at: row.created_at || null,
  };
}
