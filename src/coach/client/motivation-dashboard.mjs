/**
 * Pure dashboard helpers for the Profil motivationnel module.
 * No HTTP, no scoring, no official analysis.
 */

export const MOTIVATION_RESEND_OPENED_CONFIRMATION = [
  'Ce nouveau lien remplacera le lien actuel du client.',
  'Sa progression liée à l’ancien lien ne pourra plus être poursuivie.',
  'Continuer ?',
].join('\n');

/**
 * Latest invite per client: newest created_at wins.
 * A revoked row never hides a newer or older active invite.
 * @param {Array<{ client_id?: string, status?: string, created_at?: string }>} invites
 */
export function latestMotivationInviteByClient(invites) {
  const latestActive = new Map();
  const latestAny = new Map();
  for (const invite of invites || []) {
    const clientId = invite?.client_id;
    if (!clientId) continue;
    if (!latestAny.has(clientId)) latestAny.set(clientId, invite);
    if (invite.status === 'revoked') continue;
    if (!latestActive.has(clientId)) latestActive.set(clientId, invite);
  }
  for (const [clientId, invite] of latestAny) {
    if (!latestActive.has(clientId)) latestActive.set(clientId, invite);
  }
  return latestActive;
}

function isExpired(invite, now) {
  return Boolean(
    invite?.expires_at
    && new Date(invite.expires_at) <= now
    && invite.status !== 'submitted',
  );
}

/**
 * @returns {{
 *   key: 'none'|'pending'|'opened'|'expired'|'submitted'|'revoked',
 *   label: string,
 *   metaPrefix: string|null,
 *   metaDate: string|null,
 *   action: 'send'|'resend'|'none',
 *   confirmReplace: boolean,
 *   showReport: boolean,
 * }}
 */
export function resolveMotivationInviteStatus(invite, now = new Date()) {
  if (!invite) {
    return {
      key: 'none',
      label: 'Aucun lien',
      metaPrefix: null,
      metaDate: null,
      action: 'send',
      confirmReplace: false,
      showReport: false,
    };
  }
  if (isExpired(invite, now)) {
    return {
      key: 'expired',
      label: 'Expiré',
      metaPrefix: 'Expiré',
      metaDate: invite.expires_at,
      action: 'send',
      confirmReplace: false,
      showReport: false,
    };
  }
  if (invite.status === 'submitted') {
    return {
      key: 'submitted',
      label: 'Soumis',
      metaPrefix: 'Soumis',
      metaDate: invite.submitted_at || invite.updated_at || invite.created_at,
      action: 'none',
      confirmReplace: false,
      showReport: true,
    };
  }
  if (invite.status === 'opened') {
    return {
      key: 'opened',
      label: 'En cours',
      metaPrefix: 'Ouvert',
      metaDate: invite.opened_at || invite.created_at,
      action: 'resend',
      confirmReplace: true,
      showReport: false,
    };
  }
  if (invite.status === 'revoked') {
    return {
      key: 'revoked',
      label: 'Remplacé',
      metaPrefix: null,
      metaDate: invite.updated_at || invite.created_at,
      action: 'send',
      confirmReplace: false,
      showReport: false,
    };
  }
  return {
    key: 'pending',
    label: 'Lien non ouvert',
    metaPrefix: 'Créé',
    metaDate: invite.created_at,
    action: 'resend',
    confirmReplace: false,
    showReport: false,
  };
}

export function looksLikeClientEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return Boolean(email) && email.length <= 160 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

export function motivationActionLabel(row, status) {
  if (status?.action === 'none') return '';
  if (looksLikeClientEmail(row?.email)) {
    return status?.action === 'resend' ? 'Renvoyer un nouveau lien' : 'Envoyer le lien';
  }
  return status?.action === 'resend' ? 'Nouveau lien' : 'Créer le lien';
}
