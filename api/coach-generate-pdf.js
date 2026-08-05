/**
 * POST /api/coach-generate-pdf
 * Authenticated server-side Coach PDF generation. Response is binary by design.
 */
module.exports = async function handler(req, res) {
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
  ]);
  const respondJson = (status, body) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };
  const cors = buildCorsHeaders(req, ['OPTIONS', 'POST']);
  Object.entries(cors).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') return respondJson(PUBLIC_ERROR.method_not_allowed.status, publicErrorBody(PUBLIC_ERROR.method_not_allowed));
  const clientKey = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const limited = checkRateLimit(`generate-pdf:${clientKey}`);
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfterSec || 60));
    return respondJson(limited.status, { error: limited.error });
  }
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return respondJson(parsed.status, publicErrorBody(parsed));
  const validated = validatePdfRequestBody(parsed.body);
  if (!validated.ok) return respondJson(PUBLIC_ERROR.bad_request.status, publicErrorBody(PUBLIC_ERROR.bad_request));

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
  if (!auth.ok) return respondJson(auth.status, publicAuthResponseBody(auth));
  const brandId = brandIdFromOrganizationSlug(auth.organizationSlug);
  if (!brandId) return respondJson(PUBLIC_ERROR.forbidden.status, { error: 'forbidden' });

  try {
    const accessToken = readAccessToken({ cookieHeader: req.headers.cookie, authorization: req.headers.authorization });
    const clientAccess = await authorizeClientAccess({
      accessToken, organizationId: auth.organizationId, clientId: validated.value.client_id, supabaseUrl, publishableKey,
    });
    if (!clientAccess.ok) return respondJson(PUBLIC_ERROR.forbidden.status, { error: 'forbidden' });
    const trainingSnapshot = buildPlanSnapshot({
      day: validated.value.training, targets: validated.value.training.targets, locale: validated.value.locale, jourKey: 'entrainement',
    });
    const restSnapshot = validated.value.include_rest && validated.value.rest
      ? buildPlanSnapshot({ day: validated.value.rest, targets: validated.value.rest.targets, locale: validated.value.locale, jourKey: 'repos' })
      : null;
    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    const logoFile = brandId === 'elevate' ? 'logo-elevate-fitness.jpg' : 'logo-kr-kinetics-horizontal.png';
    const logoType = brandId === 'elevate' ? 'image/jpeg' : 'image/png';
    const logoBytes = await fs.readFile(path.join(process.cwd(), 'coach-calculator', 'assets', logoFile));
    const date = new Date();
    const dateIso = date.toISOString().slice(0, 10);
    const dateStr = validated.value.locale === 'fr'
      ? new Intl.DateTimeFormat('fr-CA').format(date)
      : dateIso;
    const html = buildPdfDocumentHtml({
      locale: validated.value.locale, brandId, athleteName: validated.value.athlete_name || clientAccess.client.full_name,
      dateStr, goalLabel: validated.value.goal_label, ratioLabel: validated.value.macro_ratio_label,
      notes: validated.value.coach_notes, trainingSnapshot, restSnapshot,
      logoDataUri: `data:${logoType};base64,${logoBytes.toString('base64')}`,
    });
    const pdf = await renderHtmlToPdfBuffer(html);
    const filename = buildPdfFilename({ locale: validated.value.locale, brandSlug: brandId, athleteName: validated.value.athlete_name, dateIso });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.statusCode = 200;
    res.end(pdf);
  } catch {
    return respondJson(PUBLIC_ERROR.unavailable.status, publicErrorBody(PUBLIC_ERROR.unavailable));
  }
};
