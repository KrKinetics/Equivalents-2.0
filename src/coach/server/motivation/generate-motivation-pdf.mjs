/**
 * Official motivation PDF from the trusted server analysis path.
 * Never accepts a browser-supplied report, analysis, or answers snapshot.
 */

import { processSubmittedMotivationAssessment } from './process-submitted-motivation.mjs';
import {
  motivationPdfFilename,
  renderMotivationPdf,
} from '../../motivation/pdf/render-motivation-pdf.mjs';

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

  try {
    const rendered = await renderMotivationPdf(report, {
      clientName: processed.analysisSnapshot?.report?.metadata?.clientName,
      completedAt: processed.analysisSnapshot?.report?.metadata?.completedAt,
      questionnaireVersion: processed.provenance?.questionnaireVersion,
      rulesetVersion: processed.provenance?.rulesetVersion,
      analysisVersion: processed.analysisVersion,
      analyzedAt: processed.createdAt || processed.provenance?.analyzedAt || null,
      submittedAt: processed.submittedAt || null,
      contentHash: processed.provenance?.contentHash || '',
    });
    const pdf = Buffer.isBuffer(rendered) ? rendered : rendered?.buffer;
    if (!Buffer.isBuffer(pdf)) return { ok: false, error: 'unavailable' };
    return {
      ok: true,
      pdf,
      filename: motivationPdfFilename({
        clientName: processed.analysisSnapshot?.report?.metadata?.clientName || 'client',
        date: new Date(),
      }),
      analysisVersion: processed.analysisVersion,
      idempotent: processed.idempotent,
    };
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}
