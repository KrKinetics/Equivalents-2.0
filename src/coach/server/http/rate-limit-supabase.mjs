/**
 * Optional distributed rate limit via Supabase RPC (migration required).
 * Uses publishable key + caller JWT when available; never service_role.
 */

/**
 * @param {{
 *   bucketKey: string,
 *   max: number,
 *   windowMs: number,
 *   supabaseUrl: string,
 *   publishableKey: string,
 *   accessToken?: string|null,
 * }} opts
 * @returns {Promise<null | { ok: true } | { ok: false, status: 429, error: 'rate_limited', retryAfterSec: number }>}
 */
export async function consumeSupabaseRateLimit({
  bucketKey,
  max,
  windowMs,
  supabaseUrl,
  publishableKey,
  accessToken = null,
}) {
  const base = String(supabaseUrl || '').replace(/\/$/, '');
  if (!base || !publishableKey) return null;

  const headers = {
    apikey: publishableKey,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${base}/rest/v1/rpc/coach_consume_rate_limit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_bucket: String(bucketKey).slice(0, 180),
      p_limit: max,
      p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const allowed = data?.allowed === true || data?.ok === true;
  if (allowed) return { ok: true };
  const retryAfterSec = Math.max(1, Number(data?.retry_after_sec) || Math.ceil(windowMs / 1000));
  return {
    ok: false,
    status: 429,
    error: 'rate_limited',
    retryAfterSec,
  };
}
