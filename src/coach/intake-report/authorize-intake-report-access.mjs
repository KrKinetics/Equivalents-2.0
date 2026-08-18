/**
 * Verify the authenticated coach may open a pre-interview report for a
 * real client in the selected organization.
 *
 * All service types are allowed (programming, nutrition, complete).
 * Do not reuse the nutrition-plan authorizeClientAccess gate.
 * Uses the caller's JWT; no service role.
 */

/**
 * @param {object} opts
 * @returns {Promise<
 *   | { ok: true, client: {
 *       id: string,
 *       organization_id: string,
 *       full_name: string,
 *       service_type: string|null,
 *     } }
 *   | { ok: false, error: 'forbidden' }
 * >}
 */
export async function authorizeIntakeReportAccess({
  accessToken,
  organizationId,
  clientId,
  supabaseUrl,
  publishableKey,
  fetchImpl = globalThis.fetch,
} = {}) {
  try {
    if (
      !accessToken
      || !organizationId
      || !clientId
      || !supabaseUrl
      || !publishableKey
      || typeof fetchImpl !== 'function'
    ) {
      return { ok: false, error: 'forbidden' };
    }
    const base = String(supabaseUrl).replace(/\/$/, '');
    const url = `${base}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}&select=id,organization_id,full_name,is_fictional,service_type&limit=1`;
    const response = await fetchImpl(url, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) return { ok: false, error: 'forbidden' };
    const rows = await response.json();
    const client = Array.isArray(rows) ? rows[0] : null;
    if (!client || client.organization_id !== organizationId || client.is_fictional !== false) {
      return { ok: false, error: 'forbidden' };
    }
    return {
      ok: true,
      client: {
        id: client.id,
        organization_id: client.organization_id,
        full_name: typeof client.full_name === 'string' ? client.full_name : '',
        service_type: client.service_type == null ? null : String(client.service_type),
      },
    };
  } catch {
    return { ok: false, error: 'forbidden' };
  }
}
