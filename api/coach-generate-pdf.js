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
    // Node version comes from package.json engines (22.x). @sparticuz/chromium@149
    // treats VERCEL + Node >= 20 as AL2023 — no manual AWS_LAMBDA_JS_RUNTIME required.
    log({
      event: 'pdf_start',
      stage: 'bootstrap',
      node: process.versions.node,
      arch: process.arch,
      region: process.env.VERCEL_REGION || null,
      vercelEnv: process.env.VERCEL_ENV || null,
    });

    stage = 'imports';
    const [
      { buildCorsHeaders },
      { checkDistributedRateLimit, buildRateIdentityKey },
      { parseJsonBody },
      { PUBLIC_ERROR, publicErrorBody },
      { requireRequestAuth, publicAuthResponseBody },
      { readAccessToken },
      { logCoachEvent },
      { validatePdfRequestBody },
      { authorizeClientAccess },
      { buildPlanSnapshot },
      { buildPdfDocumentHtml },
      { renderHtmlToPdfBuffer },
      { buildPdfFilename },
      { resolvePdfBrand },
      { loadBrandLogoDataUri },
      { assertPlanReadyForPdf },
    ] = await Promise.all([
      import('../src/coach/server/http/cors.mjs'),
      import('../src/coach/server/http/rate-limit.mjs'),
      import('../src/coach/server/http/parse-json-body.mjs'),
      import('../src/coach/server/http/errors.mjs'),
      import('../src/coach/server/require-request-auth.mjs'),
      import('../src/coach/security/portal-auth.mjs'),
      import('../src/coach/server/http/redact.mjs'),
      import('../src/coach/server/validation/pdf-request.mjs'),
      import('../src/coach/server/pdf/authorize-client-access.mjs'),
      import('../src/coach/server/pdf/build-plan-snapshot.mjs'),
      import('../src/coach/server/pdf/build-pdf-html.mjs'),
      import('../src/coach/server/pdf/render-pdf.mjs'),
      import('../src/coach/server/pdf/filename.mjs'),
      import('../src/coach/server/pdf/themes.mjs'),
      import('../src/coach/server/pdf/resolve-logo.mjs'),
      import('../src/coach/server/pdf/assert-plan-ready.mjs'),
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
    const identityKey = buildRateIdentityKey({ req });
    const limited = await checkDistributedRateLimit({
      routeName: 'generate-pdf',
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
      log({ event: 'reject', stage: 'rate_limit', status: limited.status });
      logCoachEvent({
        event: limited.status === 429 ? 'rate_limited' : 'rate_limit_backend_error',
        route: 'generate-pdf',
        requestId,
        stage: 'rate_limit',
        status: limited.status,
        backend: limited.backend,
        category: limited.category || 'unknown',
      });
      return respondJson(limited.status, { error: limited.error, requestId });
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
    // Explicit UI creator selection controls PDF theme; org controls data access only.
    const brandResolution = resolvePdfBrand({
      selectedBrand: validated.value.pdf_brand,
      organizationSlug: auth.organizationSlug,
    });
    if (!brandResolution.ok) {
      log({
        event: 'reject',
        stage: 'brand',
        status: brandResolution.status,
        code: brandResolution.error,
        selected: validated.value.pdf_brand || null,
        orgSlug: auth.organizationSlug || null,
      });
      if (brandResolution.status === 400) {
        return respondJson(PUBLIC_ERROR.bad_request.status, { error: 'bad_request' });
      }
      return respondJson(PUBLIC_ERROR.forbidden.status, { error: 'forbidden' });
    }
    const brandId = brandResolution.brandId;
    const theme = brandResolution.theme;

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

    stage = 'plan_ready';
    const readiness = assertPlanReadyForPdf(validated.value);
    if (!readiness.ok) {
      const code = readiness.error === 'inconsistent_plan' ? 'inconsistent_plan' : 'plan_not_ready';
      log({ event: 'reject', stage: 'plan_ready', status: readiness.status, code });
      return respondJson(PUBLIC_ERROR[code].status, { error: PUBLIC_ERROR[code].error });
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
    if (!logo?.dataUri || !logo.bytes) {
      const err = new Error('logo_empty');
      err.code = 'logo_empty';
      err.stage = 'logo';
      throw err;
    }
    const html = buildPdfDocumentHtml({
      locale: validated.value.locale,
      brandId,
      theme,
      athleteName: validated.value.athlete_name || clientAccess.client.full_name,
      dateStr,
      goalLabel: validated.value.goal_label,
      ratioLabel: validated.value.macro_ratio_label,
      notes: validated.value.coach_notes,
      trainingSnapshot,
      restSnapshot,
      logoDataUri: logo.dataUri,
    });
    // Guard against silent brand overwrite / contamination.
    if (brandId === 'elevate' && /KR Kinetics/i.test(html)) {
      const err = new Error('brand_contamination_kr');
      err.code = 'brand_contamination';
      err.stage = 'html';
      throw err;
    }
    if (brandId === 'kr' && /Elevate Fitness/i.test(html)) {
      const err = new Error('brand_contamination_elevate');
      err.code = 'brand_contamination';
      err.stage = 'html';
      throw err;
    }

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
    res.setHeader('X-Pdf-Brand', brandId);
    res.statusCode = 200;
    log({
      event: 'pdf_ok',
      stage: 'response',
      status: 200,
      brandId,
      orgBrandId: brandResolution.orgBrandId,
      selectedBrand: validated.value.pdf_brand || null,
      locale: validated.value.locale,
      bytes: pdf.length,
      pages: restSnapshot ? 2 : 1,
      logoBytes: logo.bytes,
    });
    res.end(pdf);
  } catch (error) {
    const failStage = String(error?.stage || stage || 'unknown').slice(0, 64);
    const code = String(error?.code || error?.message || 'unavailable').slice(0, 120);
    log({
      event: 'pdf_failed',
      stage: failStage,
      status: 503,
      code,
      message: String(error?.message || error).slice(0, 240),
      node: process.versions.node,
      region: process.env.VERCEL_REGION || null,
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Request-Id', requestId);
    res.statusCode = 503;
    res.end(JSON.stringify({
      error: 'unavailable',
      requestId,
      stage: failStage,
    }));
  }
};
