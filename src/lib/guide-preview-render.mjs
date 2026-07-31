import { formatCellValue } from './guide-presentation.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const TAG_CLASS = {
  prot: 'tag-prot', gluc: 'tag-gluc', fib: 'tag-fib', lip: 'tag-lip',
  sat: 'tag-lip', poly: 'tag-lip', mono: 'tag-lip', cal: 'tag-cal',
};

function landscapeCss() {
  return `
  *{box-sizing:border-box}html{scroll-behavior:smooth}
  body{margin:0;font-family:"Segoe UI",Tahoma,Geneva,Verdana,sans-serif;color:#334155;background:#f8fafc}
  .banner{position:sticky;top:0;z-index:5;background:#D91136;color:#fff;padding:8px 12px;text-align:center;font-weight:800;letter-spacing:.03em;font-size:11px;line-height:1.35}
  .banner .banner-en{display:block;font-weight:700;opacity:.92;margin-top:2px;font-size:10px}
  .toc,.section,.howto,.legend{background:#fff;margin:8px auto;padding:12px;max-width:1280px;border:1px solid #e2e8f0;border-radius:8px}
  header.brand-band{background:#1e293b;color:#fff;margin:8px auto;padding:14px 18px;max-width:1280px;border-radius:8px;display:flex;align-items:center;gap:20px}
  .brand-logo-wrap{background:transparent;padding:8px 10px;display:inline-flex;align-items:center;justify-content:center}
  header.brand-band img.brand-logo{width:220px;max-height:56px;object-fit:contain;display:block;background:transparent}
  header.brand-band h1{color:#fff;margin:0 0 4px;font-size:22px}
  .meta{font-size:12px;color:#cbd5e1;line-height:1.45}
  .toc a{display:inline-block;margin:4px;padding:7px 10px;color:#fff;border-radius:4px;text-decoration:none}
  .section{break-before:auto;page-break-before:auto;break-inside:auto;page-break-inside:auto}
  .section-header{border-left:8px solid var(--color);padding:6px 10px;margin-bottom:6px;break-after:avoid;page-break-after:avoid;color:#1e293b}
  h1,h2,p{margin:3px 0;color:#1e293b}.note{font-size:10px;color:#64748b;margin:4px 0 6px}
  table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5px}
  thead{display:table-header-group}
  th,td{padding:3px 4px;border:1px solid #e2e8f0;text-align:right;overflow-wrap:anywhere;hyphens:manual}
  th{background:var(--color);color:#fff;white-space:normal;line-height:1.2}
  th:first-child,td:first-child{text-align:left;width:34%}
  tr{break-inside:avoid;page-break-inside:avoid}
  tbody tr:nth-child(even){background:#f8fafc}
  .en{color:#64748b;font-size:.88em}
  .howto,.legend{border-left:6px solid #1e293b}
  .howto h2,.legend h2{margin:0 0 8px;font-size:16px;color:#1e293b}
  .howto ol{margin:0;padding-left:1.2rem;line-height:1.35}
  .legend dl{display:grid;grid-template-columns:120px 1fr;gap:6px 12px;margin:0;font-size:12px}
  .legend dt{font-weight:700}.legend dd{margin:0;color:#64748b}
  .back-index{margin:6px 0 0;font-size:11px}
  .running-footer{display:none}
  @page{size:A4 landscape;margin:10mm 8mm 10mm 8mm}
  @media print{
    body{background:#fff}.banner{position:static}
    header.brand-band,.toc,.howto,.legend{margin:0 auto 4mm;padding:8px 10px;border-radius:0;box-shadow:none}
    header.brand-band{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .section{margin:0 auto 3mm;padding:6px 8px;break-inside:auto;border-radius:0}
    thead{display:table-header-group}
    .toc a{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .running-footer{display:block;position:fixed;bottom:0;left:0;right:0;font-size:9px;color:#64748b;text-align:center}
  }
`;
}

function mobileCss() {
  return `
  *{box-sizing:border-box}html{scroll-behavior:smooth}
  body{margin:0;font-family:"Segoe UI",Tahoma,Geneva,Verdana,sans-serif;color:#334155;background:#f8fafc}
  .banner{position:sticky;top:0;z-index:5;background:#D91136;color:#fff;padding:8px 12px;text-align:center;font-weight:800;letter-spacing:.03em;font-size:11px;line-height:1.35}
  .banner .banner-en{display:block;font-weight:700;opacity:.92;margin-top:2px;font-size:10px}
  .toc,.section,.howto,.legend{background:#fff;margin:8px auto;padding:12px;max-width:720px;border:1px solid #e2e8f0;border-radius:8px}
  header.brand-band{background:#1e293b;color:#fff;margin:8px auto;padding:14px 16px;max-width:720px;border-radius:8px;display:flex;flex-direction:column;align-items:flex-start;gap:10px}
  .brand-logo-wrap{background:transparent;padding:8px 10px;display:inline-flex;align-items:center;justify-content:center}
  header.brand-band img.brand-logo{width:200px;max-height:52px;object-fit:contain;display:block;background:transparent}
  header.brand-band h1{color:#fff;margin:0 0 4px;font-size:18px}
  .meta{font-size:12px;color:#cbd5e1;line-height:1.45}
  .toc a{display:inline-block;margin:4px;padding:7px 10px;color:#fff;border-radius:4px;text-decoration:none;font-size:12px}
  .section{break-before:auto;page-break-before:auto}
  .section-lead{break-inside:avoid;page-break-inside:avoid;break-after:avoid;page-break-after:avoid;margin-bottom:5px}
  .section-header{border-left:8px solid var(--color);padding:8px 12px;break-after:avoid;page-break-after:avoid;color:#1e293b}
  h1,h2,p{margin:3px 0;color:#1e293b}.note{font-size:11px;color:#64748b;margin:6px 0 8px}
  .item-list{border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#fff}
  .item{padding:8px 10px;border-bottom:1px solid #e2e8f0;break-inside:avoid;page-break-inside:avoid;background:#fff}
  .item:nth-child(even){background:#f8fafc}
  .item:last-child{border-bottom:none}
  .item-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:5px}
  .item-name{font-size:11px;font-weight:700;line-height:1.35;color:#1e293b;flex:1}
  .item-name .en{display:block;font-weight:600;color:#64748b;font-size:10px;margin-top:2px}
  .item-kcal{flex-shrink:0;font-size:13px;font-weight:700;color:var(--color);font-variant-numeric:tabular-nums;line-height:1.2}
  .item-kcal small{font-size:9px;font-weight:600;opacity:.75;margin-left:1px}
  .item-tags{display:flex;flex-wrap:wrap;gap:5px}
  .tag{font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;font-variant-numeric:tabular-nums;white-space:nowrap}
  .tag-prot{background:#eff6ff;color:#1d4ed8}
  .tag-gluc{background:#fffbeb;color:#b45309}
  .tag-fib{background:#f0fdf4;color:#15803d}
  .tag-lip{background:#fdf2f8;color:#9d174d}
  .tag-cal{background:#f1f5f9;color:#334155}
  .tag-neutral{background:#f1f5f9;color:#475569}
  .howto,.legend{border-left:6px solid #1e293b}
  .howto h2,.legend h2{margin:0 0 8px;font-size:15px;color:#1e293b}
  .howto ol{margin:0;padding-left:1.2rem;line-height:1.4;font-size:12px}
  .legend dl{display:grid;grid-template-columns:100px 1fr;gap:6px 10px;margin:0;font-size:11px}
  .legend dt{font-weight:700}.legend dd{margin:0;color:#64748b}
  .back-index{margin:6px 0 0;font-size:11px}
  @page{size:A4 portrait;margin:10mm 10mm 12mm 10mm}
  @media print{
    body{background:#fff}.banner{position:static}
    header.brand-band,.toc,.howto,.legend{margin:0 auto 4mm;padding:8px;border-radius:0}
    header.brand-band{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .section{margin:0 auto 4mm;padding:6px 0;border-radius:0}
    .toc a,.section-header{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  }
`;
}

function bannerHtml(model) {
  const fr = model.watermarkFr || model.watermark || 'APERÇU — PROFILS D’ÉCHANGE NON APPROUVÉS';
  const en = model.watermarkEn || 'PREVIEW — UNAPPROVED EXCHANGE PROFILES';
  return `<div class="banner">${esc(fr)}<span class="banner-en">${esc(en)}</span></div>`;
}

function headerHtml(model, { bilingual = false, lang = 'fr' } = {}) {
  if (!model.logoSrc) throw new Error('guide preview render requires model.logoSrc');
  const title = bilingual
    ? 'Équivalents alimentaires · Food Equivalents'
    : (lang === 'en' ? 'Food Equivalents' : 'Équivalents alimentaires');
  const meta = bilingual
    ? `${esc(model.meta.foodsLabelFr)} · ${esc(model.meta.foodsLabelEn)}<br>${esc(model.meta.updatedLabelFr)} · ${esc(model.meta.updatedLabelEn)} · ${esc(model.meta.noteFr)} · ${esc(model.meta.noteEn)} · v${esc(model.meta.version)} · ${esc(model.meta.shortHash)}`
    : (lang === 'en'
      ? `${esc(model.meta.foodsLabelEn)} · ${esc(model.meta.updatedLabelEn)} · ${esc(model.meta.noteEn)} · v${esc(model.meta.version)} · ${esc(model.meta.shortHash)}`
      : `${esc(model.meta.foodsLabelFr)} · ${esc(model.meta.updatedLabelFr)} · ${esc(model.meta.noteFr)} · v${esc(model.meta.version)} · ${esc(model.meta.shortHash)}`);
  return `${bannerHtml(model)}
  <header class="brand-band">
    <div class="brand-logo-wrap">
      <img class="brand-logo" src="${esc(model.logoSrc)}" alt="KR Kinetics">
    </div>
    <div><h1>${esc(title)}</h1><div class="meta">${meta}</div></div>
  </header>`;
}

function howtoHtml(bilingual) {
  if (bilingual) {
    return `<section class="howto" id="howto">
      <h2>Comment utiliser ce guide · How to use this guide</h2>
      <ol>
        <li>Choisissez une catégorie dans l’index. / Pick a category from the index.</li>
        <li>Chaque ligne est une portion d’échange individuelle vérifiée. / Each row is one verified exchange portion.</li>
        <li>Comparez protéines, glucides, fibres, lipides et calories. / Compare protein, carbs, fiber, fat and calories.</li>
        <li>Ce document est un aperçu : profils d’échange non approuvés. / Preview only: exchange profiles are unapproved.</li>
      </ol>
    </section>`;
  }
  return `<section class="howto" id="howto">
    <h2>Comment utiliser ce guide</h2>
    <ol>
      <li>Choisissez une catégorie dans la table des matières.</li>
      <li>Chaque ligne représente une portion d’échange individuelle vérifiée.</li>
      <li>Les colonnes indiquent protéines, glucides, fibres, lipides et calories de la portion.</li>
      <li>Document d’aperçu seulement : aucune moyenne de production n’y est approuvée.</li>
    </ol>
  </section>`;
}

function legendHtml(bilingual) {
  if (bilingual) {
    return `<section class="legend" id="legend">
      <h2>Légende · Legend</h2>
      <dl>
        <dt>P / Prot</dt><dd>Protéines (g) · Protein (g)</dd>
        <dt>G / Gluc</dt><dd>Glucides (g) · Carbohydrate (g)</dd>
        <dt>Fib</dt><dd>Fibres (g) · Fiber (g)</dd>
        <dt>L / Lip</dt><dd>Lipides (g) · Fat (g)</dd>
        <dt>kcal / Cal</dt><dd>Calories déclarées de la portion · Declared portion calories</dd>
        <dt>—</dt><dd>Valeur absente (jamais convertie en 0) · Missing value (never coerced to 0)</dd>
      </dl>
    </section>`;
  }
  return `<section class="legend" id="legend">
    <h2>Légende</h2>
    <dl>
      <dt>Protéines</dt><dd>Grammes de protéines par portion d’échange</dd>
      <dt>Glucides</dt><dd>Grammes de glucides par portion d’échange</dd>
      <dt>Fibres</dt><dd>Grammes de fibres par portion d’échange</dd>
      <dt>Lipides</dt><dd>Grammes de lipides par portion d’échange</dd>
      <dt>Calories</dt><dd>Calories déclarées de la portion</dd>
      <dt>—</dt><dd>Valeur absente (jamais convertie en zéro)</dd>
    </dl>
  </section>`;
}

function toc(model, bilingual) {
  return `<nav class="toc" id="index"><strong>${bilingual ? 'Sections · Sections' : 'Table des matières'}</strong><div>${model.sections.map((section) =>
    `<a style="background:${section.color}" href="#section-${esc(section.legacyKey)}">${esc(bilingual ? `${section.titleFr} · ${section.titleEn}` : section.titleFr)}</a>`).join('')}</div></nav>`;
}

function landscapeRow(section, food, lang) {
  return `<tr data-food-id="${esc(food.id)}">${section.columns.map((column) => {
    if (column.key === 'aliment') {
      return `<td class="cell-aliment">${esc(lang === 'en' ? food.portionEn : food.portionFr)}</td>`;
    }
    return `<td data-value-key="${column.key}" data-raw="${food.values[column.key] ?? ''}">${esc(formatCellValue(food.values[column.key], lang))}</td>`;
  }).join('')}</tr>`;
}

function landscapeTableHead(section, lang) {
  return `<thead><tr>${section.columns.map((column) =>
    `<th>${esc(lang === 'en' ? column.labelEn : column.labelFr)}</th>`).join('')}</tr></thead>`;
}

function landscapeTable(section, lang, { skipFirst = 0 } = {}) {
  const foods = section.foods.slice(skipFirst);
  return `<table data-section="${esc(section.legacyKey)}">${landscapeTableHead(section, lang)}
  <tbody>${foods.map((food) => landscapeRow(section, food, lang)).join('')}</tbody></table>`;
}

function renderMobileItem(section, food) {
  const metricKeys = section.columns.map((c) => c.key).filter((k) => k !== 'aliment' && k !== 'cal');
  const labelFor = (key) => {
    const col = section.columns.find((c) => c.key === key);
    return col ? col.labelFr.replace(/\s*\(.*\)$/, '') : key;
  };
  const tags = metricKeys.map((key) => {
    const cls = TAG_CLASS[key] || 'tag-neutral';
    const val = formatCellValue(food.values[key], 'fr');
    return `<span class="tag ${cls}" data-value-key="${key}" data-raw="${food.values[key] ?? ''}">${esc(labelFor(key))} ${esc(val)} g</span>`;
  }).join('');
  const calRaw = food.values.cal ?? '';
  return `<article class="item" data-food-id="${esc(food.id)}">
    <div class="item-top">
      <span class="item-name">${esc(food.portionFr || food.nameFr || '')}<span class="en">${esc(food.portionEn || food.nameEn || '')}</span></span>
      <span class="item-kcal" data-value-key="cal" data-raw="${calRaw}">${esc(formatCellValue(food.values.cal, 'fr'))}<small>kcal</small></span>
    </div>
    <div class="item-tags">${tags}</div>
  </article>`;
}

function buildSections(model, { lang, mobile, bilingual }) {
  return model.sections.map((section) => {
    const title = bilingual ? `${section.titleFr} · ${section.titleEn}` : lang === 'en' ? section.titleEn : section.titleFr;
    const subtitle = bilingual ? `${section.subtitleFr} · ${section.subtitleEn}` : lang === 'en' ? section.subtitleEn : section.subtitleFr;
    const note = section.note ? (bilingual ? `${section.note.fr} · ${section.note.en}` : section.note[lang]) : '';
    if (!mobile) {
      // Single continuous table per section: avoids orphan last pages that only hold a 3-row lead block.
      return `<section class="section" id="section-${esc(section.legacyKey)}" style="--color:${section.color}">
        <div class="section-header"><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>
        ${note ? `<p class="note">${esc(note)}</p>` : ''}
        <table data-section="${esc(section.legacyKey)}">
          ${landscapeTableHead(section, lang)}
          <tbody>${section.foods.map((food) => landscapeRow(section, food, lang)).join('')}</tbody>
        </table>
        <p class="back-index"><a href="#index">↑ Index</a></p>
      </section>`;
    }
    const first = section.foods[0];
    const rest = section.foods.slice(1);
    return `<section class="section" id="section-${esc(section.legacyKey)}" style="--color:${section.color}">
      <div class="section-lead">
        <div class="section-header"><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>
        ${note ? `<p class="note">${esc(note)}</p>` : ''}
        ${first ? renderMobileItem(section, first) : ''}
      </div>
      <div class="item-list">${rest.map((food) => renderMobileItem(section, food)).join('')}</div>
      <p><a href="#index">↑ Index</a></p>
    </section>`;
  }).join('');
}

function buildDocument(model, { lang = 'fr', mobile = false, bilingual = false } = {}) {
  if (!model?.logoSrc) throw new Error('model.logoSrc is required for guide preview HTML');
  const css = mobile ? mobileCss() : landscapeCss();
  return `<!doctype html><html lang="${bilingual ? 'fr' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(model.watermarkFr || model.watermark)}</title><style>${css}</style></head>
  <body>${headerHtml(model, { bilingual, lang })}${howtoHtml(bilingual)}${legendHtml(bilingual)}${toc(model, bilingual)}${buildSections(model, { lang, mobile, bilingual })}</body></html>`;
}

export const buildLandscapeHtml = (model, lang = 'fr') => buildDocument(model, { lang });
export const buildLandscapeFrHtml = (model) => buildDocument(model, { lang: 'fr' });
export const buildLandscapeEnHtml = (model) => buildDocument(model, { lang: 'en' });
export const buildMobileBilingualHtml = (model) => buildDocument(model, { lang: 'fr', mobile: true, bilingual: true });
