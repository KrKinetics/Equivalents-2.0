/**
 * Versioned Coach dossier envelope (workspace Supabase persistence).
 * Payload shape matches getProfilData / export JSON — no nutrition engine changes.
 */

/** Envelope schema for client_dossiers.schema_version */
export const DOSSIER_SCHEMA_VERSION = 1;

/**
 * Supported envelope versions for load. Unknown → refuse.
 * @param {unknown} version
 */
export function isSupportedDossierSchemaVersion(version) {
  const n = Number(version);
  return Number.isInteger(n) && n === DOSSIER_SCHEMA_VERSION;
}

/**
 * Minimal structural validation before persist / after load.
 * Aligns with importerProfilJSON gate (sexe + banque|jours).
 * @param {unknown} payload
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateDossierPayload(payload) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, reason: 'Le payload du dossier doit être un objet JSON.' };
  }
  if (typeof payload.sexe !== 'string' || !payload.sexe.trim()) {
    return { ok: false, reason: 'Payload invalide : champ sexe requis.' };
  }
  const hasJours = payload.jours
    && typeof payload.jours === 'object'
    && (payload.jours.entrainement || payload.jours.repos);
  const hasLegacyBanque = payload.banque && typeof payload.banque === 'object';
  if (!hasJours && !hasLegacyBanque) {
    return { ok: false, reason: 'Payload invalide : jours ou banque requis.' };
  }
  return { ok: true };
}

/**
 * Normalize payload metadata for workspace SoT without inventing nutrition data.
 * @param {object} payload
 * @param {{ clientId: string, organizationSlug: string, fullName?: string }} meta
 */
export function attachWorkspaceMeta(payload, meta) {
  const next = { ...payload };
  if (meta.fullName && !String(next.nom || '').trim()) {
    next.nom = meta.fullName;
  }
  next.workspaceMeta = {
    ...(typeof next.workspaceMeta === 'object' && next.workspaceMeta ? next.workspaceMeta : {}),
    clientId: meta.clientId,
    organizationSlug: meta.organizationSlug,
    fictional: false,
  };
  if (next.version == null) next.version = 3;
  return next;
}
