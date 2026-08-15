/**
 * Resend HTTP client for Coach transactional mail.
 * Server-side only. Never logs API keys, recipients, HTML, or provider bodies.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS = 10_000;
const FORBIDDEN_FROM_RE = /onboarding@resend\.dev/i;
const FROM_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * @param {unknown} raw
 * @returns {{ ok: true, from: string } | { ok: false, reason: string }}
 */
export function parseMailFrom(raw) {
  const value = String(raw || '').trim();
  if (!value || value.length > 200) return { ok: false, reason: 'missing_from' };
  if (FORBIDDEN_FROM_RE.test(value)) return { ok: false, reason: 'unverified_from' };
  const angled = value.match(/^(.+?)\s*<([^>]+)>$/);
  const email = (angled ? angled[2] : value).trim().toLowerCase();
  if (!FROM_EMAIL_RE.test(email)) return { ok: false, reason: 'malformed_from' };
  return { ok: true, from: value };
}

function readApiKey(raw) {
  const value = String(raw || '').trim();
  if (!value || value.length < 8) return { ok: false, reason: 'missing_api_key' };
  return { ok: true, apiKey: value };
}

/**
 * @param {object} opts
 * @returns {Promise<{ ok: true } | { ok: false, reason: string, status?: number }>}
 */
export async function sendResendEmail({
  apiKey,
  from,
  to,
  subject,
  html,
  text,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const key = readApiKey(apiKey);
  if (!key.ok) return { ok: false, reason: key.reason };

  const parsedFrom = parseMailFrom(from);
  if (!parsedFrom.ok) return { ok: false, reason: parsedFrom.reason };

  const recipient = String(to || '').trim();
  if (!recipient) return { ok: false, reason: 'missing_recipient' };
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'provider_unavailable' };

  const controller = new AbortController();
  const timeoutMsSafe = Number(timeoutMs) || DEFAULT_TIMEOUT_MS;
  const work = Promise.resolve().then(() => fetchImpl(RESEND_ENDPOINT, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${key.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      from: parsedFrom.from,
      to: [recipient],
      subject: String(subject || ''),
      html: String(html || ''),
      text: String(text || ''),
    }),
  }));
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('timeout');
      err.name = 'AbortError';
      try { controller.abort(); } catch { /* ignore */ }
      reject(err);
    }, timeoutMsSafe);
  });
  try {
    const response = await Promise.race([work, timeout]);
    if (!response.ok) {
      return { ok: false, reason: 'provider_http', status: response.status };
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, reason: 'provider_malformed' };
    }
    if (!payload || typeof payload !== 'object' || payload.error) {
      return { ok: false, reason: 'provider_malformed' };
    }
    return { ok: true };
  } catch (error) {
    const aborted = error && (error.name === 'AbortError' || error.code === 'ABORT_ERR');
    return { ok: false, reason: aborted ? 'provider_timeout' : 'provider_network' };
  } finally {
    clearTimeout(timer);
  }
}

export { RESEND_ENDPOINT, DEFAULT_TIMEOUT_MS };
