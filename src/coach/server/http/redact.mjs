/**
 * Central log redaction for Coach server handlers.
 * Never log tokens, cookies, passwords, magic links, PII, bank dumps, or PDF HTML.
 */

const SENSITIVE_KEY = /^(authorization|cookie|password|access_token|refresh_token|token|apikey|api_key|service_role|coach_notes|notes|email|html|body|raw|invite_url|from|recipient_email|mail_from|text|answers|questionnaire|phone|full_name|payload)$/i;
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const INTAKE_URL_RE = /intake\.html\?token=[^\s"'<>]+/gi;
const MOTIVATION_URL_RE = /motivation\.html\?token=[^\s"'<>]+/gi;
const VERCEL_BYPASS_RE = /x-vercel-protection-bypass=[^&\s"'<>]+/gi;

/**
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
export function redactForLog(value, depth = 0) {
  if (depth > 4) return '[Truncated]';
  if (value == null) return value;
  if (typeof value === 'string') {
    return value
      .replace(JWT_RE, '[redacted-jwt]')
      .replace(BEARER_RE, 'Bearer [redacted]')
      .replace(INTAKE_URL_RE, 'intake.html?token=[redacted]')
      .replace(MOTIVATION_URL_RE, 'motivation.html?token=[redacted]')
      .replace(VERCEL_BYPASS_RE, 'x-vercel-protection-bypass=[redacted]')
      .replace(EMAIL_RE, '[redacted-email]')
      .replace(UUID_RE, '[redacted-id]')
      .slice(0, 500);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactForLog(item, depth + 1));
  }
  if (typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        out[key] = '[redacted]';
        continue;
      }
      out[key] = redactForLog(nested, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 120);
}

/**
 * Structured server log line (secret-free).
 * @param {Record<string, unknown>} entry
 */
export function logCoachEvent(entry) {
  const safe = redactForLog({
    service: 'coach',
    ts: new Date().toISOString(),
    ...entry,
  });
  console.log(JSON.stringify(safe));
}

/**
 * Pseudonymize a client IP for rate-limit keys (not reversible to raw IP in logs).
 * @param {string} ip
 */
export function hashRateIdentity(ip) {
  const raw = String(ip || 'unknown').trim().slice(0, 128);
  let h = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `ip_${(h >>> 0).toString(16)}`;
}
