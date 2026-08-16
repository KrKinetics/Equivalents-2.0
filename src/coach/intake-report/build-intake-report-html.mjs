/**
 * Canonical pre-interview report HTML/content builder.
 * Screen and PDF share markup and visual language.
 * Layout differs by mode: screen is a natural-height paper column;
 * PDF paginates on A4 without clipping answers.
 */

import { getPdfTheme } from '../server/pdf/themes.mjs';

const KR_NAVY = '#071B41';
const KR_NAVY_SECONDARY = '#0B285B';
const KR_RED = '#ED1136';
const KR_SEPARATOR = '#d7e0ec';
const KR_MUTED = '#64748b';
const KR_TEXT = '#1e293b';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

/**
 * Shared document CSS. Mode only changes pagination/height — never labels or order.
 * @param {'screen'|'pdf'} mode
 */
export function getIntakeReportCss(mode = 'screen') {
  const theme = getPdfTheme('kr');
  const isPdf = mode === 'pdf';
  const pageRules = isPdf
    ? `@page{size:A4;margin:12mm 12mm 16mm}
html,body{margin:0;padding:0;background:#fff;height:auto;overflow:visible}
.intake-report{max-width:none;margin:0;box-shadow:none;border:0}
.intake-report-section{break-inside:auto;page-break-inside:auto}
.intake-report-row{break-inside:avoid;page-break-inside:avoid}
.intake-report-header{break-inside:avoid;page-break-inside:avoid}
.intake-report-answer{overflow:visible;max-height:none}
.intake-report-footer{display:none}`
    : `html,body{margin:0;padding:0;background:#e8eef7;height:auto;min-height:100%;overflow:visible}
.intake-report{max-width:820px;margin:0 auto 48px;box-shadow:0 18px 40px rgba(7,27,65,.10);border:1px solid ${KR_SEPARATOR}}`;

  return `*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
${pageRules}
.intake-report{background:#fff;color:${KR_TEXT};font-family:Arial,Helvetica,"Segoe UI",sans-serif;font-size:14px;line-height:1.45;overflow:visible;height:auto}
.intake-report-header{background:${theme.bannerGradient || KR_NAVY};color:#fff;padding:22px 28px 18px;display:flex;flex-direction:column;gap:14px}
.intake-report-logo-wrap{display:flex;align-items:center;min-height:48px}
.intake-report-logo-wrap img{width:auto;max-width:210px;height:auto;max-height:52px;object-fit:contain;display:block;filter:none;mix-blend-mode:screen}
.intake-report-kicker{margin:0;font-size:13px;letter-spacing:.14em;font-weight:700;text-transform:uppercase}
.intake-report-client{margin:4px 0 0;font-size:22px;font-weight:700;line-height:1.25;color:#fff}
.intake-report-submitted{margin:6px 0 0;font-size:13px;color:${theme.subtitleTone || '#cbd8eb'}}
.intake-report-rule{height:4px;background:${KR_RED};border:0;margin:0}
.intake-report-body{padding:22px 28px 8px;overflow:visible}
.intake-report-section{margin:0 0 22px;overflow:visible}
.intake-report-section-title{margin:0 0 10px;padding:0 0 6px;border-bottom:1px solid ${KR_SEPARATOR};color:${KR_NAVY};font-size:12px;letter-spacing:.12em;font-weight:700;break-after:avoid;page-break-after:avoid}
.intake-report-row{display:grid;grid-template-columns:minmax(140px,220px) 1fr;gap:8px 18px;padding:8px 0;border-bottom:1px solid ${KR_SEPARATOR};overflow:visible}
.intake-report-row:last-child{border-bottom:0}
.intake-report-label{margin:0;color:${KR_NAVY_SECONDARY};font-size:12px;font-weight:700;line-height:1.4}
.intake-report-answer{margin:0;color:${KR_TEXT};white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;overflow:visible;max-height:none}
.intake-report-footer{margin:8px 28px 0;padding:14px 0 18px;border-top:1px solid ${KR_SEPARATOR};text-align:center;color:${KR_MUTED};font-size:11px;letter-spacing:.06em;text-transform:uppercase}
@media (max-width:720px){
  .intake-report-row{grid-template-columns:1fr}
  .intake-report-header,.intake-report-body{padding-left:18px;padding-right:18px}
}`;
}

/**
 * Canonical report paper markup (no screen toolbar).
 * @param {object} viewModel
 * @param {{ logoSrc?: string }} [opts]
 */
export function buildIntakeReportMarkup(viewModel, { logoSrc = '' } = {}) {
  const vm = viewModel || {};
  const logo = logoSrc
    ? `<div class="intake-report-logo-wrap"><img src="${esc(logoSrc)}" alt="KR Kinetics"></div>`
    : '';
  const submitted = vm.submittedAtDisplay
    ? `<p class="intake-report-submitted">Soumis le ${esc(vm.submittedAtDisplay)}</p>`
    : '';
  const sections = (vm.sections || []).map((section) => {
    const rows = (section.rows || []).map((row) => `
      <div class="intake-report-row">
        <dt class="intake-report-label">${esc(row.label)}</dt>
        <dd class="intake-report-answer">${esc(row.display)}</dd>
      </div>
    `).join('');
    return `
      <section class="intake-report-section" data-section="${esc(section.id)}">
        <h2 class="intake-report-section-title">${esc(section.title)}</h2>
        <dl>${rows}</dl>
      </section>
    `;
  }).join('');

  return `
<article class="intake-report" data-report="pre-interview">
  <header class="intake-report-header">
    ${logo}
    <div>
      <p class="intake-report-kicker">${esc(vm.title || '')}</p>
      <h1 class="intake-report-client">${esc(vm.clientName || '')}</h1>
      ${submitted}
    </div>
  </header>
  <div class="intake-report-rule" aria-hidden="true"></div>
  <div class="intake-report-body">${sections}</div>
  <footer class="intake-report-footer">${esc(vm.footer || '')}</footer>
</article>`;
}

/**
 * Full HTML document for Chromium PDF (or a self-contained screen snapshot).
 * Never includes the screen-only action bar.
 * @param {{ viewModel: object, mode?: 'screen'|'pdf', logoSrc?: string }} args
 */
export function buildIntakeReportDocumentHtml({
  viewModel,
  mode = 'pdf',
  logoSrc = '',
} = {}) {
  const css = getIntakeReportCss(mode);
  const body = buildIntakeReportMarkup(viewModel, { logoSrc });
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(viewModel?.title || '')}</title><style>${css}</style></head><body>${body}</body></html>`;
}

/**
 * Chromium page.pdf options for the intake report (not the nutrition plan).
 * @param {string} footerText
 */
export function getIntakeReportPdfOptions(footerText) {
  const footer = esc(footerText || 'KR KINETICS — Pré-entrevue confidentielle');
  return {
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;text-align:center;font-size:8px;color:#5b6b80;font-family:Arial,Helvetica,sans-serif;padding:0 16mm;">${footer}</div>`,
    margin: { top: '0mm', right: '0mm', bottom: '12mm', left: '0mm' },
    timeout: 30_000,
  };
}
