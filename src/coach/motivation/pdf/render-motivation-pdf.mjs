/**
 * Motivation PDF renderer. Auth/load/database stay outside this module.
 */

import { renderCoachReportPdfV41 } from '../lib/pdf/render-v41.mjs';
import { isCoachReportSnapshotV42 } from '../report/v42/assemble.mjs';
import { buildCoachReportFilename } from '../lib/pdf/filename.mjs';

/**
 * @param {object} reportSnapshot report-model-v4.2 snapshot
 * @param {{ format?: 'full' | 'summary', includeDirectAnswers?: boolean, generatedAt?: Date }} [options]
 */
/**
 * Adapts a stored v4.2 snapshot to the pdfkit view-model.
 * Fills coach-only runtime fields that persistence will supply later.
 */
export function toMotivationPdfViewModel(reportSnapshot, extras = {}) {
  if (!isCoachReportSnapshotV42(reportSnapshot)) {
    throw new Error('MOTIVATION_PDF_REQUIRES_REPORT_MODEL_V42');
  }
  return {
    ...reportSnapshot,
    metadata: {
      ...reportSnapshot.metadata,
      clientName: extras.clientName ?? reportSnapshot.metadata?.clientName ?? 'Client',
      completedAt: extras.completedAt ?? reportSnapshot.metadata?.completedAt ?? null,
      questionnaireVersion:
        extras.questionnaireVersion ??
        reportSnapshot.metadata?.questionnaireVersion ??
        reportSnapshot.questionnaireVersion,
      rulesetVersion:
        extras.rulesetVersion ??
        reportSnapshot.metadata?.rulesetVersion ??
        reportSnapshot.rulesetVersion,
      generatedAt: extras.generatedAt ?? new Date(),
    },
    coachValidations: extras.coachValidations ?? reportSnapshot.coachValidations ?? [],
    notes: extras.notes ?? reportSnapshot.notes ?? [],
    fourWeekFollowUp: extras.fourWeekFollowUp ?? reportSnapshot.fourWeekFollowUp ?? null,
    clientCoachId: extras.clientCoachId ?? reportSnapshot.clientCoachId ?? '',
  };
}

export async function renderMotivationPdf(reportSnapshot, options = {}) {
  const viewModel = toMotivationPdfViewModel(reportSnapshot, options);
  return renderCoachReportPdfV41({
    viewModel,
    format: options.format ?? 'full',
    includeDirectAnswers: options.includeDirectAnswers,
    generatedAt: options.generatedAt,
  });
}

export function motivationPdfFilename(input) {
  return buildCoachReportFilename({
    clientName: input.clientName,
    date: input.date,
    timezone: input.timezone,
    suffix: input.suffix ?? 'motivation',
  });
}
