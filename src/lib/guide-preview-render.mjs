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
  body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#172033;background:#f1f5f9}
  .banner{position:sticky;top:0;z-index:5;background:#991b1b;color:#fff;padding:10px 12px;text-align:center;font-weight:800;letter-spacing:.03em;font-size:11px;line-height:1.35}
  .banner .banner-en{display:block;font-weight:700;opacity:.92;margin-top:2px;font-size:10px}
  header,.toc,.section{background:#fff;margin:12px auto;padding:16px;max-width:1280px}
  header{display:flex;align-items:center;gap:20px}
  .brand-logo-wrap{background:#ffffff;padding:8px 10px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center}
  header img.brand-logo{width:140px;max-height:64px;object-fit:contain;display:block;background:#ffffff}
  .meta{font-size:12px;color:#475569;line-height:1.45}
  .toc a{display:inline-block;margin:4px;padding:7px 10px;color:#fff;border-radius:4px;text-decoration:none}
  .section{break-before:auto;page-break-before:auto}
  .section-lead{border-left:8px solid var(--color);padding:8px 12px;break-inside:avoid;page-break-inside:avoid;break-after:avoid;page-break-after:avoid}
  .section-header{break-after:avoid;page-break-after:avoid}
  h1,h2,p{margin:3px 0}.note{font-size:11px;color:#475569;margin:7px 0}
  table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px}
  thead{display:table-header-group}
  th,td{padding:5px;border:1px solid #dbe3ee;text-align:right;overflow-wrap:anywhere;hyphens:manual}
  th{background:var(--color);color:#fff;white-space:normal;line-height:1.25}
  th:first-child,td:first-child{text-align:left;width:34%}
  tr{break-inside:avoid;page-break-inside:avoid}
  tbody tr:nth-child(even){background:#f8fafc}
  .en{color:#475569;font-size:.88em}
  .howto,.legend{background:#fff;margin:12px auto;padding:16px;max-width:1280px;border-left:6px solid #991b1b}
  .howto h2,.legend h2{margin:0 0 8px;font-size:18px}
  .howto ol{margin:0;padding-left:1.2rem;line-height:1.45}
  .legend dl{display:grid;grid-template-columns:120px 1fr;gap:6px 12px;margin:0;font-size:12px}
  .legend dt{font-weight:700}.legend dd{margin:0;color:#475569}
  .running-footer{display:none}
  @page{size:A4 landscape;margin:14mm 8mm 14mm 8mm}
  @media print{
    body{background:#fff}.banner{position:static}
    .section{margin:0 auto;padding:10px;break-inside:auto}
    .section-continue-table thead{display:table-header-group}
    .toc a{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .running-footer{display:block;position:fixed;bottom:0;left:0;right:0;font-size:9px;color:#64748b;text-align:center}
  }
`;
}

function mobileCss() {
  return `
  *{box-sizing:border-box}html{scroll-behavior:smooth}
  body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#172033;background:#f1f5f9}
  .banner{position:sticky;top:0;z-index:5;background:#991b1b;color:#fff;padding:10px 12px;text-align:center;font-weight:800;letter-spacing:.03em;font-size:11px;line-height:1.35}
  .banner .banner-en{display:block;font-weight:700;opacity:.92;margin-top:2px;font-size:10px}
  header,.toc,.section{background:#fff;margin:10px auto;padding:14px;max-width:720px}
  header{display:flex;flex-direction:column;align-items:flex-start;gap:10px}
  .brand-logo-wrap{background:#ffffff;padding:8px 10px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center}
  header img.brand-logo{width:150px;max-height:70px;object-fit:contain;display:block;background:#ffffff}
  .meta{font-size:12px;color:#475569;line-height:1.45}
  .toc a{display:inline-block;margin:4px;padding:7px 10px;color:#fff;border-radius:4px;text-decoration:none;font-size:12px}
  .section{break-before:auto;page-break-before:auto}
  .section-lead{break-inside:avoid;page-break-inside:avoid;break-after:avoid;page-break-after:avoid;margin-bottom:6px}
  .section-header{border-left:8px solid var(--color);padding:8px 12px;break-after:avoid;page-break-after:avoid}
  h1,h2,p{margin:3px 0}.note{font-size:11px;color:#475569;margin:7px 0 10px}
  .item-list{border:1px solid #dbe3ee;border-radius:8px;overflow:hidden;background:#fff}
  .item{padding:10px 12px;border-bottom:1px solid #e2e8f0;break-inside:avoid;page-break-inside:avoid;background:#fff}
  .item:nth-child(even){background:#f8fafc}
  .item:last-child{border-bottom:none}
  .item-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px}
  .item-name{font-size:11px;font-weight:700;line-height:1.35;color:#172033;flex:1}
  .item-name .en{display:block;font-weight:600;color:#475569;font-size:10px;margin-top:2px}
  .item-kcal{flex-shrink:0;font-size:13px;font-weight:700;color:var(--color);font-variant-numeric:tabular-nums;line-height:1.2}
  .item-kcal small{font-size:9px;font-weight:600;opacity:.75;margin-left:1px}
  .item-tags{display:flex;flex-wrap:wrap;gap:5px}
  .tag{font-size:10px;font-weight:600;padding:3px 9px;border-radius:999px;font-variant-numeric:tabular-nums;white-space:nowrap}
  .tag-prot{background:#eff6ff;color:#1d4ed8}
  .tag-gluc{background:#fffbeb;color:#b45309}
  .tag-fib{background:#f0fdf4;color:#15803d}
  .tag-lip{background:#fdf2f8;color:#9d174d}
  .tag-cal{background:#f1f5f9;color:#334155}
  .tag-neutral{background:#f1f5f9;color:#475569}
  .howto,.legend{background:#fff;margin:10px auto;padding:14px;max-width:720px;border-left:6px solid #991b1b}
  .howto h2,.legend h2{margin:0 0 8px;font-size:16px}
  .howto ol{margin:0;padding-left:1.2rem;line-height:1.45;font-size:12px}
  .legend dl{display:grid;grid-template-columns:100px 1fr;gap:6px 10px;margin:0;font-size:11px}
  .legend dt{font-weight:700}.legend dd{margin:0;color:#475569}
  @page{size:A4 portrait;margin:14mm 10mm 16mm 10mm}
  @media print{
    body{background:#fff}.banner{position:static}
    .section{margin:0 auto 8mm;padding:8px 0}
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
  <header>
    <div class="brand-logo-wrap">
      <img class="brand-logo" src="${esc(model.logoSrc)}" alt="KR Kinetics" width="140" height="64">
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
      const leadCount = Math.min(3, section.foods.length);
      const leadFoods = section.foods.slice(0, leadCount);
      const restFoods = section.foods.slice(leadCount);
      return `<section class="section" id="section-${esc(section.legacyKey)}" style="--color:${section.color}">
        <div class="section-lead">
          <div class="section-header"><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>
          ${note ? `<p class="note">${esc(note)}</p>` : ''}
          <table data-section="${esc(section.legacyKey)}" class="section-lead-table">
            ${landscapeTableHead(section, lang)}
            <tbody>${leadFoods.map((food) => landscapeRow(section, food, lang)).join('')}</tbody>
          </table>
        </div>
        ${restFoods.length ? `<table data-section="${esc(section.legacyKey)}" class="section-continue-table">
          <caption class="section-header" style="caption-side:top;text-align:left;padding:6px 0;font-weight:700;">${esc(title)} — suite</caption>
          ${landscapeTableHead(section, lang)}
          <tbody>${restFoods.map((food) => landscapeRow(section, food, lang)).join('')}</tbody>
        </table>` : ''}
        <p><a href="#index">↑ Index</a></p>
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
