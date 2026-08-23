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
function mealList(meals) {
  return meals.map((meal) => `<div class="meal-box"><div class="meal-title"><span class="meal-icon" aria-hidden="true">${esc(meal.icon)}</span>${esc(meal.label)}</div><ul class="meal-list">${
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
