/**
 * Build one publication package from the last saved client_dossiers payload.
 * The structured plan and the PDF request come from that single projection.
 */
import { prepareCanonicalPublication } from './dossier-to-nutrition-plan.mjs';
import { nutritionPlanFingerprint } from './nutrition-plan-fingerprint.mjs';
import { validatePdfRequestBody } from '../server/validation/pdf-request.mjs';

export {
  UNSAVED_DOSSIER_MESSAGE,
  publicationClickDecision,
  nextPublicationAttempt,
} from './publication-attempt.mjs';

export function buildSavedDossierPublication({
  savedPayload,
  clientId,
  organizationSlug,
  athleteName,
  effectiveDate,
}) {
  const projected = prepareCanonicalPublication(savedPayload, { language: 'fr', brand: 'kr' });
  if (!projected.ok) return projected;
  const distribution = projected.plan.macroDistribution;
  const ratioLabel = distribution.mode === 'PRESET'
    ? distribution.ratio
    : `${distribution.carbsPercent}/${distribution.fatPercent}`;
  const pdfBody = {
    client_id: clientId,
    organization_slug: organizationSlug,
    locale: 'fr',
    athlete_name: athleteName,
    goal_label: 'Plan nutritionnel',
    macro_ratio_label: ratioLabel,
    coach_notes: projected.plan.coachNotes || '',
    goal_multiplier: projected.plan.goalMultiplier,
    include_rest: Boolean(projected.pdfRequestDays.rest),
    pdf_brand: 'kr',
    training: projected.pdfRequestDays.training,
    rest: projected.pdfRequestDays.rest,
  };
  const validated = validatePdfRequestBody(pdfBody);
  if (!validated.ok) {
    return { ok: false, code: 'INCOMPLETE_DOSSIER', writesDossier: false, releasesAthlete: false };
  }
  const trainingDay = projected.plan.days.find((day) => day.dayKind === 'TRAINING');
  if (!trainingDay || trainingDay.targets.calories !== validated.value.training.targets.kcal) {
    return { ok: false, code: 'INCOMPLETE_DOSSIER', writesDossier: false, releasesAthlete: false };
  }
  return {
    ok: true,
    writesDossier: false,
    releasesAthlete: false,
    plan: projected.plan,
    planFingerprint: nutritionPlanFingerprint(projected.plan),
    pdfRequest: validated.value,
    effectiveDate,
    title: 'Plan nutritionnel',
  };
}
