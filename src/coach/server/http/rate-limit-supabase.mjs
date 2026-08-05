/**
 * Distributed rate limit via Supabase RPC (migration required).
 * Uses publishable key + caller JWT when available; never service_role.
 *
 * Never silently falls back — callers must treat non-allowed results as
 * definitive (429) or unavailable (503).
 */

const RPC_TIMEOUT_MS = 2_500;

/**
 * @typedef {{
 *   kind: 'allowed',
 * } | {
 *   kind: 'limited',
 *   retryAfterSec: number,
 * } | {
 *   kind: 'unavailable',
 *   category: string,
 * }} SupabaseRateResult
 */

/**
 * @param {{
 *   bucketKey: string,
 *   max: number,
 *   windowMs: number,
 *   supabaseUrl: string,
 *   publishableKey: string,
 *   accessToken?: string|null,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 * }} opts
 * @returns {Promise<SupabaseRateResult>}
 */
export async function consumeSupabaseRateLimit({
  bucketKey,
  max,
  windowMs,
  supabaseUrl,
  publishableKey,
  accessToken = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = RPC_TIMEOUT_MS,
}) {
  const base = String(supabaseUrl || '').replace(/\/$/, '');
  if (!base || !publishableKey) {
    return { kind: 'unavailable', category: 'missing_supabase_env' };
  }
  if (typeof fetchImpl !== 'function') {
    return { kind: 'unavailable', category: 'fetch_missing' };
  }

  const headers = {
    apikey: publishableKey,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
      try { controller.abort(); } catch { /* ignore */ }
    }, timeoutMs)
    : null;

  let res;
  try {
    res = await fetchImpl(`${base}/rest/v1/rpc/coach_consume_rate_limit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_bucket: String(bucketKey).slice(0, 180),
        p_limit: max,
        p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
      }),
      signal: controller?.signal,
    });
  } catch (err) {
    const name = String(err?.name || '');
    if (name === 'AbortError') return { kind: 'unavailable', category: 'rpc_timeout' };
    return { kind: 'unavailable', category: 'rpc_network' };
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (res.status >= 500) {
    return { kind: 'unavailable', category: 'rpc_5xx' };
  }
  if (!res.ok) {
    // 404 (missing RPC), 401, etc. — treat as unavailable, not as "allow"
    return { kind: 'unavailable', category: `rpc_http_${res.status}` };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { kind: 'unavailable', category: 'rpc_invalid_json' };
  }

  const allowed = data?.allowed === true || data?.ok === true;
  if (allowed) return { kind: 'allowed' };

  if (data?.allowed === false || data?.ok === false) {
    const retryAfterSec = Math.max(
      1,
      Number(data?.retry_after_sec) || Math.ceil(windowMs / 1000),
    );
    return { kind: 'limited', retryAfterSec };
  }

  return { kind: 'unavailable', category: 'rpc_invalid_payload' };
}

export { RPC_TIMEOUT_MS };
