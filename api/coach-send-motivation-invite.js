/**
 * POST /api/coach-send-motivation-invite
 * Authenticated Coach invite creation + server-side Resend delivery.
 * Node.js serverless — never Edge. Never uses the database service role.
 */
module.exports = async function handler(req, res) {
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
};
