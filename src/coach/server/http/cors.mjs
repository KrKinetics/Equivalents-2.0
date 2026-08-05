/**
 * CORS helpers for Coach API routes — allowlisted origins only.
 */

import { allowedCorsOrigin } from '../../security/portal-auth.mjs';

/**
 * @param {import('http').IncomingMessage} req
 * @param {string[]} methods
 */
export function buildCorsHeaders(req, methods = ['POST', 'OPTIONS']) {
  const origin = allowedCorsOrigin(req?.headers?.origin || '');
  const headers = {
    'Cache-Control': 'private, no-store',
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    headers['Access-Control-Allow-Methods'] = methods.join(', ');
  }
  return headers;
}
