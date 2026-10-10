/**
 * POST /api/internal/master-coach-gateway
 * Server-to-server only. The browser never receives the integration secret.
 */
const { randomUUID } = require('node:crypto');

function log(category, fields) {
  console.error(JSON.stringify({ category, ...fields }));
}

module.exports = async function handler(req, res) {
  const requestId = randomUUID();
  const respond = (status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Request-Id', requestId);
    res.end(JSON.stringify(body));
  };

  if (req.method !== 'POST') return respond(405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
  if (req.headers.origin) return respond(401, { ok: false, code: 'LEGACY_GATEWAY_AUTH_FAILED' });

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');
  if (rawBody.length > 2_000_000) return respond(413, { ok: false, code: 'BAD_REQUEST' });

  try {
    const [
      { executeMasterCoachGateway, verifyGatewaySignature },
      { createMasterCoachGatewayStore, mintKrCoachAccessToken },
      { handleCoachPublishNutritionRequest },
      { renderValidatedNutritionPdf },
      { requireRequestAuth },
      { authorizeClientAccess },
    ] = await Promise.all([
      import('../../src/coach/server/internal/master-coach-gateway.mjs'),
      import('../../src/coach/server/internal/master-coach-gateway-store.mjs'),
      import('../../src/coach/publication/coach-publish-nutrition-handler.mjs'),
      import('../../src/coach/server/pdf/render-validated-request.mjs'),
      import('../../src/coach/server/require-request-auth.mjs'),
      import('../../src/coach/server/pdf/authorize-client-access.mjs'),
    ]);

    const secret = process.env.MASTER_COACH_GATEWAY_SECRET || '';
    const timestamp = req.headers['x-mc-timestamp'] || '';
    const signature = req.headers['x-mc-signature'] || '';
    if (!verifyGatewaySignature({ secret, timestamp, signature, payload: rawBody })) {
      log('LEGACY_GATEWAY_AUTH_FAILED', { requestId, status: 401 });
      return respond(401, { ok: false, code: 'LEGACY_GATEWAY_AUTH_FAILED' });
    }
    const minted = await mintKrCoachAccessToken();
    if (!minted?.token) {
      log('LEGACY_GATEWAY_AUTH_FAILED', { requestId, status: 503, stage: minted?.stage || 'config' });
      return respond(503, { ok: false, code: 'LEGACY_GATEWAY_FAILED', stage: minted?.stage || 'config' });
    }
    const accessToken = minted.token;
    const store = createMasterCoachGatewayStore({ accessToken });
    const result = await executeMasterCoachGateway({
      rawBody,
      timestamp,
      signature,
      secret,
      skipSignature: true,
      store,
      publishCanonical: (ctx) => publishThroughExistingCore(ctx, {
        mintKrCoachAccessToken,
        handleCoachPublishNutritionRequest,
        renderValidatedNutritionPdf,
        requireRequestAuth,
        authorizeClientAccess,
      }),
      sendIntake: (ctx) => sendExistingInvite(ctx, 'intake'),
      sendMotivation: (ctx) => sendExistingInvite(ctx, 'motivation'),
    });
    if (!result.body?.ok) {
      log(result.body?.code || 'LEGACY_GATEWAY_FAILED', { requestId, status: result.status });
    }
    return respond(result.status, result.body);
  } catch {
    log('LEGACY_GATEWAY_FAILED', { requestId, status: 500 });
    return respond(500, { ok: false, code: 'LEGACY_GATEWAY_FAILED', requestId });
  }
};

async function publishThroughExistingCore(ctx, deps) {
  const minted = await deps.mintKrCoachAccessToken();
  const accessToken = minted?.token;
  if (!accessToken) return { ok: false, status: 503 };
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  const published = await deps.handleCoachPublishNutritionRequest({
    body: {
      client_id: ctx.portalClientId,
      organization_id: ctx.client.organizationId,
      publication_attempt_id: ctx.publicationAttemptId,
      dirty: false,
    },
    accessToken,
    effectiveDate: new Date().toISOString().slice(0, 10),
    requireAuth: () => deps.requireRequestAuth({
      accessToken,
      requestedOrganizationId: ctx.client.organizationId,
      requestedOrganizationSlug: 'kr-kinetics',
      supabaseUrl,
      publishableKey,
    }),
    loadClient: async ({ accessToken: token, clientId, organizationId }) => {
      const access = await deps.authorizeClientAccess({
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
        { headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, Accept: 'application/json' } },
      );
      if (!response.ok) return null;
      const rows = await response.json();
      const row = Array.isArray(rows) ? rows[0] : null;
      return row?.payload ? { payload: row.payload, updatedAt: row.updated_at || null } : null;
    },
    renderPdf: (pdfRequest, effectiveDate) => deps.renderValidatedNutritionPdf(pdfRequest, effectiveDate),
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
  const reason = typeof published.body?.error === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(published.body.error)
    ? published.body.error
    : null;
  return {
    ok: published.body?.ok === true,
    status: published.status,
    revisionNumber: published.body?.revisionNumber ?? null,
    idempotent: published.body?.idempotent === true,
    reason,
  };
}

async function sendExistingInvite(ctx, kind) {
  try {
    const { mintKrCoachAccessToken } = await import('../../src/coach/server/internal/master-coach-gateway-store.mjs');
const minted = await mintKrCoachAccessToken();
  const accessToken = minted?.token;
  if (!accessToken) return { ok: false, status: 503 };
    const requestId = randomUUID();
    const args = {
      accessToken,
      organizationId: ctx.organizationId,
      clientId: ctx.portalClientId,
      req: { headers: {} },
      requestId,
    };
    const result = kind === 'intake'
      ? await (await import('../../src/coach/server/intake/send-intake-invite.mjs')).sendIntakeInvite(args)
      : await (await import('../../src/coach/server/motivation/send-motivation-invite.mjs')).sendMotivationInvite(args);
    if (!result || result.__httpError) return { ok: false, status: result?.status || 502 };
    return { ok: true, emailSent: result.email_sent === true, expiresAt: result.expires_at || null };
  } catch {
    return { ok: false, status: 502 };
  }
}
