/**
 * Print CSS for server PDF. Shared layout + per-brand theme variables.
 * Historical dual-brand language: full-bleed banner, accent rule, brand accents.
 */

/**
 * @param {import('./themes.mjs').PdfTheme} theme
 */
export function getPdfStylesCss(theme) {
  const t = theme || {};
  const banner = t.bannerGradient || t.banner || '#071B41';
  const accent = t.accent || '#ED1136';
  const accentSoft = t.accentSoft || accent;
  const primary = t.primary || '#071B41';
  const footerBg = t.footerBg || primary;
  const footerText = t.footerText || '#cbd8eb';
  const subtitleTone = t.subtitleTone || '#cbd8eb';
  const sectionText = t.sectionText || '#1e293b';
  const reconTitleBg = t.reconTitleBg || primary;
  const totalsBg = t.totalsBg || primary;
  const valAccent = t.valAccent || '#3b82f6';
  const piePro = t.piePro || '#6366f1';
  const pieGlu = t.pieGlu || '#b91c1c';
  const pieLip = t.pieLip || '#fde68a';
  const logoFilter = t.logoFilter || 'none';
  const logoBlend = t.logoBlend || 'normal';
  const logoObjectFit = t.logoObjectFit || 'contain';
  const logoMaxWidth = t.logoMaxWidth || '190px';
  const logoMaxHeight = t.logoMaxHeight || '48px';
  const notesBorder = t.notesBorder || '#fde68a';
  const notesBg = t.notesBg || '#fffbeb';

  return `*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;padding:0;background:#fff}
.pdf-a4-page{width:794px;height:1123px;padding:0 0 18px;font-family:Arial,Helvetica,sans-serif;color:#1e293b;font-size:12px;line-height:1.4;background:#fff;overflow:hidden;position:relative;page-break-after:always}
.pdf-a4-page:last-child{page-break-after:auto}
.pdf-page-pad{padding:0 28px}
.pdf-brand-header{min-height:72px;background:${banner};display:flex;align-items:center;gap:12px;padding:12px 28px;color:#fff;overflow:hidden}
.pdf-brand-header-logo{flex:0 0 auto;display:flex;align-items:center;max-width:${logoMaxWidth};background:transparent}
.pdf-brand-header-logo img{width:auto;max-width:${logoMaxWidth};height:auto;max-height:${logoMaxHeight};object-fit:${logoObjectFit};object-position:center;display:block;filter:${logoFilter};mix-blend-mode:${logoBlend}}
.pdf-brand-copy{flex:1 1 auto;min-width:0;text-align:right;padding-left:8px}
.pdf-brand-title{font-size:15px;font-weight:800;letter-spacing:.3px;line-height:1.2;color:#fff}
.pdf-brand-subtitle{font-size:9px;color:${subtitleTone};margin-top:4px;letter-spacing:.2px}
.pdf-brand-day{font-size:10px;color:#fff;margin-top:4px;font-weight:700}
.pdf-brand-rule{height:4px;background:${accent};margin:0 0 14px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.info-table,.pdf-recon table{width:100%;border-collapse:collapse;border:1px solid #e2e8f0;table-layout:fixed}
.info-table td,.pdf-recon td{padding:5px 8px;border:1px solid #e2e8f0;font-size:10px;color:#334155;vertical-align:middle;overflow-wrap:anywhere}
.info-label{background:#f1f5f9;font-weight:700;width:42%;font-size:9.5px;color:#475569}
.val-blue{color:${valAccent};font-weight:700}.val-cyan{color:#0ea5e9;font-weight:700}
.pdf-recon{margin:0;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden}
.pdf-recon-title{background:${reconTitleBg};color:#fff;font-size:10px;font-weight:700;padding:6px 10px}
.pdf-recon-note{font-size:9px;color:#64748b;padding:6px 8px;background:#f8fafc}
.var-ok{color:#0f766e;font-weight:700}.var-warn{color:#b45309;font-weight:700}
.pdf-section{font-size:11px;font-weight:700;color:${sectionText};border-left:4px solid ${accent};padding-left:8px;margin:0 0 8px}
.meals-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:start}
.meal-box{margin-bottom:7px;padding:6px 8px;background:#f8fafc;border-left:3px solid ${accent};border-radius:4px}
.meal-title{display:flex;align-items:center;font-weight:700;font-size:10.5px;color:#1e293b;margin-bottom:2px}
.meal-icon{display:block;flex:0 0 16px;width:16px;height:16px;margin-right:4px}
.meal-list{margin:0;padding-left:14px}.meal-list li{margin:1px 0;font-size:10px;color:#475569}
.pdf-page-body{padding-bottom:110px}
.pdf-coach-notes{margin:10px 0 8px;padding:10px 12px;background:${notesBg};border:1px solid ${notesBorder};border-left:4px solid ${accent};border-radius:6px}
.pdf-coach-notes-body{font-size:10px;color:#475569;line-height:1.55;white-space:pre-wrap}
.pdf-macro-chart{margin:8px 0 10px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:6px;background:#fafafa}
.pdf-macro-chart-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
.macro-ratio-table{border-collapse:collapse;font-size:9.5px}
.macro-ratio-table th,.macro-ratio-table td{border:1px solid #cbd5e1;padding:4px 8px;text-align:center}
.macro-ratio-table th{background:#f1f5f9;font-weight:700;color:#475569}
.pdf-pie-wrap{display:flex;align-items:center;gap:12px}
.pdf-pie-svg{width:120px;height:120px;flex-shrink:0}
.pdf-pie-legend{font-size:9.5px;color:#475569;line-height:1.6}
.dot{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:middle}
.dot-pro{background:${piePro}}.dot-glu{background:${pieGlu}}.dot-lip{background:${pieLip};border:1px solid #d4b86a}
.pdf-totals{position:absolute;left:28px;right:28px;bottom:54px;background:${totalsBg};color:#fff;border-radius:6px;padding:8px 12px;font-size:10px;font-weight:600;text-align:center}
.pdf-scope-note{position:absolute;left:28px;right:28px;bottom:29px;font-size:7.5px;line-height:1.25;color:#64748b;text-align:center;padding:0 18px;overflow-wrap:anywhere}
.pdf-footer{position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:9px;color:${footerText};background:${footerBg};padding:8px 28px;line-height:1.35}`;
}
