/**
 * Coach report rendering for the signed Master Coach gateway.
 * Reuses the official intake and motivation engines. Does not accept answers,
 * scores, storage paths, or a second client identity from the caller.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOTIVATION_CSS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../coach-portal/assets/motivation-report.css',
);

function unavailable(status = 502) {
  return { ok: false, status };
}

export async function renderMasterCoachReport({ op, client, accessToken, env = process.env } = {}) {
  if (!client?.id || !client.organizationId || !accessToken) return unavailable(404);
  const supabaseUrl = env.SUPABASE_URL || '';
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!supabaseUrl || !publishableKey) return unavailable();
  try {
    if (op === 'intake.report' || op === 'intake.reportPdf') {
      return await renderIntake({ op, client, accessToken, supabaseUrl, publishableKey });
    }
    if (op === 'motivation.report' || op === 'motivation.reportPdf') {
      return await renderMotivation({ op, client, accessToken, supabaseUrl, publishableKey, env });
    }
    return unavailable(404);
  } catch {
    return unavailable();
  }
}

async function renderIntake({ op, client, accessToken, supabaseUrl, publishableKey }) {
  const [
    { loadSubmittedIntakeReport },
    { buildIntakeReportViewModel },
    { buildIntakeReportMarkup, buildIntakeReportDocumentHtml, getIntakeReportCss, getIntakeReportPdfOptions },
    { buildIntakeReportPdfFilename },
    { renderHtmlToPdfBuffer },
    { loadBrandLogoDataUri },
  ] = await Promise.all([
    import('../../intake-report/load-submitted-intake-report.mjs'),
    import('../../intake-report/intake-report-view-model.mjs'),
    import('../../intake-report/build-intake-report-html.mjs'),
    import('../../intake-report/filename.mjs'),
    import('../pdf/render-pdf.mjs'),
    import('../pdf/resolve-logo.mjs'),
  ]);
  const loaded = await loadSubmittedIntakeReport({
    accessToken,
    organizationId: client.organizationId,
    clientId: client.id,
    supabaseUrl,
    publishableKey,
  });
  if (!loaded.ok) return unavailable(loaded.error === 'not_found' ? 404 : 502);
  const logo = await loadBrandLogoDataUri('kr');
  const viewModel = buildIntakeReportViewModel({
    clientName: loaded.client.full_name,
    submittedAt: loaded.submittedAt,
    answers: loaded.answers,
  });
  if (op === 'intake.reportPdf') {
    const html = buildIntakeReportDocumentHtml({
      viewModel,
      mode: 'pdf',
      logoSrc: logo?.dataUri || '',
    });
    const pdf = await renderHtmlToPdfBuffer(html, {
      pdfOptions: getIntakeReportPdfOptions({
        footerText: viewModel.footer,
        logoSrc: logo?.dataUri || '',
      }),
    });
    return {
      ok: true,
      filename: buildIntakeReportPdfFilename({
        clientName: viewModel.clientName,
        submittedAtIso: viewModel.submittedDateIso,
      }),
      pdfBase64: Buffer.from(pdf).toString('base64'),
    };
  }
  return {
    ok: true,
    submittedAt: loaded.submittedAt,
    markup: buildIntakeReportMarkup(viewModel, { logoSrc: logo?.dataUri || '' }),
    css: getIntakeReportCss('screen'),
  };
}

async function renderMotivation({ op, client, accessToken, supabaseUrl, publishableKey, env }) {
  const [
    { processSubmittedMotivationAssessment },
    { buildMotivationReportViewModel },
    { buildMotivationReportMarkup },
    { generateOfficialMotivationPdf },
  ] = await Promise.all([
    import('../motivation/process-submitted-motivation.mjs'),
    import('../../motivation/report/motivation-report-view-model.mjs'),
    import('../../motivation/report/build-motivation-report-html.mjs'),
    import('../motivation/generate-motivation-pdf.mjs'),
  ]);
  const processed = await processSubmittedMotivationAssessment({
    accessToken,
    organizationId: client.organizationId,
    clientId: client.id,
    supabaseUrl,
    publishableKey,
    env,
  });
  if (!processed.ok) return unavailable(processed.error === 'not_found' || processed.error === 'not_submitted' ? 404 : 502);
  if (op === 'motivation.reportPdf') {
    const pdf = await generateOfficialMotivationPdf({
      accessToken,
      organizationId: client.organizationId,
      clientId: client.id,
      supabaseUrl,
      publishableKey,
      env,
    });
    if (!pdf.ok) return unavailable(pdf.error === 'not_found' ? 404 : 502);
    return { ok: true, filename: pdf.filename, pdfBase64: Buffer.from(pdf.pdf).toString('base64') };
  }
  const report = processed.analysisSnapshot?.report;
  if (!report) return unavailable(404);
  const viewModel = buildMotivationReportViewModel({
    report,
    identity: {
      clientId: client.id,
      fullName: client.fullName,
      email: client.email,
      phone: client.phone,
      serviceType: client.serviceType,
      shortId: String(client.id).replace(/-/g, '').slice(0, 8),
    },
    clientName: client.fullName,
    clientId: client.id,
    submittedAt: processed.submittedAt || null,
    analyzedAt: processed.provenance?.analyzedAt || processed.createdAt || null,
    analysisVersion: processed.analysisVersion,
    provenance: processed.provenance,
    planningLandmarks: processed.planningLandmarks || null,
  });
  return {
    ok: true,
    submittedAt: processed.submittedAt || null,
    markup: buildMotivationReportMarkup(viewModel),
    css: await fs.readFile(MOTIVATION_CSS, 'utf8'),
  };
}
