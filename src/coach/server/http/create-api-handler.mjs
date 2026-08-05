/**
 * Shared Vercel Node handler factory for Coach nutrition API routes.
 *
 * Gates (deny by default):
 * 1. CORS / method
 * 2. Distributed/memory rate limit (per route profile)
 * 3. Content-Type + body size + strict JSON
 * 4. requireRequestAuth (session, JWT, user, membership, org, role)
 * 5. Payload validation
 * 6. Business handler
 * 7. Minimal JSON response + Cache-Control: private, no-store
 */

import { randomUUID } from 'node:crypto';
import {
  requireRequestAuth,
  publicAuthResponseBody,
} from '../require-request-auth.mjs';
import { readAccessToken } from '../../security/portal-auth.mjs';
import { buildCorsHeaders } from './cors.mjs';
import { parseJsonBody } from './parse-json-body.mjs';
import { buildRateIdentityKey, checkDistributedRateLimit } from './rate-limit.mjs';
import { PUBLIC_ERROR, publicErrorBody } from './errors.mjs';
import { logCoachEvent } from './redact.mjs';

/**
 * @param {object} options
 * @param {string} options.routeName
 * @param {(body: object) => object} options.validate
 * @param {(ctx: { auth: object, input: object, req: import('http').IncomingMessage, requestId: string }) => Promise<object>|object} options.handle
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
    const requestId = randomUUID();
    const started = Date.now();
    const cors = buildCorsHeaders(req, allowMethods);
    Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Request-Id', requestId);

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

    const identityKey = buildRateIdentityKey({ req });
    const limited = await checkDistributedRateLimit({
      routeName,
      identityKey,
      supabaseUrl: process.env.SUPABASE_URL || '',
      publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
      accessToken: readAccessToken({
        cookieHeader: req.headers.cookie,
        authorization: req.headers.authorization,
      }),
    });
    if (!limited.ok) {
      res.setHeader('Retry-After', String(limited.retryAfterSec || 60));
      res.statusCode = limited.status;
      logCoachEvent({
        event: 'rate_limited',
        route: routeName,
        requestId,
        status: 429,
        ms: Date.now() - started,
      });
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
      const code = validated.error === 'validation_failed'
        ? PUBLIC_ERROR.validation_failed
        : PUBLIC_ERROR.bad_request;
      res.statusCode = code.status;
      res.end(JSON.stringify(publicErrorBody(code)));
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
      logCoachEvent({
        event: 'auth_reject',
        route: routeName,
        requestId,
        status: auth.status,
        ms: Date.now() - started,
      });
      res.end(JSON.stringify(publicAuthResponseBody(auth)));
      return;
    }

    try {
      const result = await handle({
        auth,
        input: validated.value,
        req,
        requestId,
      });
      if (result && result.__httpError) {
        res.statusCode = result.status || 400;
        res.end(JSON.stringify({ error: result.error || 'bad_request' }));
        return;
      }
      res.statusCode = 200;
      logCoachEvent({
        event: 'ok',
        route: routeName,
        requestId,
        status: 200,
        ms: Date.now() - started,
      });
      res.end(JSON.stringify(result));
    } catch {
      logCoachEvent({
        event: 'handler_error',
        route: routeName,
        requestId,
        status: 503,
        ms: Date.now() - started,
      });
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
