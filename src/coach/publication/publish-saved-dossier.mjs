/**
 * Server publication boundary.
 * Loads the saved dossier, projects it once, renders the PDF from that
 * projection, and forwards the package with the coach bearer only.
 */
import { buildSavedDossierPublication } from './saved-dossier-publication.mjs';
import { clientHasNutritionAccess } from '../domain/client-service-entitlements.mjs';

export const MASTER_COACH_ORIGIN = 'https://maitre-coach.vercel.app';

export function masterCoachPackageUrl(origin, portalClientId) {
  return `${origin.replace(/\/$/, '')}/api/portal/clients/${portalClientId}/nutrition-publications/package`;
}

export async function publishSavedNutritionDossier({
  accessToken,
  coach,
  client,
  savedDossier,
  publicationAttemptId,
  effectiveDate,
  renderPdf,
  postPackage,
  origin = MASTER_COACH_ORIGIN,
}) {
  if (!accessToken || !coach?.userId) {
    return { ok: false, status: 401, error: 'unauthorized', writesDossier: false };
  }
  if (coach.organizationSlug !== 'kr-kinetics') {
    return { ok: false, status: 403, error: 'forbidden', writesDossier: false };
  }
  if (!client || client.organizationId !== coach.organizationId) {
    return { ok: false, status: 403, error: 'forbidden', writesDossier: false };
  }
  if (!clientHasNutritionAccess(client.serviceType)) {
    return { ok: false, status: 403, error: 'not_entitled', writesDossier: false };
  }
  if (!savedDossier?.payload) {
    return { ok: false, status: 404, error: 'dossier_missing', writesDossier: false };
  }
  const prepared = buildSavedDossierPublication({
    savedPayload: savedDossier.payload,
    clientId: client.id,
    organizationSlug: coach.organizationSlug,
    athleteName: client.fullName || 'Athlete',
    effectiveDate,
  });
  if (!prepared.ok) {
    return { ok: false, status: 400, error: prepared.code, writesDossier: false };
  }
  const pdf = await renderPdf(prepared.pdfRequest, prepared.effectiveDate);
  if (!pdf?.bytes || pdf.bytes[0] !== 0x25) {
    return { ok: false, status: 500, error: 'pdf_failed', writesDossier: false };
  }
  const response = await postPackage({
    url: masterCoachPackageUrl(origin, client.id),
    accessToken,
    plan: prepared.plan,
    planFingerprint: prepared.planFingerprint,
    title: prepared.title,
    effectiveDate: prepared.effectiveDate,
    publicationAttemptId,
    pdfBytes: pdf.bytes,
  });
  return {
    ok: response.ok === true,
    status: response.status,
    revisionNumber: response.revisionNumber ?? null,
    idempotent: response.idempotent === true,
    error: response.ok ? null : (response.error || 'publication_failed'),
    writesDossier: false,
    sentPlanFingerprint: prepared.planFingerprint,
  };
}
