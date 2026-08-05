/**
 * Uniform public API errors for Coach nutrition routes.
 * Never include stack traces, SQL, tokens, or internal reasons in client bodies.
 */

export const PUBLIC_ERROR = Object.freeze({
  unauthorized: Object.freeze({ status: 401, error: 'unauthorized' }),
  forbidden: Object.freeze({ status: 403, error: 'forbidden' }),
  bad_request: Object.freeze({ status: 400, error: 'bad_request' }),
  not_found: Object.freeze({ status: 404, error: 'not_found' }),
  method_not_allowed: Object.freeze({ status: 405, error: 'method_not_allowed' }),
  payload_too_large: Object.freeze({ status: 413, error: 'payload_too_large' }),
  rate_limited: Object.freeze({ status: 429, error: 'rate_limited' }),
  misconfigured: Object.freeze({ status: 500, error: 'misconfigured' }),
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
