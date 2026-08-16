/**
 * Current KR Kinetics PDF renderer for report-model-v4.2.
 * Presentation only. Does not score, run rules, or invent interpretation.
 */

import PDFDocument from 'pdfkit';
import { resolveFontFile, resolvePdfAsset } from './components/layout.mjs';
import { PDF_FONTS } from './theme.mjs';
import { KR_V42_BRAND, KR_V42_COLORS, KR_V42_PAGE, KR_V42_TYPE } from './theme-v42-kr.mjs';
import { formatCoachDateTime } from '../report-timestamp.mjs';
import {
  EVIDENCE_LEGEND,
  displayKeys,
  excludeExact,
  groupDimensions,
  isEmphasizedDimension,
  splitNutritionBlocks,
} from './pdf-v42-display.mjs';

export const MOTIVATION_PDF_RENDERER_ID = 'renderCoachReportPdfV42Kr';

export function isValidPdfBuffer(buffer) {
  return Boolean(buffer)
    && buffer.length > 100
    && buffer.subarray(0, 5).toString() === '%PDF-';
}

/** Preserve French punctuation and verbatim dashes. Do not fold — into –. */
function t(value) {
  if (value == null) return '';
  return String(value)
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\u2022/g, '•')
    .replace(/…/g, '...')
    .replace(/\t/g, ' ');
}

function formatPdfDate(value) {
  return formatCoachDateTime(value);
}

class KrLayout {
  constructor(doc, meta) {
    this.doc = doc;
    this.meta = meta;
    this.page = 1;
    this.left = KR_V42_PAGE.marginX;
    this.width = KR_V42_PAGE.width - KR_V42_PAGE.marginX * 2;
    this.bottom = KR_V42_PAGE.height - KR_V42_PAGE.footerHeight;
    this.y = 36;
    this.overflows = [];
    this.logoPlacements = [];
    this.locked = false;
    this.pageStats = [{ page: 1, usedHeight: 0, blockCount: 0, roles: ['brief'] }];
  }

  setFont(bold = false, size = KR_V42_TYPE.body, color = KR_V42_COLORS.text) {
    this.doc
      .font(bold ? PDF_FONTS.bold : PDF_FONTS.regular)
      .fontSize(size)
      .fillColor(color);
  }

  heightOf(value, width = this.width, options = {}) {
    this.setFont(options.bold, options.size, options.color);
    return this.doc.heightOfString(t(value), { width, lineGap: options.lineGap ?? 2 });
  }

  remaining() {
    return this.bottom - this.y;
  }

  ensure(needed) {
    if (this.locked) return this.remaining() >= needed;
    if (needed > this.remaining()) this.addPage();
    return true;
  }

  lockPage() {
    this.locked = true;
  }

  unlockPage() {
    this.locked = false;
  }

  record(role) {
    const current = this.pageStats[this.page - 1];
    if (!current) return;
    current.blockCount += 1;
    if (role && !current.roles.includes(role)) current.roles.push(role);
    current.usedHeight = Math.max(current.usedHeight, this.y);
  }

  addPage(role = 'content') {
    if (this.locked) return;
    const current = this.pageStats[this.page - 1];
    if (current) current.usedHeight = Math.max(current.usedHeight, this.y);
    this.doc.addPage();
    this.page += 1;
    this.pageStats.push({ page: this.page, usedHeight: 0, blockCount: 0, roles: [role] });
    this.drawHeader();
    this.y = KR_V42_PAGE.headerHeight + 12;
  }

  drawHeader() {
    const { logoPath, clientName } = this.meta;
    if (logoPath) {
      try {
        const logoW = 58;
        const logoH = logoW * (302 / 993);
        const padX = 6;
        const padY = 4;
        this.doc
          .roundedRect(this.left, 10, logoW + padX * 2, logoH + padY * 2, 3)
          .fill(KR_V42_COLORS.primary);
        this.doc.image(logoPath, this.left + padX, 10 + padY, { width: logoW });
        this.logoPlacements.push({ page: this.page, role: 'header' });
      } catch {
        // keep header text if the asset cannot be painted
      }
    }
    this.setFont(true, 9, KR_V42_COLORS.primary);
    this.doc.text(t(KR_V42_BRAND.reportTitle), this.left + 92, 14, {
      width: 280,
      lineBreak: false,
    });
    this.setFont(false, 8, KR_V42_COLORS.muted);
    this.doc.text(t(clientName || 'Profil motivationnel'), this.left + 92, 26, {
      width: 280,
      lineBreak: false,
    });
    this.doc
      .moveTo(this.left, 40)
      .lineTo(this.left + this.width, 40)
      .strokeColor(KR_V42_COLORS.border)
      .lineWidth(0.8)
      .stroke();
  }

  drawFooters(pageCount) {
    const range = this.doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      this.doc.switchToPage(i);
      this.setFont(false, KR_V42_TYPE.footer, KR_V42_COLORS.muted);
      const y = KR_V42_PAGE.height - 22;
      this.doc
        .moveTo(this.left, y - 8)
        .lineTo(this.left + this.width, y - 8)
        .strokeColor(KR_V42_COLORS.border)
        .lineWidth(0.6)
        .stroke();
      this.doc.text(t(KR_V42_BRAND.confidential), this.left, y, {
        width: this.width - 70,
        lineBreak: false,
      });
      this.doc.text(`${i + 1} / ${pageCount}`, this.left, y, {
        width: this.width,
        align: 'right',
        lineBreak: false,
      });
    }
  }

  gap(n = 8) {
    this.y += n;
  }

  fillCard(x, y, w, h, fill = KR_V42_COLORS.card) {
    this.doc
      .save()
      .roundedRect(x, y, w, h, 6)
      .fillAndStroke(fill, KR_V42_COLORS.border)
      .restore();
  }

  pageKicker(title) {
    this.setFont(true, KR_V42_TYPE.kicker, KR_V42_COLORS.accent);
    this.doc.text(t(title).toUpperCase(), this.left, this.y, { width: this.width });
    this.y = this.doc.y + 4;
  }

  sectionTitle(title) {
    const height = 20;
    this.ensure(height + 48);
    this.setFont(true, KR_V42_TYPE.section, KR_V42_COLORS.primary);
    this.doc.text(t(title), this.left, this.y, { width: this.width });
    const ruleY = this.doc.y + 3;
    this.doc
      .moveTo(this.left, ruleY)
      .lineTo(this.left + 28, ruleY)
      .strokeColor(KR_V42_COLORS.accent)
      .lineWidth(1.8)
      .stroke();
    this.y = ruleY + 8;
  }

  subsection(title) {
    this.setFont(true, KR_V42_TYPE.subsection, KR_V42_COLORS.primary);
    this.doc.text(t(title), this.left, this.y, { width: this.width });
    this.y = this.doc.y + 5;
  }
}

function drawHero(layout, display, logoPath) {
  const bandH = 128;
  layout.doc.rect(0, 0, KR_V42_PAGE.width, bandH).fill(KR_V42_COLORS.primary);
  let y = 16;
  if (logoPath) {
    try {
      const logoWidth = 168;
      const logoHeight = logoWidth * (302 / 993);
      layout.doc.image(logoPath, layout.left, y, { width: logoWidth });
      layout.logoPlacements.push({ page: layout.page, role: 'hero' });
      y += logoHeight + 10;
    } catch {
      y += 8;
    }
  }
  layout.setFont(true, KR_V42_TYPE.title, KR_V42_COLORS.white);
  layout.doc.text(t(KR_V42_BRAND.reportTitle), layout.left, y, { width: layout.width });
  y = layout.doc.y + 2;
  layout.setFont(false, KR_V42_TYPE.subtitle, '#d7e0ec');
  layout.doc.text(t(KR_V42_BRAND.reportSubtitle), layout.left, y, { width: layout.width });
  y = layout.doc.y + 8;
  layout.setFont(true, 12, KR_V42_COLORS.white);
  layout.doc.text(t(display.clientName || 'Client'), layout.left, y, { width: layout.width });
  y = layout.doc.y + 4;
  const meta = [
    display.submittedAt ? `Soumission : ${formatPdfDate(display.submittedAt)}` : '',
    display.analyzedAt ? `Analyse : ${formatPdfDate(display.analyzedAt)}` : '',
    display.analysisVersion != null ? `Version : v${display.analysisVersion}` : '',
  ].filter(Boolean).join('   ·   ');
  if (meta) {
    layout.setFont(false, KR_V42_TYPE.meta, '#d7e0ec');
    layout.doc.text(t(meta), layout.left, y, { width: layout.width });
    y = layout.doc.y + 6;
  }
  layout.y = Math.max(bandH + 14, y + 8);
}

function drawQuickRead(layout, items) {
  if (!items?.length) return;
  layout.sectionTitle('Lecture rapide');
  const colW = (layout.width - 10) / 2;
  const rowH = 48;
  for (let i = 0; i < items.length; i += 2) {
    layout.ensure(rowH + 8);
    const y = layout.y;
    const pair = [items[i], items[i + 1]].filter(Boolean);
    pair.forEach((item, col) => {
      const x = layout.left + col * (colW + 10);
      layout.fillCard(x, y, colW, rowH, KR_V42_COLORS.bg);
      layout.setFont(true, 7.5, KR_V42_COLORS.muted);
      layout.doc.text(t(item.label).toUpperCase(), x + 9, y + 8, { width: colW - 18 });
      layout.setFont(true, 10, KR_V42_COLORS.primary);
      layout.doc.text(t(item.value), x + 9, y + 22, { width: colW - 18, lineGap: 1 });
    });
    layout.y = y + rowH + 8;
  }
}

function drawSummary(layout, lines) {
  if (!lines?.length) return;
  layout.sectionTitle('Synthèse');
  const body = lines.slice(0, 2).map((line) => t(line)).join('\n\n');
  const h = Math.max(56, layout.heightOf(body, layout.width - 24, { size: 10, lineGap: 3 }) + 20);
  layout.ensure(h);
  layout.fillCard(layout.left, layout.y, layout.width, h);
  layout.setFont(false, 10, KR_V42_COLORS.text);
  layout.doc.text(body, layout.left + 12, layout.y + 10, {
    width: layout.width - 24,
    lineGap: 3,
  });
  layout.y += h + 10;
}

function drawPriorityList(layout, items, limit = 3) {
  const rows = (items || []).slice(0, limit);
  if (!rows.length) return;
  layout.sectionTitle('Priorités Coach');
  rows.forEach((item, index) => {
    const text = t(item);
    const h = Math.max(26, layout.heightOf(text, layout.width - 40, { size: 9.5 }) + 12);
    layout.ensure(h + 6);
    const y = layout.y;
    layout.fillCard(layout.left, y, layout.width, h);
    layout.doc.circle(layout.left + 16, y + h / 2, 8).fill(KR_V42_COLORS.primary);
    layout.setFont(true, 8, KR_V42_COLORS.white);
    layout.doc.text(String(index + 1), layout.left + 12, y + h / 2 - 5, { width: 8, align: 'center' });
    layout.setFont(false, 9.5, KR_V42_COLORS.text);
    layout.doc.text(text, layout.left + 32, y + 6, { width: layout.width - 44, lineGap: 2 });
    layout.y = y + h + 6;
  });
}

function drawSupportList(layout, items) {
  const rows = (items || []).slice(0, 4);
  if (!rows.length) return;
  layout.sectionTitle('Principaux appuis');
  const body = rows.map((item) => `•  ${t(item)}`).join('\n');
  const h = layout.heightOf(body, layout.width - 24, { size: 9.5, lineGap: 3 }) + 16;
  layout.ensure(h);
  layout.fillCard(layout.left, layout.y, layout.width, h, KR_V42_COLORS.bg);
  layout.setFont(false, 9.5, KR_V42_COLORS.text);
  layout.doc.text(body, layout.left + 12, layout.y + 8, { width: layout.width - 24, lineGap: 3 });
  layout.y += h + 10;
}

function drawVigilance(layout, items, limit = 2) {
  const rows = (items || []).slice(0, limit);
  if (!rows.length) return;
  layout.sectionTitle('Vigilances majeures');
  for (const item of rows) {
    const text = t(item);
    const h = Math.max(28, layout.heightOf(text, layout.width - 28, { size: 9.5 }) + 14);
    layout.ensure(h + 6);
    const y = layout.y;
    layout.doc.rect(layout.left, y, 4, h).fill(KR_V42_COLORS.accent);
    layout.doc.roundedRect(layout.left + 4, y, layout.width - 4, h, 4).fill('#fff7f8');
    layout.setFont(false, 9.5, KR_V42_COLORS.text);
    layout.doc.text(text, layout.left + 14, y + 7, { width: layout.width - 26, lineGap: 2 });
    layout.y = y + h + 6;
  }
}

function drawPage1(layout, vm, logoPath) {
  drawHero(layout, vm, logoPath);
  layout.lockPage();
  drawQuickRead(layout, vm.quickRead);
  layout.record('quick-read');
  drawSummary(layout, vm.summary);
  layout.record('summary');
  drawPriorityList(layout, vm.coachPriorities, 3);
  layout.record('priorities');
  drawSupportList(layout, (vm.supports || []).slice(0, 3));
  layout.record('supports');
  drawVigilance(layout, vm.vigilance, 2);
  layout.record('vigilance');
  layout.unlockPage();
}

function drawDimensionRow(layout, row, x, width) {
  const emphasized = isEmphasizedDimension(row);
  const label = t(row.label);
  const score = row.score == null || row.score === ''
    ? (row.displayLabel || '—')
    : String(row.score);
  const badge = t(row.evidenceBadge);
  const start = layout.y;
  layout.setFont(emphasized, 8, KR_V42_COLORS.text);
  layout.doc.text(label, x, start, { width: width - 118, lineBreak: false });
  if (badge) {
    layout.setFont(false, 6.5, KR_V42_COLORS.muted);
    layout.doc.text(badge, x + width - 114, start + 1, { width: 72, lineBreak: false });
  }
  layout.setFont(true, emphasized ? 9.5 : 8.5, KR_V42_COLORS.primary);
  layout.doc.text(score, x, start, { width, align: 'right', lineBreak: false });
  const barY = start + 11;
  const barH = emphasized ? 5 : 3.5;
  const n = Number(row.technicalScore ?? row.score);
  const pct = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) / 100 : 0;
  const barColor = row.signalDirection === 'risk'
    ? KR_V42_COLORS.accent
    : row.signalDirection === 'context'
      ? '#3d5a80'
      : KR_V42_COLORS.primary;
  layout.doc.roundedRect(x, barY, width, barH, 2).fill(KR_V42_COLORS.bg);
  if (pct > 0) {
    layout.doc.roundedRect(x, barY, Math.max(2, width * pct), barH, 2).fill(barColor);
  }
  layout.y = barY + barH + (emphasized ? 5 : 4);
}

function drawPortrait(layout, dimensions) {
  const groups = groupDimensions(dimensions);
  if (!groups.length) return;
  layout.pageKicker('Portrait motivationnel');
  layout.sectionTitle('Dimensions');
  const legend = EVIDENCE_LEGEND.map((item) => `${item.badge} : ${item.note}`).join('   ·   ');
  layout.setFont(false, 7.5, KR_V42_COLORS.muted);
  layout.doc.text(t(`Badges de preuve déjà présents — ${legend}`), layout.left, layout.y, {
    width: layout.width,
  });
  layout.y = layout.doc.y + 8;

  for (const group of groups) {
    layout.ensure(28);
    layout.subsection(group.title);
    layout.record(`portrait-${group.id}`);
    for (const row of group.items) {
      layout.ensure(18);
      drawDimensionRow(layout, row, layout.left, layout.width);
    }
    layout.gap(2);
  }
}

function drawInterviewPrep(layout, vm) {
  const used = displayKeys([
    ...(vm.vigilance || []),
    ...(vm.verbatims || []).map((item) => item.verbatim),
  ]);
  const questions = excludeExact(vm.interviewQuestions, used);
  const priorities = excludeExact(vm.coachPriorities, displayKeys(questions));
  const vigilance = excludeExact(vm.vigilance, displayKeys(questions));

  layout.pageKicker('Préparer l’entrevue');
  if (priorities.length) {
    layout.sectionTitle('Priorités Coach');
    layout.record('interview-priorities');
    priorities.slice(0, 5).forEach((item, index) => {
      layout.setFont(true, 9, KR_V42_COLORS.primary);
      layout.doc.text(`${index + 1}.`, layout.left, layout.y, { width: 14 });
      layout.setFont(false, 9.5, KR_V42_COLORS.text);
      layout.doc.text(t(item), layout.left + 16, layout.y, { width: layout.width - 16, lineGap: 2 });
      layout.y = layout.doc.y + 5;
    });
    layout.gap(4);
  }
  if (vigilance.length) {
    drawVigilance(layout, vigilance, 6);
  }
  if (questions.length) {
    layout.sectionTitle('À clarifier en entrevue');
    layout.record('interview-questions');
    for (const item of questions) {
      const text = t(item);
      const h = Math.max(18, layout.heightOf(text, layout.width - 22, { size: 9.5 }) + 6);
      layout.ensure(h + 4);
      layout.doc
        .rect(layout.left, layout.y + 3, 8, 8)
        .strokeColor(KR_V42_COLORS.primary)
        .lineWidth(1)
        .stroke();
      layout.setFont(false, 9.5, KR_V42_COLORS.text);
      layout.doc.text(text, layout.left + 16, layout.y, { width: layout.width - 16, lineGap: 2 });
      layout.y = Math.max(layout.doc.y, layout.y + h) + 4;
    }
  }

  const voice = vm.verbatims || [];
  if (!voice.length) return;
  layout.sectionTitle('Voix du client');
  const colW = (layout.width - 8) / 2;
  for (let i = 0; i < voice.length; i += 2) {
    const pair = [voice[i], voice[i + 1]].filter(Boolean);
    const heights = pair.map((item) => {
      const quote = `« ${t(item.verbatim)} »`;
      const source = t(item.questionText || item.questionCode);
      return 22
        + layout.heightOf(quote, colW - 16, { size: 8.5, lineGap: 2 })
        + layout.heightOf(source, colW - 16, { size: 6.5 })
        + 8;
    });
    const rowH = Math.max(...heights);
    layout.ensure(rowH + 6);
    pair.forEach((item, col) => {
      const x = layout.left + col * (colW + 8);
      const y = layout.y;
      layout.fillCard(x, y, colW, rowH, KR_V42_COLORS.bg);
      layout.setFont(true, 6.5, KR_V42_COLORS.muted);
      layout.doc.text('VERBATIM CLIENT', x + 8, y + 5, { width: colW - 16 });
      layout.setFont(false, 8.5, KR_V42_COLORS.text);
      layout.doc.text(`« ${t(item.verbatim)} »`, x + 8, y + 16, { width: colW - 16, lineGap: 2 });
      layout.setFont(false, 6.5, KR_V42_COLORS.muted);
      layout.doc.text(t(item.questionText || item.questionCode), x + 8, y + rowH - 12, {
        width: colW - 16,
      });
    });
    layout.y += rowH + 6;
  }
  layout.record('voice');
}

function drawNutritionStrategy(layout, nutrition) {
  const blocks = splitNutritionBlocks(nutrition);
  if (!blocks) return;
  layout.pageKicker('Nutrition / stratégie');
  layout.sectionTitle('Nutrition');

  if (blocks.lecture?.length) {
    layout.subsection('Lecture nutrition');
    layout.record('nutrition-lecture');
    for (const line of blocks.lecture) {
      const h = layout.heightOf(line, layout.width - 24, { size: 9.5, lineGap: 3 }) + 16;
      layout.ensure(h);
      layout.fillCard(layout.left, layout.y, layout.width, h);
      layout.setFont(false, 9.5, KR_V42_COLORS.text);
      layout.doc.text(t(line), layout.left + 12, layout.y + 8, {
        width: layout.width - 24,
        lineGap: 3,
      });
      layout.y += h + 8;
    }
  }

  if (blocks.signals?.length) {
    layout.subsection('Signaux importants');
    const colW = (layout.width - 8) / 2;
    for (let i = 0; i < blocks.signals.length; i += 2) {
      const pair = [blocks.signals[i], blocks.signals[i + 1]].filter(Boolean);
      const heights = pair.map((line) => (
        Math.max(36, layout.heightOf(line, colW - 16, { size: 8.5, lineGap: 2 }) + 14)
      ));
      const rowH = Math.max(...heights);
      layout.ensure(rowH + 6);
      pair.forEach((line, col) => {
        const x = layout.left + col * (colW + 8);
        layout.fillCard(x, layout.y, colW, rowH, KR_V42_COLORS.bg);
        layout.setFont(false, 8.5, KR_V42_COLORS.text);
        layout.doc.text(t(line), x + 8, layout.y + 7, { width: colW - 16, lineGap: 2 });
      });
      layout.y += rowH + 6;
    }
  }

  if (blocks.structure) {
    layout.subsection('Structure suggérée');
    layout.record('nutrition-structure');
    const h = layout.heightOf(blocks.structure, layout.width - 24, { size: 9.5, lineGap: 3 }) + 16;
    layout.ensure(h);
    layout.fillCard(layout.left, layout.y, layout.width, h);
    layout.setFont(false, 9.5, KR_V42_COLORS.text);
    layout.doc.text(t(blocks.structure), layout.left + 12, layout.y + 8, {
      width: layout.width - 24,
      lineGap: 3,
    });
    layout.y += h + 8;
  }

  if (blocks.obstacles?.length) {
    layout.subsection('Obstacles');
    for (const item of blocks.obstacles) {
      const label = t(item);
      const w = Math.min(layout.width, layout.heightOf(label, layout.width, { size: 8, bold: true }) + 80);
      const h = 22;
      layout.ensure(h + 4);
      layout.doc.roundedRect(layout.left, layout.y, Math.max(88, w), h, 11).fill('#fff1f3');
      layout.setFont(true, 8, KR_V42_COLORS.accent);
      layout.doc.text(label, layout.left + 10, layout.y + 6, { width: layout.width - 20 });
      layout.y += h + 6;
    }
  }

  if (blocks.actions?.length) {
    layout.subsection('Points à confirmer');
    for (const item of blocks.actions) {
      layout.setFont(false, 9.5, KR_V42_COLORS.text);
      layout.doc.text(`•  ${t(item)}`, layout.left, layout.y, { width: layout.width, lineGap: 2 });
      layout.y = layout.doc.y + 4;
    }
  }
}

function weekCardHeight(layout, week, width) {
  const title = t(week.title || `Semaine ${week.week}`);
  const focus = t(week.focus || '');
  const actions = (week.actions || []).map((item) => `•  ${t(item)}`).join('\n');
  return 28
    + layout.heightOf(title, width - 16, { bold: true, size: 9.5 })
    + (focus ? layout.heightOf(focus, width - 16, { size: 8, lineGap: 2 }) + 4 : 0)
    + (actions ? layout.heightOf(actions, width - 16, { size: 8.5, lineGap: 2 }) + 6 : 0)
    + 10;
}

function drawWeekCard(layout, week, x, y, width, height) {
  layout.fillCard(x, y, width, height);
  layout.setFont(true, 7, KR_V42_COLORS.accent);
  layout.doc.text(`SEMAINE ${week.week ?? ''}`.trim(), x + 8, y + 7, { width: width - 16 });
  layout.setFont(true, 9.5, KR_V42_COLORS.primary);
  layout.doc.text(t(week.title || `Semaine ${week.week}`), x + 8, y + 18, { width: width - 16 });
  let cursor = layout.doc.y + 3;
  if (week.focus) {
    layout.setFont(false, 8, KR_V42_COLORS.muted);
    layout.doc.text(t(week.focus), x + 8, cursor, { width: width - 16, lineGap: 2 });
    cursor = layout.doc.y + 4;
  }
  if (week.actions?.length) {
    layout.setFont(false, 8.5, KR_V42_COLORS.text);
    layout.doc.text(week.actions.map((item) => `•  ${t(item)}`).join('\n'), x + 8, cursor, {
      width: width - 16,
      lineGap: 2,
    });
  }
}

function drawActionPlan(layout, weeks, leftoverVoice, technical) {
  layout.pageKicker('Plan d’action');
  if (weeks?.length) {
    layout.sectionTitle('Plan 4 semaines');
    const colW = (layout.width - 10) / 2;
    const cards = weeks.slice(0, 4);
    for (let i = 0; i < cards.length; i += 2) {
      const pair = [cards[i], cards[i + 1]].filter(Boolean);
      const heights = pair.map((week) => weekCardHeight(layout, week, colW));
      const rowH = Math.max(...heights);
      layout.ensure(rowH + 8);
      pair.forEach((week, col) => {
        drawWeekCard(
          layout,
          week,
          layout.left + col * (colW + 10),
          layout.y,
          colW,
          rowH,
        );
      });
      layout.y += rowH + 10;
    }
  }

  if (leftoverVoice?.length) {
    layout.sectionTitle('Réponses ouvertes');
    for (const item of leftoverVoice) {
      layout.setFont(false, 9, KR_V42_COLORS.text);
      layout.doc.text(`« ${t(item.verbatim)} »`, layout.left, layout.y, { width: layout.width });
      layout.y = layout.doc.y + 6;
    }
  }

  const rows = [
    ['Questionnaire', technical?.questionnaireVersion],
    ['Ruleset', technical?.rulesetVersion],
    ['Modèle de rapport', technical?.reportModelVersion],
    ['Version d’analyse', technical?.analysisVersion != null ? String(technical.analysisVersion) : ''],
    ['Soumission', formatPdfDate(technical?.submittedAt)],
    ['Analyse', formatPdfDate(technical?.analyzedAt)],
  ].filter(([, value]) => value);
  if (!rows.length && !technical?.contentHash) return;
  layout.ensure(54);
  layout.sectionTitle('Traçabilité');
  const line = rows.map(([label, value]) => `${label} : ${value}`).join('   ·   ');
  layout.setFont(false, 7.5, KR_V42_COLORS.muted);
  layout.doc.text(t(line), layout.left, layout.y, { width: layout.width, lineGap: 2 });
  layout.y = layout.doc.y + 4;
  if (technical?.contentHash) {
    layout.setFont(false, 6.5, KR_V42_COLORS.muted);
    layout.doc.text(t(`Empreinte : ${technical.contentHash}`), layout.left, layout.y, {
      width: layout.width,
    });
  }
}

export async function renderCoachReportPdfV42Kr({ display, generatedAt = new Date() } = {}) {
  const vm = display || {};
  const logoPath = resolvePdfAsset(KR_V42_BRAND.logoRelativePaths);
  const doc = new PDFDocument({
    size: KR_V42_PAGE.size,
    bufferPages: true,
    autoFirstPage: true,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  doc.info.Title = `Profil motivationnel — ${vm.clientName || 'Client'}`;
  doc.info.Author = KR_V42_BRAND.name;
  doc.info.Subject = 'Rapport Coach KR Kinetics';
  doc.info.Creator = 'KR Kinetics';
  doc.registerFont(PDF_FONTS.regular, resolveFontFile('Roboto-Regular.ttf'));
  doc.registerFont(PDF_FONTS.bold, resolveFontFile('Roboto-Bold.ttf'));

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const layout = new KrLayout(doc, {
    logoPath,
    clientName: vm.clientName,
    generatedAt,
  });
  const voice = vm.verbatims || [];
  const nutrition = splitNutritionBlocks(vm.nutrition);
  const hasPortrait = Boolean(vm.dimensions?.length);
  const hasInterview = Boolean(
    vm.coachPriorities?.length || vm.vigilance?.length || vm.interviewQuestions?.length || voice.length,
  );
  const hasNutrition = Boolean(nutrition);
  const hasPlan = Boolean(vm.fourWeekPlan?.length || vm.technical || vm.provenance);

  drawPage1(layout, vm, logoPath);
  if (hasPortrait) {
    layout.addPage('portrait');
    drawPortrait(layout, vm.dimensions);
    layout.record('portrait');
  }
  if (hasInterview) {
    layout.addPage('interview');
    drawInterviewPrep(layout, vm);
    layout.record('interview');
  }
  if (hasNutrition) {
    layout.addPage('nutrition');
    drawNutritionStrategy(layout, vm.nutrition);
    layout.record('nutrition');
  }
  if (hasPlan) {
    layout.addPage('plan');
    drawActionPlan(layout, vm.fourWeekPlan, [], vm.technical || vm.provenance);
    layout.record('plan');
  }
  const last = layout.pageStats[layout.pageStats.length - 1];
  if (last) last.usedHeight = Math.max(last.usedHeight, layout.y);

  const pageCount = doc.bufferedPageRange().count;
  layout.drawFooters(pageCount);
  doc.end();
  const buffer = await done;
  if (layout.overflows.length && (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development')) {
    throw new Error(`PDF layout overflow: ${layout.overflows[0].text}`);
  }
  return {
    buffer,
    pageCount,
    renderer: MOTIVATION_PDF_RENDERER_ID,
    logoPath,
    logoPlacements: layout.logoPlacements,
    pageStats: layout.pageStats,
  };
}
