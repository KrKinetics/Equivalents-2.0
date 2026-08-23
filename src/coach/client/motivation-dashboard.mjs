/**
 * Pure dashboard helpers for the Profil motivationnel module.
 * No HTTP, no scoring, no official analysis.
 */

export const MOTIVATION_RESEND_OPENED_CONFIRMATION = [
  'Ce nouveau lien remplacera le lien actuel du client.',
  'Sa progression liée à l’ancien lien ne pourra plus être poursuivie.',
  'Continuer ?',
].join('\n');

// Shown when the client already has a submitted assessment: the existing report
// is kept, and the next submission simply becomes the most recent evaluation.
export const MOTIVATION_RESEND_SUBMITTED_CONFIRMATION = [
  'Créer une nouvelle évaluation ?',
  'Un nouveau lien sera envoyé au client pour refaire son profil motivationnel.',
  'Le rapport actuel sera conservé. La prochaine soumission deviendra l’évaluation la plus récente.',
  'Continuer ?',
].join('\n');

/**
 * Latest invite per client — same rule as intake latestInviteByClient.
 * Callers must pass rows already ordered created_at DESC.
 * The first row for a client is the reference, including a newest revoked.
 * An older revoked never hides a newer active. A newest revoked never
 * resurrects an older pending/opened.
 * @param {Array<{ client_id?: string, status?: string, created_at?: string }>} invites
 */
export function latestMotivationInviteByClient(invites) {
  const latest = new Map();
  for (const invite of invites || []) {
    const clientId = invite?.client_id;
    if (!clientId) continue;
    if (!latest.has(clientId)) latest.set(clientId, invite);
  }
  return latest;
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
 *   confirmKind: 'none'|'replace'|'newEvaluation',
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
      confirmKind: 'none',
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
      confirmKind: 'none',
      showReport: false,
    };
  }
  if (invite.status === 'submitted') {
    return {
      key: 'submitted',
      label: 'Soumis',
      metaPrefix: 'Soumis',
      metaDate: invite.submitted_at || invite.updated_at || invite.created_at,
      action: 'resend',
      confirmReplace: false,
      confirmKind: 'newEvaluation',
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
      confirmKind: 'replace',
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
      confirmKind: 'none',
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
    confirmKind: 'none',
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

/**
 * Client ids that have at least one submitted motivation invite, derived from
 * the invites already loaded by loadClients() (no extra DB query, no new table).
 * Used so "Ouvrir le rapport" stays visible after a fresh link is sent to a
 * client who already submitted a previous assessment (latest invite pending,
 * but a submitted invite still exists in history).
 * @param {Array<{ client_id?: string, status?: string }>} invites
 * @returns {Set<string>}
 */
export function motivationClientsWithSubmittedHistory(invites) {
  const ids = new Set();
  for (const invite of invites || []) {
    if (invite?.client_id && invite.status === 'submitted') ids.add(invite.client_id);
  }
  return ids;
}
