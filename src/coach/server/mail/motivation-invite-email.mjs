/**
 * French KR Kinetics transactional copy for motivation profile invitations.
 * No scores, results, tokens in logs, or internal identifiers.
 */

export const MOTIVATION_INVITE_SUBJECT = 'Votre Profil motivationnel KR Kinetics';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {unknown} fullName
 * @returns {string}
 */
export function firstNameFromFullName(fullName) {
  const text = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.split(' ')[0].slice(0, 60);
}

/**
 * @param {{ fullName?: string, inviteUrl: string }} input
 */
export function buildMotivationInviteEmail({ fullName = '', inviteUrl } = {}) {
  const url = String(inviteUrl || '');
  const firstName = firstNameFromFullName(fullName);
  const greeting = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
  const safeGreeting = firstName ? `Bonjour ${escapeHtml(firstName)},` : 'Bonjour,';

  const text = [
    greeting,
    '',
    'Votre coach KR Kinetics vous invite à compléter votre Profil motivationnel.',
    'Ces réponses l’aideront à personnaliser votre accompagnement. Ce n’est pas un diagnostic médical ou psychologique.',
    '',
    `Compléter mon Profil motivationnel : ${url}`,
    '',
    'Ce lien est personnel et confidentiel. Il expirera dans 14 jours. Ne le transférez pas.',
    '',
    'KR Kinetics',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#071b41;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#071b41;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.04em;">
              KR Kinetics
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:16px;line-height:1.55;">
              <p style="margin:0 0 16px;">${safeGreeting}</p>
              <p style="margin:0 0 16px;">Votre coach KR Kinetics vous invite à compléter votre Profil motivationnel. Ces réponses l’aideront à personnaliser votre accompagnement. Ce n’est pas un diagnostic médical ou psychologique.</p>
              <p style="margin:28px 0;text-align:center;">
                <a href="${escapeHtml(url)}" style="background:#ed1136;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:4px;display:inline-block;font-weight:bold;">Compléter mon Profil motivationnel</a>
              </p>
              <p style="margin:0 0 16px;">Ce lien est personnel et confidentiel. Il expirera dans 14 jours. Ne le transférez pas.</p>
              <p style="margin:0;">KR Kinetics</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject: MOTIVATION_INVITE_SUBJECT,
    text,
    html,
  };
}
