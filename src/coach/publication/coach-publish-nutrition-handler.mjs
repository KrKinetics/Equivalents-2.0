/**
 * HTTP adapter for the saved-dossier publication boundary.
 * Authentication happens before the saved dossier is loaded.
 * A browser-supplied plan is rejected.
 */
import { publishSavedNutritionDossier } from './publish-saved-dossier.mjs';
import { UNSAVED_DOSSIER_MESSAGE } from './saved-dossier-publication.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN = ['plan', 'payload', 'banque', 'owner_user_id', 'clientId', 'revision_number', 'nutrition_plan_id'];

export async function handleCoachPublishNutritionRequest({
  body,
  accessToken,
  requireAuth,
  loadClient,
  loadDossier,
  renderPdf,
  postPackage,
  effectiveDate,
}) {
  const auth = await requireAuth();
  if (!auth?.ok) {
    return { status: auth?.status || 401, body: { ok: false, error: 'unauthorized', writesDossier: false } };
  }
  if (!body || typeof body !== 'object' || FORBIDDEN.some((key) => Object.hasOwn(body, key))) {
    return { status: 400, body: { ok: false, error: 'spoofed_payload', writesDossier: false } };
  }
  if (body.dirty === true) {
    return { status: 409, body: { ok: false, error: 'unsaved_dossier', message: UNSAVED_DOSSIER_MESSAGE, writesDossier: false } };
  }
  if (typeof body.client_id !== 'string' || !UUID_RE.test(body.client_id)) {
    return { status: 400, body: { ok: false, error: 'invalid_client', writesDossier: false } };
  }
  if (typeof body.publication_attempt_id !== 'string' || !UUID_RE.test(body.publication_attempt_id)) {
    return { status: 400, body: { ok: false, error: 'invalid_attempt', writesDossier: false } };
  }
  const client = await loadClient({ accessToken, clientId: body.client_id, organizationId: auth.organizationId });
  if (!client?.ok) {
    return { status: 403, body: { ok: false, error: 'forbidden', writesDossier: false } };
  }
  const savedDossier = await loadDossier({ accessToken, clientId: body.client_id, organizationId: auth.organizationId });
  const result = await publishSavedNutritionDossier({
    accessToken,
    coach: {
      userId: auth.userId,
      organizationId: auth.organizationId,
      organizationSlug: auth.organizationSlug,
    },
    client: client.client,
    savedDossier,
    publicationAttemptId: body.publication_attempt_id,
    effectiveDate,
    renderPdf,
    postPackage,
  });
  return {
    status: result.status,
    body: {
      ok: result.ok,
      error: result.error,
      revisionNumber: result.revisionNumber,
      idempotent: result.idempotent,
      writesDossier: false,
    },
  };
}
