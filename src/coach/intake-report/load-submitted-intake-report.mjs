/**
 * Load the latest submitted pre-interview response after authorization.
 * Never accepts browser-supplied answers. Never logs answer payloads.
 */

import { authorizeIntakeReportAccess } from './authorize-intake-report-access.mjs';

/**
 * @param {object} opts
 * @returns {Promise<
 *   | { ok: true, client: object, submittedAt: string|null, answers: Record<string, unknown> }
 *   | { ok: false, error: 'forbidden'|'not_found' }
 * >}
 */
export async function loadSubmittedIntakeReport({
  accessToken,
  organizationId,
  clientId,
  supabaseUrl,
  publishableKey,
  fetchImpl = globalThis.fetch,
} = {}) {
  const access = await authorizeIntakeReportAccess({
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
    const params = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      client_id: `eq.${clientId}`,
      status: 'eq.submitted',
      select: 'answers,submitted_at,status',
      order: 'submitted_at.desc',
      limit: '1',
    });
    const response = await fetchImpl(`${base}/rest/v1/client_intake_responses?${params}`, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) return { ok: false, error: 'forbidden' };
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || row.status !== 'submitted') {
      return { ok: false, error: 'not_found' };
    }
    const answers = row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)
      ? row.answers
      : {};
    return {
      ok: true,
      client: access.client,
      submittedAt: typeof row.submitted_at === 'string' ? row.submitted_at : null,
      answers,
    };
  } catch {
    return { ok: false, error: 'forbidden' };
  }
}
