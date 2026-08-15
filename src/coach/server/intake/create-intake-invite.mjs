/**
 * Call existing public.create_client_intake_invite with the coach JWT.
 * Does not duplicate revoke/hash/expiry logic. Never logs the raw token.
 */

const EXPIRES_IN_DAYS = 14;

/**
 * @returns {Promise<
 *   | { ok: true, inviteId: string, token: string, expiresAt: string }
 *   | { ok: false, error: 'forbidden' | 'unavailable' }
 * >}
 */
export async function createClientIntakeInvite({
  accessToken,
  clientId,
  supabaseUrl,
  publishableKey,
  fetchImpl = globalThis.fetch,
} = {}) {
  try {
    if (!accessToken || !clientId || !supabaseUrl || !publishableKey || typeof fetchImpl !== 'function') {
      return { ok: false, error: 'forbidden' };
    }
    const base = String(supabaseUrl).replace(/\/$/, '');
    const response = await fetchImpl(`${base}/rest/v1/rpc/create_client_intake_invite`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_client_id: clientId,
        p_expires_in_days: EXPIRES_IN_DAYS,
      }),
    });
    if (response.status === 401) return { ok: false, error: 'forbidden' };
    if (response.status === 403) return { ok: false, error: 'forbidden' };
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
    };
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

export { EXPIRES_IN_DAYS };
