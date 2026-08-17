import {
  analyzeCompleteMotivationProfileV43,
  V43_COHERENT,
} from '../../src/coach/motivation/fixtures/complete-profiles-v43.mjs';
import { buildCanonicalClientIdentity } from '../../src/coach/motivation/identity/canonical-client-identity.mjs';
import { buildMotivationReportViewModel } from '../../src/coach/motivation/report/motivation-report-view-model.mjs';
import { buildMotivationReportPresentation } from '../../src/coach/motivation/report/build-motivation-report-presentation.mjs';
import { buildMotivationReportMarkup } from '../../src/coach/motivation/report/build-motivation-report-html.mjs';
import { renderMotivationPdf } from '../../src/coach/motivation/pdf/render-motivation-pdf.mjs';
import { extractPdfPagesText } from '../../src/coach/motivation/lib/pdf/pdf-text.mjs';

export const PARITY_CLIENT = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  full_name: 'Client test KR',
  email: 'client.test@example.com',
  phone: '5145550100',
  service_type: 'complete',
};

export function buildParityBundle(profile = V43_COHERENT, extras = {}) {
  const client = extras.client || PARITY_CLIENT;
  const { result } = analyzeCompleteMotivationProfileV43(profile, {
    clientId: client.id,
    clientName: client.full_name,
    completedAt: extras.completedAt || new Date('2026-08-16T16:00:00.000Z'),
  });
  const identity = extras.identity || buildCanonicalClientIdentity(client).identity;
  const vm = buildMotivationReportViewModel({
    report: result.report,
    identity,
    analysisVersion: extras.analysisVersion ?? 1,
    submittedAt: extras.submittedAt || '2026-08-16T16:00:00.000Z',
    analyzedAt: extras.analyzedAt || '2026-08-16T16:08:00.000Z',
    provenance: result.provenance,
  });
  const presentation = buildMotivationReportPresentation(vm);
  return { result, identity, vm, presentation };
}

export async function renderParityBundle(bundle, extras = {}) {
  const html = buildMotivationReportMarkup(bundle.vm, { presentation: bundle.presentation });
  const rendered = await renderMotivationPdf(bundle.result.report, {
    identity: bundle.identity,
    analysisVersion: extras.analysisVersion ?? 1,
    submittedAt: extras.submittedAt || '2026-08-16T16:00:00.000Z',
    analyzedAt: extras.analyzedAt || '2026-08-16T16:08:00.000Z',
  });
  const pages = await extractPdfPagesText(rendered.buffer);
  const pdfText = pages.map((page) => page.text).join('\n');
  return { html, rendered, pages, pdfText };
}

export function countHtmlSection(html, id) {
  return html.includes(`data-section="${id}"`);
}

export function visibleHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
