/**
 * Motivation PDF renderer. Auth/load/database stay outside this module.
 * report-model-v4.2 uses the current KR renderer, not the historical v3.1 path.
 */

import { renderCoachReportPdfV42Kr, MOTIVATION_PDF_RENDERER_ID } from '../lib/pdf/render-v42-kr.mjs';
import { isCoachReportSnapshotV42 } from '../report/v42/assemble.mjs';
import { isCoachReportSnapshotV43 } from '../report/v43/assertions.mjs';
import { buildCoachReportFilename } from '../lib/pdf/filename.mjs';
import { buildMotivationReportViewModel } from '../report/motivation-report-view-model.mjs';

export { MOTIVATION_PDF_RENDERER_ID };

/**
 * @param {object} reportSnapshot report-model-v4.2 snapshot
 * @param {{ format?: 'full' | 'summary', includeDirectAnswers?: boolean, generatedAt?: Date }} [options]
 */
/**
 * Adapts a stored v4.2 snapshot to the pdfkit view-model.
 * Fills coach-only runtime fields that persistence will supply later.
 */
export function toMotivationPdfViewModel(reportSnapshot, extras = {}) {
  if (!isCoachReportSnapshotV42(reportSnapshot) && !isCoachReportSnapshotV43(reportSnapshot)) {
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
  const snapshot = toMotivationPdfViewModel(reportSnapshot, options);
  const display = buildMotivationReportViewModel({
    report: snapshot,
    clientName: snapshot.metadata?.clientName,
    submittedAt: options.submittedAt ?? snapshot.metadata?.completedAt ?? null,
    analyzedAt: options.analyzedAt ?? snapshot.metadata?.analyzedAt ?? null,
    analysisVersion: options.analysisVersion ?? snapshot.metadata?.analysisVersion ?? null,
    provenance: {
      questionnaireVersion: snapshot.metadata?.questionnaireVersion,
      rulesetVersion: snapshot.metadata?.rulesetVersion,
      reportModelVersion: snapshot.schemaVersion || snapshot.metadata?.reportModelVersion,
      contentHash: options.contentHash ?? snapshot.metadata?.contentHash ?? '',
      submittedAt: options.submittedAt ?? snapshot.metadata?.completedAt ?? null,
      analyzedAt: options.analyzedAt ?? snapshot.metadata?.analyzedAt ?? null,
    },
  });
  return renderCoachReportPdfV42Kr({
    display,
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
