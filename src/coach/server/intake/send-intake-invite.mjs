/**
 * Authenticated intake-invite + Resend delivery.
 * Invite RPC runs with the coach JWT. Provider failures never roll back the invite.
 */

import { PUBLIC_ERROR } from '../http/errors.mjs';
import { logCoachEvent } from '../http/redact.mjs';
import { classifyClientEmail } from './client-email.mjs';
import { loadAuthorizedClientForInvite } from './load-authorized-client.mjs';
import { resolveIntakeOrigin, buildIntakeInviteUrl } from './build-intake-origin.mjs';
import { createClientIntakeInvite } from './create-intake-invite.mjs';
import { resolveCoachMailMode, parseTestRecipients, maySendToRecipient } from '../mail/mail-mode.mjs';
import { sendResendEmail } from '../mail/resend-client.mjs';
import { buildIntakeInviteEmail } from '../mail/intake-invite-email.mjs';

function httpError(code) {
  const err = PUBLIC_ERROR[code] || PUBLIC_ERROR.bad_request;
  return { __httpError: true, status: err.status, error: err.error };
}

function createdPayload({ expiresAt, emailSent, delivery, recipientEmail = null, inviteUrl = null }) {
  /** @type {Record<string, unknown>} */
  const body = {
    invite_created: true,
    email_sent: emailSent,
    email_delivery: delivery,
    expires_at: expiresAt,
  };
  if (recipientEmail) body.recipient_email = recipientEmail;
  if (inviteUrl) body.invite_url = inviteUrl;
  return body;
}

/**
 * @param {object} ctx
 */
export async function sendIntakeInvite({
  accessToken,
  organizationId,
  clientId,
  req,
  requestId,
  fetchImpl = globalThis.fetch,
  env = process.env,
} = {}) {
  const supabaseUrl = env.SUPABASE_URL || '';
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY || '';

  const authorized = await loadAuthorizedClientForInvite({
    accessToken,
    organizationId,
    clientId,
    supabaseUrl,
    publishableKey,
    fetchImpl,
  });
  if (!authorized.ok) return httpError('forbidden');

  const origin = resolveIntakeOrigin({
    originHeader: req?.headers?.origin || '',
    vercelEnv: env.VERCEL_ENV,
    vercelUrl: env.VERCEL_URL,
    publicOrigin: env.COACH_PUBLIC_ORIGIN,
    vercelGitCommitRef: env.VERCEL_GIT_COMMIT_REF,
  });
  if (!origin.ok) {
    logCoachEvent({
      event: 'intake_invite_origin_unresolved',
      requestId,
      reason: origin.reason,
    });
    return httpError('unavailable');
  }

  const invite = await createClientIntakeInvite({
    accessToken,
    clientId,
    supabaseUrl,
    publishableKey,
    fetchImpl,
  });
  if (!invite.ok) return httpError(invite.error === 'forbidden' ? 'forbidden' : 'unavailable');

  const inviteUrl = buildIntakeInviteUrl(origin.origin, invite.token);
  const emailCheck = classifyClientEmail(authorized.client.email);

  if (!emailCheck.ok) {
    logCoachEvent({
      event: 'intake_invite_mail_skipped',
      requestId,
      email_delivery: emailCheck.reason === 'missing' ? 'skipped_missing_email' : 'skipped_invalid_email',
    });
    return createdPayload({
      expiresAt: invite.expiresAt,
      emailSent: false,
      delivery: emailCheck.reason === 'missing' ? 'skipped_missing_email' : 'skipped_invalid_email',
      inviteUrl,
    });
  }

  const mode = resolveCoachMailMode(env);
  const allowed = maySendToRecipient(emailCheck.email, {
    mode,
    testRecipients: parseTestRecipients(env.COACH_MAIL_TEST_RECIPIENTS),
  });
  if (!allowed.ok) {
    logCoachEvent({
      event: 'intake_invite_mail_blocked',
      requestId,
      reason: allowed.reason,
      email_delivery: 'failed',
    });
    return createdPayload({
      expiresAt: invite.expiresAt,
      emailSent: false,
      delivery: 'failed',
      recipientEmail: emailCheck.email,
      inviteUrl,
    });
  }

  const message = buildIntakeInviteEmail({
    fullName: authorized.client.full_name,
    inviteUrl,
  });
  const sent = await sendResendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.COACH_MAIL_FROM,
    to: emailCheck.email,
    subject: message.subject,
    html: message.html,
    text: message.text,
    fetchImpl,
  });
  if (!sent.ok) {
    logCoachEvent({
      event: 'intake_invite_mail_failed',
      requestId,
      reason: sent.reason,
      email_delivery: 'failed',
    });
    return createdPayload({
      expiresAt: invite.expiresAt,
      emailSent: false,
      delivery: 'failed',
      recipientEmail: emailCheck.email,
      inviteUrl,
    });
  }

  logCoachEvent({
    event: 'intake_invite_mail_sent',
    requestId,
    email_delivery: 'sent',
  });
  return createdPayload({
    expiresAt: invite.expiresAt,
    emailSent: true,
    delivery: 'sent',
    recipientEmail: emailCheck.email,
  });
}
