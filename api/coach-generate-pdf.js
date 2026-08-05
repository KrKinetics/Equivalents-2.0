/**
 * POST /api/coach-generate-pdf
 * Authenticated server-side Coach PDF generation. Response is binary by design.
 * Node.js serverless only (Chromium) — never Edge.
 */
const { randomUUID } = require('node:crypto');

module.exports = async function handler(req, res) {
  const requestId = randomUUID();
  const started = Date.now();
  /** @type {string} */
  let stage = 'bootstrap';

  const log = (entry) => {
    // Structured, secret-free diagnostics for Vercel Runtime Logs.
    console.log(JSON.stringify({
      service: 'coach-generate-pdf',
      requestId,
      ms: Date.now() - started,
      ...entry,
    }));
  };

  try {
    if (process.env.VERCEL && !process.env.AWS_LAMBDA_JS_RUNTIME) {
      process.env.AWS_LAMBDA_JS_RUNTIME = 'nodejs22.x';
    }

    stage = 'imports';
    const [
      { buildCorsHeaders },
      { checkRateLimit },
      { parseJsonBody },
      { PUBLIC_ERROR, publicErrorBody },
      { requireRequestAuth, publicAuthResponseBody },
      { readAccessToken },
      { validatePdfRequestBody },
      { authorizeClientAccess },
      { buildPlanSnapshot },
      { buildPdfDocumentHtml },
      { renderHtmlToPdfBuffer },
      { buildPdfFilename },
      { brandIdFromOrganizationSlug },
      { loadBrandLogoDataUri },
    ] = await Promise.all([
      import('../src/coach/server/http/cors.mjs'),
      import('../src/coach/server/http/rate-limit.mjs'),
      import('../src/coach/server/http/parse-json-body.mjs'),
      import('../src/coach/server/http/errors.mjs'),
      import('../src/coach/server/require-request-auth.mjs'),
      import('../src/coach/security/portal-auth.mjs'),
      import('../src/coach/server/validation/pdf-request.mjs'),
      import('../src/coach/server/pdf/authorize-client-access.mjs'),
      import('../src/coach/server/pdf/build-plan-snapshot.mjs'),
      import('../src/coach/server/pdf/build-pdf-html.mjs'),
      import('../src/coach/server/pdf/render-pdf.mjs'),
      import('../src/coach/server/pdf/filename.mjs'),
      import('../src/coach/workspace/org-brand.mjs'),
      import('../src/coach/server/pdf/resolve-logo.mjs'),
    ]);

    const respondJson = (status, body) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('X-Request-Id', requestId);
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };

    stage = 'cors';
    const cors = buildCorsHeaders(req, ['OPTIONS', 'POST']);
    Object.entries(cors).forEach(([key, value]) => res.setHeader(key, value));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Request-Id', requestId);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== 'POST') {
      log({ event: 'reject', stage: 'method', status: 405 });
      return respondJson(PUBLIC_ERROR.method_not_allowed.status, publicErrorBody(PUBLIC_ERROR.method_not_allowed));
    }

    stage = 'rate_limit';
    const clientKey = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    const limited = checkRateLimit(`generate-pdf:${clientKey}`);
    if (!limited.ok) {
      res.setHeader('Retry-After', String(limited.retryAfterSec || 60));
      log({ event: 'reject', stage: 'rate_limit', status: limited.status });
      return respondJson(limited.status, { error: limited.error });
    }

    stage = 'parse_body';
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) {
      log({ event: 'reject', stage: 'parse_body', status: parsed.status, code: parsed.error });
      return respondJson(parsed.status, publicErrorBody(parsed));
    }

    stage = 'validate_payload';
    const validated = validatePdfRequestBody(parsed.body);
    if (!validated.ok) {
      log({ event: 'reject', stage: 'validate_payload', status: 400 });
      return respondJson(PUBLIC_ERROR.bad_request.status, publicErrorBody(PUBLIC_ERROR.bad_request));
    }

    stage = 'auth';
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
      log({ event: 'reject', stage: 'auth', status: auth.status });
      return respondJson(auth.status, publicAuthResponseBody(auth));
    }

    stage = 'brand';
    const brandId = brandIdFromOrganizationSlug(auth.organizationSlug);
    if (!brandId) {
      log({ event: 'reject', stage: 'brand', status: 403 });
      return respondJson(PUBLIC_ERROR.forbidden.status, { error: 'forbidden' });
    }

    stage = 'client_access';
    const accessToken = readAccessToken({
      cookieHeader: req.headers.cookie,
      authorization: req.headers.authorization,
    });
    const clientAccess = await authorizeClientAccess({
      accessToken,
      organizationId: auth.organizationId,
      clientId: validated.value.client_id,
      supabaseUrl,
      publishableKey,
    });
    if (!clientAccess.ok) {
      log({ event: 'reject', stage: 'client_access', status: 403 });
      return respondJson(PUBLIC_ERROR.forbidden.status, { error: 'forbidden' });
    }

    stage = 'snapshot';
    const trainingSnapshot = buildPlanSnapshot({
      day: validated.value.training,
      targets: validated.value.training.targets,
      locale: validated.value.locale,
      jourKey: 'entrainement',
    });
    const restSnapshot = validated.value.include_rest && validated.value.rest
      ? buildPlanSnapshot({
        day: validated.value.rest,
        targets: validated.value.rest.targets,
        locale: validated.value.locale,
        jourKey: 'repos',
      })
      : null;

    stage = 'logo';
    const logo = await loadBrandLogoDataUri(brandId);

    stage = 'html';
    const date = new Date();
    const dateIso = date.toISOString().slice(0, 10);
    const dateStr = validated.value.locale === 'fr'
      ? new Intl.DateTimeFormat('fr-CA').format(date)
      : dateIso;
    const html = buildPdfDocumentHtml({
      locale: validated.value.locale,
      brandId,
      athleteName: validated.value.athlete_name || clientAccess.client.full_name,
      dateStr,
      goalLabel: validated.value.goal_label,
      ratioLabel: validated.value.macro_ratio_label,
      notes: validated.value.coach_notes,
      trainingSnapshot,
      restSnapshot,
      logoDataUri: logo.dataUri,
    });

    stage = 'render';
    const pdf = await renderHtmlToPdfBuffer(html, { requestId, log });

    stage = 'response';
    const filename = buildPdfFilename({
      locale: validated.value.locale,
      brandSlug: brandId,
      athleteName: validated.value.athlete_name,
      dateIso,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('X-Request-Id', requestId);
    res.statusCode = 200;
    log({
      event: 'pdf_ok',
      stage: 'response',
      status: 200,
      brandId,
      locale: validated.value.locale,
      bytes: pdf.length,
      pages: restSnapshot ? 2 : 1,
      logoBytes: logo.bytes,
    });
    res.end(pdf);
  } catch (error) {
    const code = String(error?.code || error?.message || 'unavailable').slice(0, 120);
    log({
      event: 'pdf_failed',
      stage,
      status: 503,
      code,
      message: String(error?.message || error).slice(0, 240),
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Request-Id', requestId);
    res.statusCode = 503;
    res.end(JSON.stringify({ error: 'unavailable', requestId }));
  }
};
