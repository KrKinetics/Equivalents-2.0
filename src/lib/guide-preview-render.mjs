import { formatCellValue } from './guide-presentation.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const css = (mobile) => `
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Arial,sans-serif;color:#172033;background:#f1f5f9}
  .banner{position:sticky;top:0;z-index:5;background:#991b1b;color:white;padding:9px;text-align:center;font-weight:800;letter-spacing:.04em}
  header,.toc,.section{background:white;margin:12px auto;padding:16px;max-width:${mobile ? '720px' : '1280px'}}
  header{display:flex;align-items:center;gap:20px}header img{width:120px;max-height:55px;object-fit:contain}
  .meta{font-size:12px;color:#475569}.toc a{display:inline-block;margin:4px;padding:7px 10px;color:white;border-radius:4px;text-decoration:none}
  .section{page-break-before:auto;break-before:auto}.section-header{border-left:8px solid var(--color);padding:8px 12px;break-after:avoid;page-break-after:avoid}
  h1,h2,p{margin:3px 0}.note{font-size:11px;color:#475569;margin:7px 0}
  table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:${mobile ? '10px' : '9px'}}
  th,td{padding:5px;border:1px solid #dbe3ee;text-align:right;overflow-wrap:anywhere}th{background:var(--color);color:#fff}
  th:first-child,td:first-child{text-align:left;width:${mobile ? '40%' : '34%'}}tr{break-inside:avoid;page-break-inside:avoid}
  tbody tr:nth-child(even){background:#f8fafc}.en{color:#475569;font-size:.88em}
  @media print{body{background:white}.banner{position:static}.section{margin:0 auto;padding:10px}.toc a{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  ${mobile ? '@page{size:420px 760px;margin:8mm} header{display:block}.wide-only{display:none}' : '@page{size:A4 landscape;margin:8mm}'}
`;

function header(model, bilingual) {
  return `<div class="banner">${esc(model.watermark)}</div>
  <header><img src="../../assets/kinetics-logo.svg" alt="Kinetics">
  <div><h1>${bilingual ? 'Équivalents alimentaires · Food Equivalents' : 'Équivalents alimentaires'}</h1>
  <div class="meta">${model.meta.verifiedFoods} verified · version ${esc(model.meta.version)} · ${esc(model.meta.shortHash)} · ${esc(model.meta.generatedAt)} · ${esc(model.meta.note)}</div></div></header>`;
}

function toc(model, bilingual) {
  return `<nav class="toc" id="index"><strong>${bilingual ? 'Sections · Sections' : 'Table des matières'}</strong><div>${model.sections.map((section) =>
    `<a style="background:${section.color}" href="#section-${esc(section.legacyKey)}">${esc(bilingual ? `${section.titleFr} · ${section.titleEn}` : section.titleFr)}</a>`).join('')}</div></nav>`;
}

function table(section, lang, bilingual) {
  const columns = section.columns;
  return `<table data-section="${esc(section.legacyKey)}"><thead><tr>${columns.map((column) =>
    `<th>${esc(bilingual ? `${column.labelFr} / ${column.labelEn}` : (lang === 'en' ? column.labelEn : column.labelFr))}</th>`).join('')}</tr></thead>
  <tbody>${section.foods.map((food) => `<tr data-food-id="${esc(food.id)}">${columns.map((column) => {
    if (column.key === 'aliment') {
      if (bilingual) {
        return `<td class="cell-aliment">${esc(food.portionFr)}<div class="en">${esc(food.portionEn)}</div></td>`;
      }
      return `<td class="cell-aliment">${esc(lang === 'en' ? food.portionEn : food.portionFr)}</td>`;
    }
    return `<td data-value-key="${column.key}" data-raw="${food.values[column.key] ?? ''}">${esc(formatCellValue(food.values[column.key], lang))}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
}

function documentHtml(model, { lang = 'fr', mobile = false, bilingual = false } = {}) {
  const sections = model.sections.map((section) => {
    const title = bilingual ? `${section.titleFr} · ${section.titleEn}` : lang === 'en' ? section.titleEn : section.titleFr;
    const subtitle = bilingual ? `${section.subtitleFr} · ${section.subtitleEn}` : lang === 'en' ? section.subtitleEn : section.subtitleFr;
    const note = section.note ? (bilingual ? `${section.note.fr} · ${section.note.en}` : section.note[lang]) : '';
    return `<section class="section" id="section-${esc(section.legacyKey)}" style="--color:${section.color}">
      <div class="section-header"><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>
      ${note ? `<p class="note">${esc(note)}</p>` : ''}${table(section, lang, bilingual)}
      <p><a href="#index">↑ Index</a></p></section>`;
  }).join('');
  return `<!doctype html><html lang="${bilingual ? 'fr' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(model.watermark)}</title><style>${css(mobile)}</style></head><body>${header(model, bilingual)}${toc(model, bilingual)}${sections}</body></html>`;
}

export const buildLandscapeHtml = (model, lang = 'fr') => documentHtml(model, { lang });
export const buildLandscapeFrHtml = (model) => documentHtml(model, { lang: 'fr' });
export const buildLandscapeEnHtml = (model) => documentHtml(model, { lang: 'en' });
export const buildMobileBilingualHtml = (model) => documentHtml(model, { lang: 'fr', mobile: true, bilingual: true });
