/**
 * Dossier presence for the Master Coach mirror.
 * Reads client_id and updated_at only. Never copies a dossier payload.
 */

export function dossierPresenceByClient(rows) {
  const presence = new Map();
  for (const row of rows || []) {
    if (!row || typeof row.client_id !== 'string' || !row.client_id) continue;
    presence.set(row.client_id, row.updated_at ?? null);
  }
  return presence;
}

export function portalSyncClients(clients, presence) {
  return (clients || []).map((client) => {
    const hasDossier = presence.has(client.id);
    return {
      id: client.id,
      full_name: client.full_name,
      email: client.email || null,
      notes: client.notes || '',
      service_type: client.service_type,
      has_nutrition_dossier: hasDossier,
      nutrition_dossier_updated_at: hasDossier ? presence.get(client.id) ?? null : null,
    };
  });
}

export function nutritionDossierMirrorBody(clientId, updatedAt) {
  return {
    action: 'nutrition-dossier-status',
    client_id: clientId,
    has_nutrition_dossier: true,
    nutrition_dossier_updated_at: updatedAt,
  };
}

const MIRROR_FORBIDDEN_KEYS = ['payload', 'banque', 'repartition', 'coachNotes', 'notes', 'pdf'];

export function mirrorBodyCopiesNoDossier(body) {
  return MIRROR_FORBIDDEN_KEYS.every((key) => !Object.hasOwn(body, key));
}
