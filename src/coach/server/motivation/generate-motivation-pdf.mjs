/**
 * Official motivation PDF from the trusted server analysis path.
 * Never accepts a browser-supplied report, analysis, or answers snapshot.
 */

import { processSubmittedMotivationAssessment } from './process-submitted-motivation.mjs';
import {
  assertPdfClientIdentity,
  buildCanonicalClientIdentity,
  buildMotivationPdfFilename,
} from '../../motivation/identity/canonical-client-identity.mjs';
import { renderMotivationPdf } from '../../motivation/pdf/render-motivation-pdf.mjs';

/**
 * @returns {Promise<
 *   | { ok: true, pdf: Buffer, filename: string, analysisVersion: number, idempotent: boolean }
 *   | { ok: false, error: string }
 * >}
 */
export async function generateOfficialMotivationPdf({
  accessToken,
  organizationId,
  clientId,
  createdByUserId,
  supabaseUrl,
  publishableKey,
  serviceRoleKey = null,
  fetchImpl = globalThis.fetch,
  env = process.env,
} = {}) {
  const processed = await processSubmittedMotivationAssessment({
    accessToken,
    organizationId,
    clientId,
    createdByUserId,
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
    fetchImpl,
    env,
  });
  if (!processed.ok) return processed;

  const report = processed.analysisSnapshot?.report;
  if (!report) return { ok: false, error: 'unavailable' };

  const identityResult = buildCanonicalClientIdentity(processed.client);
  if (!identityResult.ok) return { ok: false, error: identityResult.error };

  const identityCheck = assertPdfClientIdentity({
    requestedClientId: clientId,
    analysisClientId:
      processed.analysisSnapshot?.client_id
      || processed.analysisSnapshot?.clientId
      || report.metadata?.clientId,
    reportClientId: report.metadata?.clientId || processed.client?.id,
    identity: identityResult.identity,
  });
  if (!identityCheck.ok) return { ok: false, error: identityCheck.error };

  try {
    const rendered = await renderMotivationPdf(report, {
      identity: identityResult.identity,
      clientId: identityResult.identity.clientId,
      clientName: identityResult.identity.fullName,
      completedAt: processed.analysisSnapshot?.report?.metadata?.completedAt,
      questionnaireVersion: processed.provenance?.questionnaireVersion,
      rulesetVersion: processed.provenance?.rulesetVersion,
      analysisVersion: processed.analysisVersion,
      analyzedAt: processed.createdAt || processed.provenance?.analyzedAt || null,
      submittedAt: processed.submittedAt || null,
      contentHash: processed.provenance?.contentHash || '',
      planningLandmarks: processed.planningLandmarks || null,
      context: processed.analysisSnapshot?.context || null,
    });
    const pdf = Buffer.isBuffer(rendered) ? rendered : rendered?.buffer;
    if (!Buffer.isBuffer(pdf)) return { ok: false, error: 'unavailable' };
    return {
      ok: true,
      pdf,
      filename: buildMotivationPdfFilename({
        identity: identityResult.identity,
        submittedAt: processed.submittedAt,
        analysisVersion: processed.analysisVersion,
      }),
      analysisVersion: processed.analysisVersion,
      idempotent: processed.idempotent,
    };
  } catch (error) {
    if (error?.code === 'client_identity_missing' || error?.code === 'client_identity_mismatch') {
      return { ok: false, error: error.code };
    }
    return { ok: false, error: 'unavailable' };
  }
}
