/**
 * POST /api/coach-generate-intake-report-pdf
 * Authenticated KR pre-interview report PDF. Binary by design.
 * Loads submitted answers server-side after authorization.
 * Never accepts questionnaire answers from the browser.
 * Dedicated path — does not use the nutrition-plan HTML builder.
 */
const { randomUUID } = require('node:crypto');

module.exports = async function handler(req, res) {
  const requestId = randomUUID();
  const started = Date.now();
  /** @type {string} */
  let stage = 'bootstrap';

  const log = (entry) => {
    console.log(JSON.stringify({
      service: 'coach-generate-intake-report-pdf',
      requestId,
      ms: Date.now() - started,
      ...entry,
    }));
  };

  try {
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
      { validateIntakeReportPdfBody },
      { loadSubmittedIntakeReport },
      { buildIntakeReportViewModel },
      { buildIntakeReportDocumentHtml, getIntakeReportPdfOptions },
      { buildIntakeReportPdfFilename },
      { renderHtmlToPdfBuffer },
      { loadBrandLogoDataUri },
    ] = await Promise.all([
      import('../src/coach/server/http/cors.mjs'),
      import('../src/coach/server/http/rate-limit.mjs'),
      import('../src/coach/server/http/parse-json-body.mjs'),
      import('../src/coach/server/http/errors.mjs'),
      import('../src/coach/server/require-request-auth.mjs'),
      import('../src/coach/security/portal-auth.mjs'),
      import('../src/coach/server/http/redact.mjs'),
      import('../src/coach/intake-report/validate-intake-report-pdf-request.mjs'),
      import('../src/coach/intake-report/load-submitted-intake-report.mjs'),
      import('../src/coach/intake-report/intake-report-view-model.mjs'),
      import('../src/coach/intake-report/build-intake-report-html.mjs'),
      import('../src/coach/intake-report/filename.mjs'),
      import('../src/coach/server/pdf/render-pdf.mjs'),
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
    const identityKey = buildRateIdentityKey({ req });
    const limited = await checkDistributedRateLimit({
      routeName: 'generate-intake-report-pdf',
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
        route: 'generate-intake-report-pdf',
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
    const validated = validateIntakeReportPdfBody(parsed.body);
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

    stage = 'load_report';
    const accessToken = readAccessToken({
      cookieHeader: req.headers.cookie,
      authorization: req.headers.authorization,
    });
    const loaded = await loadSubmittedIntakeReport({
      accessToken,
      organizationId: auth.organizationId,
      clientId: validated.value.client_id,
      supabaseUrl,
      publishableKey,
    });
    if (!loaded.ok) {
      const status = loaded.error === 'not_found' ? 404 : 403;
      const code = loaded.error === 'not_found' ? 'not_found' : 'forbidden';
      log({ event: 'reject', stage: 'load_report', status });
      return respondJson(status, publicErrorBody(PUBLIC_ERROR[code]));
    }

    stage = 'logo';
    const logo = await loadBrandLogoDataUri('kr');
    if (!logo?.dataUri || !logo.bytes) {
      const err = new Error('logo_empty');
      err.code = 'logo_empty';
      err.stage = 'logo';
      throw err;
    }

    stage = 'html';
    const viewModel = buildIntakeReportViewModel({
      clientName: loaded.client.full_name,
      submittedAt: loaded.submittedAt,
      answers: loaded.answers,
    });
    const html = buildIntakeReportDocumentHtml({
      viewModel,
      mode: 'pdf',
      logoSrc: logo.dataUri,
    });

    stage = 'render';
    const pdf = await renderHtmlToPdfBuffer(html, {
      requestId,
      log,
      pdfOptions: getIntakeReportPdfOptions({
        footerText: viewModel.footer,
        logoSrc: logo.dataUri,
      }),
    });

    stage = 'response';
    const filename = buildIntakeReportPdfFilename({
      clientName: viewModel.clientName,
      submittedAtIso: viewModel.submittedDateIso,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('X-Request-Id', requestId);
    res.statusCode = 200;
    log({
      event: 'pdf_ok',
      stage: 'response',
      status: 200,
      bytes: Buffer.isBuffer(pdf) ? pdf.length : 0,
    });
    res.end(pdf);
  } catch (error) {
    const failStage = error?.stage || stage;
    log({
      event: 'pdf_fail',
      stage: failStage,
      status: 500,
      code: String(error?.code || error?.name || 'internal_error').slice(0, 80),
      message: String(error?.message || error).slice(0, 160),
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Request-Id', requestId);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'internal_error', requestId }));
  }
};
