/**
 * Shared Vercel Node handler factory for Coach nutrition API routes.
 *
 * Gates (deny by default):
 * 1. CORS / method
 * 2. Rate limit
 * 3. Body size + strict JSON
 * 4. requireRequestAuth (session, JWT, user, membership, org, role)
 * 5. Payload validation
 * 6. Business handler
 * 7. Minimal JSON response + Cache-Control: private, no-store
 */

import {
  requireRequestAuth,
  publicAuthResponseBody,
} from '../require-request-auth.mjs';
import { buildCorsHeaders } from './cors.mjs';
import { parseJsonBody } from './parse-json-body.mjs';
import { checkRateLimit } from './rate-limit.mjs';
import { PUBLIC_ERROR, publicErrorBody } from './errors.mjs';

/**
 * @param {object} options
 * @param {string} options.routeName
 * @param {(body: object) => object} options.validate
 * @param {(ctx: { auth: object, input: object, req: import('http').IncomingMessage }) => Promise<object>|object} options.handle
 * @param {string[]} [options.methods]
 */
export function createCoachApiHandler({
  routeName,
  validate,
  handle,
  methods = ['POST'],
}) {
  const allowMethods = ['OPTIONS', ...methods];

  return async function handler(req, res) {
    const cors = buildCorsHeaders(req, allowMethods);
    Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (!methods.includes(req.method)) {
      res.statusCode = PUBLIC_ERROR.method_not_allowed.status;
      res.end(JSON.stringify(publicErrorBody(PUBLIC_ERROR.method_not_allowed)));
      return;
    }

    const clientKey = String(
      req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
    ).split(',')[0].trim();
    const limited = checkRateLimit(`${routeName}:${clientKey}`);
    if (!limited.ok) {
      res.setHeader('Retry-After', String(limited.retryAfterSec || 60));
      res.statusCode = limited.status;
      res.end(JSON.stringify({ error: limited.error }));
      return;
    }

    const parsed = await parseJsonBody(req);
    if (!parsed.ok) {
      res.statusCode = parsed.status;
      res.end(JSON.stringify(publicErrorBody(parsed)));
      return;
    }

    const validated = validate(parsed.body);
    if (!validated.ok) {
      res.statusCode = PUBLIC_ERROR.bad_request.status;
      res.end(JSON.stringify(publicErrorBody(PUBLIC_ERROR.bad_request)));
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL || '';
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';

    const auth = await requireRequestAuth({
      cookieHeader: req.headers.cookie,
      authorization: req.headers.authorization,
      requestedOrganizationId: validated.value.organization_id,
      requestedOrganizationSlug: validated.value.organization_slug,
      supabaseUrl,
      publishableKey,
    });

    if (!auth.ok) {
      res.statusCode = auth.status;
      res.end(JSON.stringify(publicAuthResponseBody(auth)));
      return;
    }

    try {
      const result = await handle({
        auth,
        input: validated.value,
        req,
      });
      if (result && result.__httpError) {
        res.statusCode = result.status || 400;
        res.end(JSON.stringify({ error: result.error || 'bad_request' }));
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify(result));
    } catch {
      // Never leak internal errors / stack / food bank contents.
      res.statusCode = PUBLIC_ERROR.unavailable.status;
      res.end(JSON.stringify(publicErrorBody(PUBLIC_ERROR.unavailable)));
    }
  };
}

/**
 * Helper for handlers to return a controlled public error.
 * @param {keyof typeof PUBLIC_ERROR} code
 */
export function httpError(code) {
  const err = PUBLIC_ERROR[code] || PUBLIC_ERROR.bad_request;
  return { __httpError: true, status: err.status, error: err.error };
}
