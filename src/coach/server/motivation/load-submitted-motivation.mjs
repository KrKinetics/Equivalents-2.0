/**
 * Load a submitted motivation invite + response after authorization.
 * Never accepts browser-supplied answers. Never logs answer payloads.
 */

import { authorizeMotivationAccess } from './authorize-motivation-access.mjs';

function restHeaders(publishableKey, accessToken) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };
}

/**
 * @returns {Promise<
 *   | { ok: true, client: object, invite: object, response: object }
 *   | { ok: false, error: 'forbidden' | 'not_found' }
 * >}
 */
export async function loadSubmittedMotivationAssessment({
  accessToken,
  organizationId,
  clientId,
  responseId = null,
  supabaseUrl,
  publishableKey,
  fetchImpl = globalThis.fetch,
} = {}) {
  const access = await authorizeMotivationAccess({
    accessToken,
    organizationId,
    clientId,
    supabaseUrl,
    publishableKey,
    fetchImpl,
  });
  if (!access.ok) return access;

  try {
    const base = String(supabaseUrl).replace(/\/$/, '');
    const responseParams = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      client_id: `eq.${clientId}`,
      status: 'eq.submitted',
      select: 'id,invite_id,client_id,organization_id,status,answers,presented_question_codes,consent_given,submitted_at',
      order: 'submitted_at.desc',
      limit: '1',
    });
    if (responseId) responseParams.set('id', `eq.${responseId}`);

    const responseRes = await fetchImpl(`${base}/rest/v1/client_motivation_responses?${responseParams}`, {
      headers: restHeaders(publishableKey, accessToken),
    });
    if (!responseRes.ok) return { ok: false, error: 'forbidden' };
    const responseRows = await responseRes.json();
    const response = Array.isArray(responseRows) ? responseRows[0] : null;
    if (!response || response.status !== 'submitted' || !Array.isArray(response.answers)) {
      return { ok: false, error: 'not_found' };
    }

    const inviteParams = new URLSearchParams({
      id: `eq.${response.invite_id}`,
      organization_id: `eq.${organizationId}`,
      client_id: `eq.${clientId}`,
      status: 'eq.submitted',
      select: 'id,client_id,organization_id,questionnaire_version,ruleset_version,report_model_version,content_hash,status,submitted_at',
      limit: '1',
    });
    const inviteRes = await fetchImpl(`${base}/rest/v1/client_motivation_invites?${inviteParams}`, {
      headers: restHeaders(publishableKey, accessToken),
    });
    if (!inviteRes.ok) return { ok: false, error: 'forbidden' };
    const inviteRows = await inviteRes.json();
    const invite = Array.isArray(inviteRows) ? inviteRows[0] : null;
    if (!invite || invite.status !== 'submitted') {
      return { ok: false, error: 'not_found' };
    }

    return {
      ok: true,
      client: access.client,
      invite,
      response,
    };
  } catch {
    return { ok: false, error: 'forbidden' };
  }
}

/**
 * @returns {Promise<object[]>}
 */
export async function loadMotivationAnalysisVersions({
  accessToken,
  responseId,
  supabaseUrl,
  publishableKey,
  fetchImpl = globalThis.fetch,
} = {}) {
  const base = String(supabaseUrl).replace(/\/$/, '');
  const params = new URLSearchParams({
    response_id: `eq.${responseId}`,
    select: 'id,analysis_version,questionnaire_version,ruleset_version,report_model_version,content_hash,analysis_snapshot,created_at',
    order: 'analysis_version.desc',
  });
  const res = await fetchImpl(`${base}/rest/v1/client_motivation_analysis_versions?${params}`, {
    headers: restHeaders(publishableKey, accessToken),
  });
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}
