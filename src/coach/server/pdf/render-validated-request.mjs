/**
 * Render one already-projected KR nutrition PDF request.
 * Uses the existing HTML document and Chromium renderer.
 */
import { validatePdfRequestBody } from '../validation/pdf-request.mjs';
import { assertPlanReadyForPdf } from './assert-plan-ready.mjs';
import { buildPlanSnapshot } from './build-plan-snapshot.mjs';
import { buildPdfDocumentHtml } from './build-pdf-html.mjs';
import { loadBrandLogoDataUri } from './resolve-logo.mjs';
import { renderHtmlToPdfBuffer } from './render-pdf.mjs';
import { resolvePdfBrand } from './themes.mjs';

export async function renderValidatedNutritionPdf(pdfRequest, effectiveDate) {
  const validated = validatePdfRequestBody(pdfRequest);
  if (!validated.ok || validated.value.pdf_brand !== 'kr') return { bytes: null };
  const readiness = assertPlanReadyForPdf(validated.value);
  if (!readiness.ok) return { bytes: null };
  const brandResolution = resolvePdfBrand({
    selectedBrand: 'kr',
    organizationSlug: validated.value.organization_slug,
  });
  if (!brandResolution.ok || brandResolution.brandId !== 'kr') return { bytes: null };

  const trainingSnapshot = buildPlanSnapshot({
    day: validated.value.training,
    targets: validated.value.training.targets,
    locale: validated.value.locale,
    jourKey: 'entrainement',
  });
  const restSnapshotCandidate = validated.value.include_rest && validated.value.rest
    ? buildPlanSnapshot({
      day: validated.value.rest,
      targets: validated.value.rest.targets,
      locale: validated.value.locale,
      jourKey: 'repos',
    })
    : null;
  const restSnapshot = restSnapshotCandidate?.meals?.length ? restSnapshotCandidate : null;
  const logo = await loadBrandLogoDataUri('kr');
  if (!logo?.dataUri) return { bytes: null };
  const dateIso = /^\d{4}-\d{2}-\d{2}$/.test(String(effectiveDate || ''))
    ? effectiveDate
    : new Date().toISOString().slice(0, 10);
  const dateStr = new Intl.DateTimeFormat('fr-CA', { timeZone: 'UTC' }).format(new Date(`${dateIso}T00:00:00Z`));
  const html = buildPdfDocumentHtml({
    locale: validated.value.locale,
    brandId: 'kr',
    theme: brandResolution.theme,
    athleteName: validated.value.athlete_name,
    dateStr,
    goalLabel: validated.value.goal_label,
    ratioLabel: validated.value.macro_ratio_label,
    notes: validated.value.coach_notes,
    trainingSnapshot,
    restSnapshot,
    logoDataUri: logo.dataUri,
  });
  if (/Elevate Fitness/i.test(html)) return { bytes: null };
  const pdf = await renderHtmlToPdfBuffer(html);
  return { bytes: pdf };
}
