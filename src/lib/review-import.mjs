/**
 * Browser + Node safe review import gates (no Node crypto).
 */

/**
 * Validate review/export payload for duplicate IDs before UI init.
 * @returns {{ ok: boolean, duplicateIds: string[], message?: string }}
 */
export function validateReviewImport(payload) {
  if (!payload || !Array.isArray(payload.foods)) {
    return { ok: false, duplicateIds: [], message: 'JSON invalide: foods[] requis' };
  }
  const counts = new Map();
  for (const food of payload.foods) {
    const id = food?.id;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const duplicateIds = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([id]) => String(id));
  if (duplicateIds.length) {
    return {
      ok: false,
      duplicateIds,
      message: `Import refusé: identifiant(s) dupliqué(s): ${duplicateIds.join(', ')}`,
    };
  }
  return { ok: true, duplicateIds: [] };
}
