/**
 * Browser-safe publication click rules.
 * Save and publish stay separate. A retry reuses the attempt id.
 */
export const UNSAVED_DOSSIER_MESSAGE = 'Des modifications ne sont pas sauvegardées. Sauvegardez le dossier avant de publier.';

export function publicationClickDecision({ isDirty, pending }) {
  if (pending) return { ok: false, code: 'PENDING', writesDossier: false, releasesAthlete: false };
  if (isDirty) {
    return {
      ok: false,
      code: 'UNSAVED_DOSSIER',
      message: UNSAVED_DOSSIER_MESSAGE,
      writesDossier: false,
      releasesAthlete: false,
    };
  }
  return { ok: true, writesDossier: false, releasesAthlete: false };
}

/**
 * Keep the same attempt id while a click is in flight or waiting to retry.
 * A later successful publication starts a new id.
 */
export function nextPublicationAttempt({ currentAttemptId, pending, lastSucceeded }) {
  if (pending && currentAttemptId) return { attemptId: currentAttemptId, generate: false, start: false };
  if (currentAttemptId && !lastSucceeded) return { attemptId: currentAttemptId, generate: false, start: true };
  return { attemptId: null, generate: true, start: true };
}
