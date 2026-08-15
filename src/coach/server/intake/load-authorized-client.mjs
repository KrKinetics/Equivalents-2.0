/**
 * Load a client the authenticated coach may invite.
 * Uses the caller's JWT + RLS. Never service_role.
 * Preserves current fictional-client eligibility (does not reinterpret it).
 */

/**
 * @param {object} opts
 * @returns {Promise<
 *   | { ok: true, client: { id: string, organization_id: string, full_name: string, email: string|null } }
 *   | { ok: false, error: 'forbidden' }
 * >}
 */
export async function loadAuthorizedClientForInvite({
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
    const url = `${base}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}&select=id,organization_id,full_name,email,is_fictional&limit=1`;
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
    if (!client || client.organization_id !== organizationId || client.is_fictional !== true) {
      return { ok: false, error: 'forbidden' };
    }
    return {
      ok: true,
      client: {
        id: client.id,
        organization_id: client.organization_id,
        full_name: typeof client.full_name === 'string' ? client.full_name : '',
        email: client.email == null ? null : String(client.email),
      },
    };
  } catch {
    return { ok: false, error: 'forbidden' };
  }
}
