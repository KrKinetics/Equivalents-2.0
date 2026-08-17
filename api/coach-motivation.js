/**
 * Single Hobby-safe Coach motivation function.
 * Public URLs stay:
 *   POST /api/coach-send-motivation-invite
 *   POST /api/coach-process-motivation-assessment
 *   POST /api/coach-motivation-pdf
 * Vercel rewrites these onto this file so the project stays at 12 API function
 * files. Vercel Preview reports nodejs:13 because Edge middleware is a separate
 * runtime — same count as 2B (45220ae). Do not add another api/*.js file.
 * Never uses the database service role in this file.
 */

function resolveMotivationApiOp(req) {
  const url = String(req?.url || '');
  if (url.includes('send-motivation-invite') || /[?&]op=send-invite(?:&|$)/.test(url)) {
    return 'send-invite';
  }
  if (url.includes('process-motivation-assessment') || /[?&]op=process-assessment(?:&|$)/.test(url)) {
    return 'process-assessment';
  }
  if (url.includes('motivation-pdf') || /[?&]op=pdf(?:&|$)/.test(url)) {
    return 'pdf';
  }
  return null;
}

function motivationProcessHttpStatus(error) {
  if (error === 'forbidden') return 403;
  if (error === 'not_found') return 404;
  if (error === 'not_submitted' || error === 'hash_mismatch' || error === 'unknown_engine') return 409;
  return 503;
}

async function handleSendInvite(req, res) {
  const { createCoachApiHandler } = await import(
    '../src/coach/server/http/create-api-handler.mjs'
  );
  const { validateMotivationInviteBody } = await import(
    '../src/coach/server/motivation/validate-motivation-invite-request.mjs'
  );
  const { sendMotivationInvite } = await import(
    '../src/coach/server/motivation/send-motivation-invite.mjs'
  );
  const { readAccessToken } = await import(
    '../src/coach/security/portal-auth.mjs'
  );

  const route = createCoachApiHandler({
    routeName: 'send-motivation-invite',
    validate: validateMotivationInviteBody,
    async handle({ auth, input, req: request, requestId }) {
      const accessToken = readAccessToken({
        cookieHeader: request.headers.cookie,
        authorization: request.headers.authorization,
      });
      return sendMotivationInvite({
        accessToken,
        organizationId: auth.organizationId,
        clientId: input.client_id,
        req: request,
        requestId,
      });
    },
  });

  return route(req, res);
}

async function handleProcessAssessment(req, res) {
  const { createCoachApiHandler } = await import(
    '../src/coach/server/http/create-api-handler.mjs'
  );
  const { validateMotivationProcessBody } = await import(
    '../src/coach/server/motivation/validate-motivation-invite-request.mjs'
  );
  const { processSubmittedMotivationAssessment } = await import(
    '../src/coach/server/motivation/process-submitted-motivation.mjs'
  );
  const { readAccessToken } = await import(
    '../src/coach/security/portal-auth.mjs'
  );

  const route = createCoachApiHandler({
    routeName: 'process-motivation-assessment',
    validate: validateMotivationProcessBody,
    async handle({ auth, input, req: request }) {
      const accessToken = readAccessToken({
        cookieHeader: request.headers.cookie,
        authorization: request.headers.authorization,
      });
      const result = await processSubmittedMotivationAssessment({
        accessToken,
        organizationId: auth.organizationId,
        clientId: input.client_id,
        createdByUserId: auth.userId,
        supabaseUrl: process.env.SUPABASE_URL || '',
        publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
      });
      if (!result.ok) {
        return {
          __httpError: true,
          status: motivationProcessHttpStatus(result.error),
          error: result.error,
        };
      }
      return {
        analysis_version: result.analysisVersion,
        idempotent: result.idempotent,
        report: result.analysisSnapshot?.report || null,
        analyzed_at: result.createdAt || null,
        submitted_at: result.submittedAt || null,
        provenance: result.provenance,
        planning_landmarks: result.planningLandmarks || null,
      };
    },
  });

  return route(req, res);
}

async function handleMotivationPdf(req, res) {
  const { createCoachApiHandler } = await import(
    '../src/coach/server/http/create-api-handler.mjs'
  );
  const { validateMotivationInviteBody } = await import(
    '../src/coach/server/motivation/validate-motivation-invite-request.mjs'
  );
  const { generateOfficialMotivationPdf } = await import(
    '../src/coach/server/motivation/generate-motivation-pdf.mjs'
  );
  const { readAccessToken } = await import(
    '../src/coach/security/portal-auth.mjs'
  );

  const route = createCoachApiHandler({
    routeName: 'generate-motivation-pdf',
    validate: validateMotivationInviteBody,
    async handle({ auth, input, req: request }) {
      const accessToken = readAccessToken({
        cookieHeader: request.headers.cookie,
        authorization: request.headers.authorization,
      });
      const result = await generateOfficialMotivationPdf({
        accessToken,
        organizationId: auth.organizationId,
        clientId: input.client_id,
        createdByUserId: auth.userId,
        supabaseUrl: process.env.SUPABASE_URL || '',
        publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
      });
      if (!result.ok) {
        return {
          __httpError: true,
          status: motivationProcessHttpStatus(result.error),
          error: result.error,
        };
      }
      return {
        __pdf: true,
        pdf: result.pdf,
        filename: result.filename,
      };
    },
  });

  return route(req, res);
}

module.exports = async function handler(req, res) {
  const op = resolveMotivationApiOp(req);
  if (op === 'send-invite') return handleSendInvite(req, res);
  if (op === 'process-assessment') return handleProcessAssessment(req, res);
  if (op === 'pdf') return handleMotivationPdf(req, res);
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify({ error: 'not_found' }));
};

module.exports.resolveMotivationApiOp = resolveMotivationApiOp;
module.exports.motivationProcessHttpStatus = motivationProcessHttpStatus;
