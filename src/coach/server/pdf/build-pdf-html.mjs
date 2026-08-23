import { assertNoForbiddenPdfContent } from '../../../lib/coach-calculator-engine.mjs';
import { PDF_LABELS } from './labels.mjs';
import { getPdfStylesCss } from './styles.mjs';
import { getPdfTheme } from './themes.mjs';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}
function n(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function macros(t, labels) {
  return `${n(t?.pro)}g ${labels.pro} · ${n(t?.glu)}g ${labels.glu} · ${n(t?.lip)}g ${labels.lip}`;
}
function signed(value, suffix = '') { return `${n(value) > 0 ? '+' : ''}${n(value)}${suffix}`; }
function mealIconSvg(mealIndex) {
  const icons = [
    ['breakfast', '<path d="M2 11h12" stroke="#3B82F6" stroke-width="1.5"/><path d="M5 11a3 3 0 0 1 6 0" fill="#FDBA2D"/><path d="M8 2v2M3.8 4.2l1.4 1.4M12.2 4.2l-1.4 1.4M2 8h2M12 8h2" stroke="#F59E0B" stroke-width="1.25" stroke-linecap="round"/>'],
    ['am-snack', '<path d="M3 6h8v5.2A1.8 1.8 0 0 1 9.2 13H4.8A1.8 1.8 0 0 1 3 11.2V6Z" fill="#8B6F80"/><path d="M11 7h1a2 2 0 0 1 0 4h-1" fill="none" stroke="#8B6F80" stroke-width="1.4"/><path d="M5 4c0-1 1-1 1-2M8 4c0-1 1-1 1-2" stroke="#C4A7B5" stroke-width="1.1" stroke-linecap="round"/>'],
    ['lunch', '<path d="M4 2v5M2.5 2v3.2A1.8 1.8 0 0 0 4 7m1.5-5v3.2A1.8 1.8 0 0 1 4 7v7" stroke="#9B8CC2" stroke-width="1.25" stroke-linecap="round"/><path d="M10 2v12M10 2c2 1 2.5 4.5 0 6" stroke="#9B8CC2" stroke-width="1.4" stroke-linecap="round"/>'],
    ['pm-snack', '<path d="M8 5c-2.6-2-5.5.3-4.8 3.8C4 12.6 6 14 8 12.8c2 1.2 4-.2 4.8-4C13.5 5.3 10.6 3 8 5Z" fill="#EF4444"/><path d="M8 5c0-1.7.7-2.7 2.1-3.2" stroke="#6B4423" stroke-width="1.1" stroke-linecap="round"/><path d="M9.4 2.5c1.6-.7 2.8-.1 3.2 1.1-1.6.5-2.7.1-3.2-1.1Z" fill="#22A447"/>'],
    ['dinner', '<path d="M2.5 8.4c0-3.1 3-5.5 6.7-5.1 3.2.3 4.8 2.5 4.2 5.1-.7 3-3.8 4.8-7 4.3-2.4-.4-3.9-1.9-3.9-4.3Z" fill="#E94B5F"/><path d="M5.2 8.5c0-1.4 1.3-2.5 2.9-2.4 1.4.1 2.2 1.1 1.9 2.3-.3 1.3-1.7 2.1-3.1 1.9-1-.2-1.7-.8-1.7-1.8Z" fill="#FFE7E9"/>'],
    ['snack', '<path d="M11.8 11.4A5.8 5.8 0 0 1 5 2.4a5.9 5.9 0 1 0 6.8 9Z" fill="#F5A623"/>'],
    ['evening', '<path d="M11.7 11.8A5.7 5.7 0 0 1 5 2.6a5.8 5.8 0 1 0 6.7 9.2Z" fill="#F4B942"/><path d="m12.2 2 .5 1.1 1.2.2-.9.8.2 1.2-1-.6-1.1.6.3-1.2-.9-.8 1.2-.2.5-1.1Z" fill="#3B82F6"/>'],
  ];
  const [name, shapes] = icons[mealIndex] || icons[5];
  return `<svg class="meal-icon" data-meal-icon="${name}" viewBox="0 0 16 16" aria-hidden="true">${shapes}</svg>`;
}
function mealList(meals) {
  return meals.map((meal) => `<div class="meal-box"><div class="meal-title">${mealIconSvg(meal.mealIndex)}${esc(meal.label)}</div><ul class="meal-list">${
    meal.items.map((item) => `<li>${esc(item.portions)} portion(s) — ${esc(item.label)}</li>`).join('')
  }</ul></div>`).join('');
}
function pie(snapshot, labels, theme) {
  const p = snapshot.macroPercentages || {};
  const pro = Math.max(0, n(p.pro));
  const glu = Math.max(0, n(p.glu));
  const lip = Math.max(0, n(p.lip));
  const total = pro + glu + lip || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const segment = (value) => (value / total) * circumference;
  const a = segment(pro);
  const b = segment(glu);
  const c = segment(lip);
  return `<div class="pdf-macro-chart"><strong>${esc(labels.macroChartTitle)}</strong><div class="pdf-macro-chart-row"><div class="pdf-pie-wrap"><svg class="pdf-pie-svg" viewBox="0 0 100 100" aria-label="${esc(labels.macroChartTitle)}"><g transform="rotate(-90 50 50)" fill="none" stroke-width="16"><circle cx="50" cy="50" r="${radius}" stroke="${esc(theme.piePro)}" stroke-dasharray="${a} ${circumference - a}" stroke-dashoffset="0"/><circle cx="50" cy="50" r="${radius}" stroke="${esc(theme.pieGlu)}" stroke-dasharray="${b} ${circumference - b}" stroke-dashoffset="${-a}"/><circle cx="50" cy="50" r="${radius}" stroke="${esc(theme.pieLip)}" stroke-dasharray="${c} ${circumference - c}" stroke-dashoffset="${-(a + b)}"/></g></svg><div class="pdf-pie-legend"><span class="dot dot-pro"></span>${esc(labels.pro)} ${pro}%<br><span class="dot dot-glu"></span>${esc(labels.glu)} ${glu}%<br><span class="dot dot-lip"></span>${esc(labels.lip)} ${lip}%</div></div><table class="macro-ratio-table"><tr><th>${esc(labels.nutrient)}</th><th>${esc(labels.pro)}</th><th>${esc(labels.glu)}</th><th>${esc(labels.lip)}</th></tr><tr><td>%</td><td>${pro}%</td><td>${glu}%</td><td>${lip}%</td></tr><tr><td>g</td><td>${n(snapshot.totals?.pro)}</td><td>${n(snapshot.totals?.glu)}</td><td>${n(snapshot.totals?.lip)}</td></tr></table></div></div>`;
}

function page({
  snapshot, labels, theme, athleteName, dateStr, goalLabel, ratioLabel, notes, logoDataUri, first,
}) {
  const r = snapshot.reconciliation;
  const v = r.varianceVsTarget;
  const varClass = r.withinThreshold ? 'var-ok' : 'var-warn';
  const timing = snapshot.timing?.active
    ? `<tr><td class="info-label">${esc(labels.training)}</td><td>${esc(snapshot.timing.heureLabel || snapshot.timing.summary || '')}</td></tr>`
    : '';
  const note = notes
    ? `<div class="pdf-coach-notes"><strong>${esc(labels.coachNotesTitle)}</strong><div class="pdf-coach-notes-body">${esc(notes)}</div></div>`
    : '';
  const dayLine = first ? '' : `<div class="pdf-brand-day">${esc(snapshot.jourLabel)}</div>`;
  const logo = logoDataUri
    ? `<img src="${esc(logoDataUri)}" alt="${esc(theme.logoAlt)}">`
    : '';
  const header = `<header class="pdf-brand-header"><div class="pdf-brand-header-logo">${logo}</div><div class="pdf-brand-copy"><div class="pdf-brand-title">${esc(labels.mainTitle)}</div><div class="pdf-brand-subtitle">${esc(labels.subtitle)} — ${esc(labels.brandBy)} ${esc(theme.displayName)}</div>${dayLine}</div></header><div class="pdf-brand-rule"></div>`;

  return `<section class="pdf-a4-page brand-${esc(theme.id)}" data-pdf-brand="${esc(theme.id)}">${header}<div class="pdf-page-pad"><div class="info-grid"><table class="info-table"><tbody><tr><td class="info-label">${esc(labels.athlete)}</td><td>${esc(athleteName)}</td></tr><tr><td class="info-label">${esc(labels.date)}</td><td>${esc(dateStr)}</td></tr><tr><td class="info-label">${esc(labels.energyGoal)}</td><td>${esc(goalLabel)}</td></tr><tr><td class="info-label">${esc(labels.dayType)}</td><td>${esc(snapshot.jourLabel)}</td></tr>${timing}<tr><td class="info-label">${esc(labels.macroRatio)}</td><td>${esc(ratioLabel)}</td></tr></tbody></table><div class="pdf-recon"><div class="pdf-recon-title">${esc(labels.reconciliationTitle)}</div><table><tbody><tr><td class="info-label">${esc(labels.targetCalories)}</td><td class="val-blue">${n(r.target.kcal)} kcal</td></tr><tr><td class="info-label">${esc(labels.targetMacros)}</td><td>${esc(macros(r.target, labels))}</td></tr><tr><td class="info-label">${esc(labels.plannedCalories)}</td><td><strong>${n(r.planned.kcal)} kcal</strong></td></tr><tr><td class="info-label">${esc(labels.plannedMacros)}</td><td>${esc(macros(r.planned, labels))}</td></tr><tr><td class="info-label">${esc(labels.varianceLabel)}</td><td class="${varClass}">${signed(v.kcal, ' kcal')} · ${signed(v.pro, 'g')} ${esc(labels.pro)} · ${signed(v.glu, 'g')} ${esc(labels.glu)} · ${signed(v.lip, 'g')} ${esc(labels.lip)}</td></tr><tr><td class="info-label">${esc(labels.banqueNote)}</td><td>${n(r.banque.kcal)} kcal · ${esc(macros(r.banque, labels))}</td></tr><tr><td class="info-label">${esc(labels.hydration)}</td><td class="val-cyan">${n(snapshot.eau?.total)} ${esc(labels.perDay)}</td></tr></tbody></table><div class="pdf-recon-note">${esc(labels.varianceOrigin)}</div></div></div><div class="pdf-section">${esc(labels.portionsSection)}</div><div class="pdf-page-body"><div class="meals-grid"><div>${mealList(snapshot.mealsLeft || [])}</div><div>${mealList(snapshot.mealsRight || [])}</div></div>${note}${pie(snapshot, labels, theme)}</div><div class="pdf-totals">${esc(labels.plannedCalories)}: ${n(r.planned.kcal)} kcal · ${esc(macros(r.planned, labels))} | ${esc(labels.targetCalories)}: ${n(r.target.kcal)} kcal | <span class="${varClass}">${esc(labels.varianceLabel)}: ${signed(v.kcal, ' kcal')}</span></div><div class="pdf-scope-note">${esc(labels.scopeNotice)}</div><footer class="pdf-footer">${esc(labels.footer)}</footer></div></section>`;
}

export function buildPdfDocumentHtml({
  locale = 'fr', brandId, athleteName, dateStr, goalLabel, ratioLabel, notes = '',
  trainingSnapshot, restSnapshot = null, logoDataUri = '', theme: themeOverride = null,
} = {}) {
  const language = locale === 'en' ? 'en' : 'fr';
  const labels = PDF_LABELS[language];
  const theme = themeOverride || getPdfTheme(brandId);
  if (!theme || !trainingSnapshot) throw new Error('Invalid PDF document inputs');
  const pages = [page({
    snapshot: trainingSnapshot, labels, theme, athleteName, dateStr, goalLabel, ratioLabel, notes, logoDataUri, first: true,
  })];
  if (restSnapshot && n(restSnapshot.plannedTotals?.kcal) > 0) {
    pages.push(page({
      snapshot: restSnapshot, labels, theme, athleteName, dateStr, goalLabel, ratioLabel, notes, logoDataUri, first: false,
    }));
  }
  const html = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><style>${getPdfStylesCss(theme)}</style></head><body>${pages.join('')}</body></html>`;
  assertNoForbiddenPdfContent(html);
  return html;
}
