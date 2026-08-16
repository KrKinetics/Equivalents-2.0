/**
 * POST /api/coach-process-motivation-assessment
 * Coach-authenticated official analysis. Never accepts a browser analysis_snapshot.
 */
module.exports = async function handler(req, res) {
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
        const status = result.error === 'forbidden' ? 403
          : result.error === 'not_found' ? 404
            : result.error === 'hash_mismatch' || result.error === 'unknown_engine' ? 409
              : 503;
        return { __httpError: true, status, error: result.error };
      }
      return {
        analysis_version: result.analysisVersion,
        idempotent: result.idempotent,
        report: result.analysisSnapshot?.report || null,
        provenance: result.provenance,
      };
    },
  });

  return route(req, res);
};
