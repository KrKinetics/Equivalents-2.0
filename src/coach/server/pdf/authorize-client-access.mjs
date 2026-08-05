/**
 * Verify that the authenticated coach may generate a PDF only for a fictional
 * client in the selected organization. Uses the caller's JWT; no service role.
 */
export async function authorizeClientAccess({
  accessToken, organizationId, clientId, supabaseUrl, publishableKey, fetchImpl = globalThis.fetch,
} = {}) {
  try {
    if (!accessToken || !organizationId || !clientId || !supabaseUrl || !publishableKey || typeof fetchImpl !== 'function') {
      return { ok: false, error: 'forbidden' };
    }
    const base = String(supabaseUrl).replace(/\/$/, '');
    const url = `${base}/rest/v1/clients?id=eq.${encodeURIComponent(clientId)}&select=id,organization_id,full_name,is_fictional&limit=1`;
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
      client: { id: client.id, organization_id: client.organization_id, full_name: client.full_name },
    };
  } catch {
    return { ok: false, error: 'forbidden' };
  }
}
