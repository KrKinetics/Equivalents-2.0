/**
 * Motivation PDF renderer. Auth/load/database stay outside this module.
 */

import { MOTIVATION_PDF_RENDERER_V44_ID as MOTIVATION_PDF_RENDERER_ID, renderCoachReportPdfV44Kr } from '../lib/pdf/render-v44-kr.mjs';
import { isCoachReportSnapshotV42 } from '../report/v42/assemble.mjs';
import { isCoachReportSnapshotV43 } from '../report/v43/assertions.mjs';
import { isCoachReportSnapshotV44 } from '../report/v44/assertions.mjs';
import { buildMotivationReportViewModel } from '../report/motivation-report-view-model.mjs';
import {
  ClientIdentityError,
  buildCanonicalClientIdentity,
  buildMotivationPdfFilename,
} from '../identity/canonical-client-identity.mjs';

export { MOTIVATION_PDF_RENDERER_ID };

export function toMotivationPdfViewModel(reportSnapshot, extras = {}) {
  if (
    !isCoachReportSnapshotV42(reportSnapshot)
    && !isCoachReportSnapshotV43(reportSnapshot)
    && !isCoachReportSnapshotV44(reportSnapshot)
  ) {
    throw new Error('MOTIVATION_PDF_REQUIRES_REPORT_MODEL_V42');
  }
  return {
    ...reportSnapshot,
    metadata: {
      ...reportSnapshot.metadata,
      clientName: extras.clientName ?? reportSnapshot.metadata?.clientName,
      clientId: extras.clientId ?? reportSnapshot.metadata?.clientId,
      completedAt: extras.completedAt ?? reportSnapshot.metadata?.completedAt ?? null,
      questionnaireVersion:
        extras.questionnaireVersion
        ?? reportSnapshot.metadata?.questionnaireVersion
        ?? reportSnapshot.questionnaireVersion,
      rulesetVersion:
        extras.rulesetVersion
        ?? reportSnapshot.metadata?.rulesetVersion
        ?? reportSnapshot.rulesetVersion,
      generatedAt: extras.generatedAt ?? new Date(),
    },
    coachValidations: extras.coachValidations ?? reportSnapshot.coachValidations ?? [],
    notes: extras.notes ?? reportSnapshot.notes ?? [],
    fourWeekFollowUp: extras.fourWeekFollowUp ?? reportSnapshot.fourWeekFollowUp ?? null,
    clientCoachId: extras.clientCoachId ?? reportSnapshot.clientCoachId ?? '',
  };
}

function resolveIdentity(reportSnapshot, extras = {}) {
  if (extras.identity?.fullName && extras.identity?.clientId) return extras.identity;
  const built = buildCanonicalClientIdentity({
    id: extras.clientId || reportSnapshot.metadata?.clientId,
    full_name: extras.clientName || reportSnapshot.metadata?.clientName,
    email: extras.email || extras.identity?.email,
    phone: extras.phone || extras.identity?.phone,
    service_type: extras.serviceType || extras.identity?.serviceType,
  });
  if (!built.ok) throw new ClientIdentityError(built.error);
  return built.identity;
}

export async function renderMotivationPdf(reportSnapshot, options = {}) {
  const snapshot = toMotivationPdfViewModel(reportSnapshot, options);
  const identity = resolveIdentity(snapshot, options);
  const display = buildMotivationReportViewModel({
    report: snapshot,
    identity,
    clientName: identity.fullName,
    clientId: identity.clientId,
    submittedAt: options.submittedAt ?? snapshot.metadata?.completedAt ?? null,
    analyzedAt: options.analyzedAt ?? snapshot.metadata?.analyzedAt ?? null,
    analysisVersion: options.analysisVersion ?? snapshot.metadata?.analysisVersion ?? null,
    planningLandmarks: options.planningLandmarks || null,
    context: options.context || null,
    provenance: {
      questionnaireVersion: snapshot.metadata?.questionnaireVersion,
      rulesetVersion: snapshot.metadata?.rulesetVersion,
      reportModelVersion: snapshot.schemaVersion || snapshot.metadata?.reportModelVersion,
      contentHash: options.contentHash ?? snapshot.metadata?.contentHash ?? '',
      submittedAt: options.submittedAt ?? snapshot.metadata?.completedAt ?? null,
      analyzedAt: options.analyzedAt ?? snapshot.metadata?.analyzedAt ?? null,
    },
  });
  display.identity = identity;
  return renderCoachReportPdfV44Kr({ display, generatedAt: options.generatedAt });
}

export function motivationPdfFilename(input) {
  if (input.identity) {
    return buildMotivationPdfFilename(input);
  }
  const built = buildCanonicalClientIdentity({
    id: input.clientId,
    full_name: input.clientName,
  });
  if (!built.ok) throw new ClientIdentityError(built.error);
  return buildMotivationPdfFilename({
    identity: built.identity,
    submittedAt: input.date || input.submittedAt,
    analysisVersion: input.analysisVersion,
    timezone: input.timezone,
  });
}
