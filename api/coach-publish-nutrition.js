/**
 * POST /api/coach-publish-nutrition
 * Coach session only. Publishes the saved dossier through Master Coach.
 * Does not accept a browser plan and does not use a service-role key.
 */
const { randomUUID } = require('node:crypto');

module.exports = async function handler(req, res) {
  const requestId = randomUUID();
  const started = Date.now();
  const log = (entry) => {
    console.log(JSON.stringify({ service: 'coach-publish-nutrition', requestId, ms: Date.now() - started, ...entry }));
  };

  try {
    const [
      { buildCorsHeaders },
      { parseJsonBody },
      { requireRequestAuth },
      { readAccessToken },
      { authorizeClientAccess },
      { handleCoachPublishNutritionRequest },
      { renderValidatedNutritionPdf },
    ] = await Promise.all([
      import('../src/coach/server/http/cors.mjs'),
      import('../src/coach/server/http/parse-json-body.mjs'),
      import('../src/coach/server/require-request-auth.mjs'),
      import('../src/coach/security/portal-auth.mjs'),
      import('../src/coach/server/pdf/authorize-client-access.mjs'),
      import('../src/coach/publication/coach-publish-nutrition-handler.mjs'),
      import('../src/coach/server/pdf/render-validated-request.mjs'),
    ]);

    const respond = (status, body) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Request-Id', requestId);
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };

    const cors = buildCorsHeaders(req, ['OPTIONS', 'POST']);
    Object.entries(cors).forEach(([key, value]) => res.setHeader(key, value));
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== 'POST') return respond(405, { ok: false, error: 'method_not_allowed' });

    const supabaseUrl = process.env.SUPABASE_URL || '';
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
    const accessToken = readAccessToken({
      cookieHeader: req.headers.cookie,
      authorization: req.headers.authorization,
    });
    if (!accessToken) return respond(401, { ok: false, error: 'unauthorized', writesDossier: false });
    const parsed = await parseJsonBody(req);
    if (!parsed.ok) return respond(parsed.status, { ok: false, error: parsed.error || 'bad_request' });

    const result = await handleCoachPublishNutritionRequest({
      body: parsed.body,
      accessToken,
      effectiveDate: new Date().toISOString().slice(0, 10),
      requireAuth: () => requireRequestAuth({
        accessToken,
        requestedOrganizationId: parsed.body?.organization_id || null,
        requestedOrganizationSlug: 'kr-kinetics',
        supabaseUrl,
        publishableKey,
      }),
      loadClient: async ({ accessToken: token, clientId, organizationId }) => {
        const access = await authorizeClientAccess({
          accessToken: token,
          organizationId,
          clientId,
          supabaseUrl,
          publishableKey,
        });
        if (!access.ok) return { ok: false };
        return {
          ok: true,
          client: {
            id: access.client.id,
            organizationId,
            fullName: access.client.full_name,
            serviceType: access.client.service_type || null,
          },
        };
      },
      loadDossier: async ({ accessToken: token, clientId, organizationId }) => {
        const response = await fetch(
          `${supabaseUrl.replace(/\/$/, '')}/rest/v1/client_dossiers?client_id=eq.${encodeURIComponent(clientId)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=payload,updated_at&limit=1`,
          {
            headers: {
              apikey: publishableKey,
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          },
        );
        if (!response.ok) return null;
        const rows = await response.json();
        const row = Array.isArray(rows) ? rows[0] : null;
        if (!row?.payload) return null;
        return { payload: row.payload, updatedAt: row.updated_at || null };
      },
      renderPdf: (pdfRequest, effectiveDate) => renderValidatedNutritionPdf(pdfRequest, effectiveDate),
      postPackage: async (pkg) => {
        const form = new FormData();
        form.set('plan', JSON.stringify(pkg.plan));
        form.set('planFingerprint', pkg.planFingerprint);
        form.set('title', pkg.title);
        form.set('effectiveDate', pkg.effectiveDate);
        form.set('publicationAttemptId', pkg.publicationAttemptId);
        form.set('file', new Blob([pkg.pdfBytes], { type: 'application/pdf' }), 'plan.pdf');
        const response = await fetch(pkg.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${pkg.accessToken}` },
          body: form,
        });
        const payload = await response.json().catch(() => null);
        return {
          ok: response.ok && payload?.ok === true,
          status: response.status,
          revisionNumber: payload?.revisionNumber ?? null,
          idempotent: payload?.idempotent === true,
          error: payload?.code || payload?.error || null,
        };
      },
    });
    log({ event: result.body?.ok ? 'published' : 'rejected', status: result.status });
    return respond(result.status, result.body);
  } catch (error) {
    log({ event: 'error', message: error instanceof Error ? error.message : 'error' });
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: 'publication_failed', requestId }));
  }
};
