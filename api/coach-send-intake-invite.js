/**
 * POST /api/coach-send-intake-invite
 * Authenticated Coach invite creation + server-side Resend delivery.
 * Node.js serverless — never Edge. Never uses the database service role.
 */
module.exports = async function handler(req, res) {
  const { createCoachApiHandler } = await import(
    '../src/coach/server/http/create-api-handler.mjs'
  );
  const { validateIntakeInviteBody } = await import(
    '../src/coach/server/intake/validate-intake-invite-request.mjs'
  );
  const { sendIntakeInvite } = await import(
    '../src/coach/server/intake/send-intake-invite.mjs'
  );
  const { readAccessToken } = await import(
    '../src/coach/security/portal-auth.mjs'
  );

  const route = createCoachApiHandler({
    routeName: 'send-intake-invite',
    validate: validateIntakeInviteBody,
    async handle({ auth, input, req: request, requestId }) {
      const accessToken = readAccessToken({
        cookieHeader: request.headers.cookie,
        authorization: request.headers.authorization,
      });
      return sendIntakeInvite({
        accessToken,
        organizationId: auth.organizationId,
        clientId: input.client_id,
        req: request,
        requestId,
      });
    },
  });

  return route(req, res);
};
