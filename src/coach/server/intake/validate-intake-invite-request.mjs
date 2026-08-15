/**
 * Strict allowlist for POST /api/coach-send-intake-invite.
 * Identifiers only — never email, token, origin, from, or service type.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const ALLOWED = new Set(['client_id', 'organization_id', 'organization_slug']);

function fail(message = 'bad_request') {
  return { ok: false, error: 'bad_request', message };
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, value: {
 *   client_id: string,
 *   organization_id: string|null,
 *   organization_slug: string|null,
 * }} | { ok: false, error: string, message?: string }}
 */
export function validateIntakeInviteBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail('invalid_json_object');
  }
  for (const key of Object.keys(body)) {
    if (!ALLOWED.has(key)) return fail('unexpected_property');
  }

  const clientId = body.client_id;
  if (typeof clientId !== 'string' || !UUID_RE.test(clientId)) {
    return fail('invalid_client_id');
  }

  if (body.organization_id != null && body.organization_id !== '') {
    if (typeof body.organization_id !== 'string' || !UUID_RE.test(body.organization_id)) {
      return fail('invalid_organization_id');
    }
  }

  if (body.organization_slug != null && body.organization_slug !== '') {
    if (
      typeof body.organization_slug !== 'string'
      || body.organization_slug.length > 64
      || !SLUG_RE.test(body.organization_slug)
    ) {
      return fail('invalid_organization_slug');
    }
  }

  return {
    ok: true,
    value: {
      client_id: clientId,
      organization_id: body.organization_id || null,
      organization_slug: body.organization_slug || null,
    },
  };
}
