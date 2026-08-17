/**
 * Authenticated motivation-invite + Resend delivery.
 * Invite RPC runs with the coach JWT. Engine versions are pinned server-side.
 * Provider failures never roll back the invite.
 */

import { PUBLIC_ERROR } from '../http/errors.mjs';
import { logCoachEvent } from '../http/redact.mjs';
import { classifyClientEmail } from '../intake/client-email.mjs';
import { loadAuthorizedClientForInvite } from '../intake/load-authorized-client.mjs';
import { resolveIntakeOrigin } from './build-motivation-origin.mjs';
import {
  assertMotivationInviteUrl,
  buildMotivationInviteUrl,
  motivationInviteDiagnostics,
  resolvePreviewProtectionBypass,
} from './motivation-invite-link.mjs';
import { createClientMotivationInvite } from './create-motivation-invite.mjs';
import { resolveCoachMailMode, parseTestRecipients, maySendToRecipient } from '../mail/mail-mode.mjs';
import { sendResendEmail } from '../mail/resend-client.mjs';
import { buildMotivationInviteEmail } from '../mail/motivation-invite-email.mjs';

function httpError(code) {
  const err = PUBLIC_ERROR[code] || PUBLIC_ERROR.bad_request;
  return { __httpError: true, status: err.status, error: err.error };
}

function createdPayload({
  expiresAt,
  emailSent,
  delivery,
  recipientEmail = null,
  inviteUrl = null,
  diagnostics = null,
}) {
  /** @type {Record<string, unknown>} */
  const body = {
    invite_created: true,
    email_sent: emailSent,
    email_delivery: delivery,
    delivery,
    expires_at: expiresAt,
  };
  if (recipientEmail) body.recipient_email = recipientEmail;
  if (inviteUrl) body.invite_url = inviteUrl;
  if (diagnostics) {
    body.invite_url_has_token = diagnostics.invite_url_has_token;
    body.invite_url_path = diagnostics.invite_url_path;
    body.invite_token_fingerprint = diagnostics.invite_token_fingerprint;
  }
  return body;
}

function logInviteUrlRejected({ requestId, inviteId, origin, checked }) {
  logCoachEvent({
    event: 'motivation_invite_url_rejected',
    requestId,
    invite_id: inviteId || '',
    origin: origin || '',
    pathname: checked.pathname || '',
    has_token: checked.has_token === true,
    invite_token_length: checked.token_length || 0,
    invite_token_fingerprint: checked.fingerprint || '',
    reason: checked.reason || 'invalid_url',
  });
}

/**
 * @param {object} ctx
 */
export async function sendMotivationInvite({
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
  });
  if (!origin.ok) {
    logCoachEvent({
      event: 'motivation_invite_origin_unresolved',
      requestId,
      reason: origin.reason,
    });
    return httpError('unavailable');
  }

  const invite = await createClientMotivationInvite({
    accessToken,
    clientId,
    supabaseUrl,
    publishableKey,
    fetchImpl,
  });
  if (!invite.ok) return httpError(invite.error === 'forbidden' ? 'forbidden' : 'unavailable');

  const inviteUrl = buildMotivationInviteUrl(origin.origin, invite.token, {
    protectionBypass: resolvePreviewProtectionBypass(env, origin.origin),
  });
  const checked = assertMotivationInviteUrl(inviteUrl, invite.token);
  const diagnostics = motivationInviteDiagnostics(checked);
  if (!checked.ok) {
    logInviteUrlRejected({
      requestId,
      inviteId: invite.inviteId,
      origin: origin.origin,
      checked,
    });
    return createdPayload({
      expiresAt: invite.expiresAt,
      emailSent: false,
      delivery: 'failed',
      diagnostics,
    });
  }

  const emailCheck = classifyClientEmail(authorized.client.email);
  if (!emailCheck.ok) {
    logCoachEvent({
      event: 'motivation_invite_mail_skipped',
      requestId,
      email_delivery: emailCheck.reason === 'missing' ? 'skipped_missing_email' : 'skipped_invalid_email',
    });
    return createdPayload({
      expiresAt: invite.expiresAt,
      emailSent: false,
      delivery: emailCheck.reason === 'missing' ? 'skipped_missing_email' : 'skipped_invalid_email',
      inviteUrl,
      diagnostics,
    });
  }

  const mode = resolveCoachMailMode(env);
  const allowed = maySendToRecipient(emailCheck.email, {
    mode,
    testRecipients: parseTestRecipients(env.COACH_MAIL_TEST_RECIPIENTS),
  });
  if (!allowed.ok) {
    logCoachEvent({
      event: 'motivation_invite_mail_blocked',
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
      diagnostics,
    });
  }

  const message = buildMotivationInviteEmail({
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
      event: 'motivation_invite_mail_failed',
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
      diagnostics,
    });
  }

  logCoachEvent({
    event: 'motivation_invite_mail_sent',
    requestId,
    email_delivery: 'sent',
    origin: origin.origin,
    pathname: checked.pathname,
    has_token: true,
    invite_token_length: checked.token_length,
    invite_token_fingerprint: checked.fingerprint,
  });
  return createdPayload({
    expiresAt: invite.expiresAt,
    emailSent: true,
    delivery: 'sent',
    recipientEmail: emailCheck.email,
    inviteUrl,
    diagnostics,
  });
}
