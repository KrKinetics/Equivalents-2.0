/**
 * After a successful client_dossiers save, tell Master Coach the row exists.
 * The request carries no dossier content.
 */

import { nutritionDossierMirrorBody } from './dossier-presence.mjs';

export const MASTER_COACH_SYNC_URL = 'https://xglmqcqxksowjacjqhid.supabase.co/functions/v1/portal-client-sync';

export async function notifySavedNutritionDossier({
  fetchImpl = globalThis.fetch,
  accessToken,
  clientId,
  updatedAt,
}) {
  if (!accessToken) throw new Error('Session invalide pour la synchronisation Master Coach.');
  const response = await fetchImpl(MASTER_COACH_SYNC_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(nutritionDossierMirrorBody(clientId, updatedAt)),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    throw new Error('Indicateur Master Coach non mis à jour.');
  }
  return payload;
}
