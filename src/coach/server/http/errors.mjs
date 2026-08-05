/**
 * Uniform public API errors for Coach routes.
 * Never include stack traces, SQL, tokens, or internal reasons in client bodies.
 */

export const PUBLIC_ERROR = Object.freeze({
  unauthorized: Object.freeze({ status: 401, error: 'unauthorized' }),
  forbidden: Object.freeze({ status: 403, error: 'forbidden' }),
  bad_request: Object.freeze({ status: 400, error: 'bad_request' }),
  malformed_request: Object.freeze({ status: 400, error: 'malformed_request' }),
  not_found: Object.freeze({ status: 404, error: 'not_found' }),
  method_not_allowed: Object.freeze({ status: 405, error: 'method_not_allowed' }),
  conflict: Object.freeze({ status: 409, error: 'conflict' }),
  plan_not_ready: Object.freeze({ status: 409, error: 'plan_not_ready' }),
  unsupported_media_type: Object.freeze({ status: 415, error: 'unsupported_media_type' }),
  validation_failed: Object.freeze({ status: 422, error: 'validation_failed' }),
  inconsistent_plan: Object.freeze({ status: 422, error: 'inconsistent_plan' }),
  payload_too_large: Object.freeze({ status: 413, error: 'payload_too_large' }),
  rate_limited: Object.freeze({ status: 429, error: 'rate_limited' }),
  rate_limit_unavailable: Object.freeze({ status: 503, error: 'rate_limit_unavailable' }),
  rate_limit_misconfigured: Object.freeze({ status: 503, error: 'rate_limit_misconfigured' }),
  misconfigured: Object.freeze({ status: 500, error: 'misconfigured' }),
  internal_error: Object.freeze({ status: 500, error: 'internal_error' }),
  unavailable: Object.freeze({ status: 503, error: 'unavailable' }),
});

/**
 * @param {keyof typeof PUBLIC_ERROR | string} code
 * @returns {{ status: number, error: string }}
 */
export function publicError(code) {
  if (code && PUBLIC_ERROR[code]) return { ...PUBLIC_ERROR[code] };
  return { ...PUBLIC_ERROR.bad_request };
}

/**
 * Shape returned to HTTP clients.
 * @param {{ error?: string }} failure
 */
export function publicErrorBody(failure) {
  return { error: failure?.error || 'bad_request' };
}
