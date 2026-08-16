/**
 * Current KR Kinetics PDF renderer for report-model-v4.2.
 * Presentation only. Does not score, run rules, or invent interpretation.
 */

import PDFDocument from 'pdfkit';
import { resolveFontFile, resolvePdfAsset } from './components/layout.mjs';
import { PDF_FONTS } from './theme.mjs';
import { KR_V42_BRAND, KR_V42_COLORS, KR_V42_PAGE, KR_V42_TYPE } from './theme-v42-kr.mjs';

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
    if (needed > this.remaining()) this.addPage();
  }

  addPage() {
    this.doc.addPage();
    this.page += 1;
    this.drawHeader();
    this.y = KR_V42_PAGE.headerHeight + 10;
  }

  drawHeader() {
    const { logoPath, clientName } = this.meta;
    if (logoPath) {
      try {
        this.doc.image(logoPath, this.left, 10, { width: 58 });
        this.logoPlacements.push({ page: this.page, role: 'header' });
      } catch {
        // keep header text if the asset cannot be painted
      }
    }
    this.setFont(true, 8, KR_V42_COLORS.primary);
    this.doc.text(t(KR_V42_BRAND.reportTitle), this.left + 92, 12, {
      width: 280,
      lineBreak: false,
    });
    this.setFont(false, 7.5, KR_V42_COLORS.muted);
    this.doc.text(t(clientName || 'Profil motivationnel'), this.left + 92, 22, {
      width: 280,
      lineBreak: false,
    });
    this.doc
      .moveTo(this.left, 34)
      .lineTo(this.left + this.width, 34)
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

  text(value, options = {}) {
    const text = t(value);
    if (!text) return;
    const size = options.size ?? KR_V42_TYPE.body;
    const bold = options.bold === true;
    const color = options.color ?? KR_V42_COLORS.text;
    const width = options.width ?? this.width;
    const x = options.x ?? this.left;
    const lineGap = options.lineGap ?? 2;
    this.setFont(bold, size, color);
    const height = this.doc.heightOfString(text, { width, lineGap });
    this.ensure(height + 2);
    if (this.y + height > this.bottom + 0.5) {
      this.overflows.push({ page: this.page, text: text.slice(0, 48) });
    }
    this.doc.text(text, x, this.y, { width, lineGap, align: options.align });
    this.y = this.doc.y + (options.gapAfter ?? 4);
  }

  sectionTitle(title) {
    const height = 22;
    this.ensure(height + 56);
    this.setFont(true, KR_V42_TYPE.section, KR_V42_COLORS.primary);
    this.doc.text(t(title).toUpperCase(), this.left, this.y, { width: this.width });
    const ruleY = this.doc.y + 3;
    this.doc
      .moveTo(this.left, ruleY)
      .lineTo(this.left + 36, ruleY)
      .strokeColor(KR_V42_COLORS.accent)
      .lineWidth(1.6)
      .stroke();
    this.y = ruleY + 10;
  }

  card(draw, minHeight = 36) {
    this.ensure(minHeight);
    const start = this.y;
    this.y += 8;
    draw();
    const height = Math.max(minHeight, this.y - start + 4);
    this.doc
      .save()
      .roundedRect(this.left, start, this.width, height, 6)
      .strokeColor(KR_V42_COLORS.border)
      .lineWidth(0.8)
      .stroke()
      .restore();
    this.y = start + height + 8;
  }
}

function drawHero(layout, display, logoPath) {
  if (logoPath) {
    try {
      const logoWidth = 150;
      const logoHeight = logoWidth * (302 / 993);
      layout.doc.image(logoPath, layout.left, layout.y, { width: logoWidth });
      layout.logoPlacements.push({ page: layout.page, role: 'hero' });
      layout.y += logoHeight + 12;
    } catch {
      // title still renders without the mark
    }
  }
  layout.text(KR_V42_BRAND.reportTitle.toUpperCase(), {
    bold: true,
    size: 16,
    color: KR_V42_COLORS.primary,
    gapAfter: 2,
  });
  layout.text(KR_V42_BRAND.reportSubtitle, {
    size: 10,
    color: KR_V42_COLORS.muted,
    gapAfter: 8,
  });
  layout.text(`Client : ${display.clientName || 'Client'}`, {
    bold: true,
    size: 12,
    color: KR_V42_COLORS.text,
    gapAfter: 3,
  });
  if (display.submittedAt) {
    layout.text(`Soumis : ${formatPdfDate(display.submittedAt)}`, {
      size: KR_V42_TYPE.meta,
      color: KR_V42_COLORS.muted,
      gapAfter: 2,
    });
  }
  if (display.analyzedAt) {
    layout.text(`Analysé : ${formatPdfDate(display.analyzedAt)}`, {
      size: KR_V42_TYPE.meta,
      color: KR_V42_COLORS.muted,
      gapAfter: 2,
    });
  }
  if (display.analysisVersion != null) {
    layout.text(`Analyse : v${display.analysisVersion}`, {
      size: KR_V42_TYPE.meta,
      color: KR_V42_COLORS.accent,
      bold: true,
      gapAfter: 10,
    });
  } else {
    layout.gap(6);
  }
}

function formatPdfDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('fr-CA', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function drawQuickRead(layout, items) {
  if (!items?.length) return;
  layout.sectionTitle('Lecture rapide');
  const colW = (layout.width - 10) / 2;
  const rowH = 46;
  for (let i = 0; i < items.length; i += 2) {
    layout.ensure(rowH + 8);
    const y = layout.y;
    const pair = [items[i], items[i + 1]].filter(Boolean);
    pair.forEach((item, col) => {
      const x = layout.left + col * (colW + 10);
      layout.doc
        .roundedRect(x, y, colW, rowH, 5)
        .fillAndStroke(KR_V42_COLORS.bg, KR_V42_COLORS.border);
      layout.setFont(true, 7.5, KR_V42_COLORS.muted);
      layout.doc.text(t(item.label).toUpperCase(), x + 8, y + 7, { width: colW - 16 });
      layout.setFont(true, 9.5, KR_V42_COLORS.primary);
      layout.doc.text(t(item.value), x + 8, y + 20, { width: colW - 16, lineGap: 1 });
    });
    layout.y = y + rowH + 8;
  }
}

function drawSummary(layout, lines) {
  if (!lines?.length) return;
  layout.sectionTitle('Synthèse');
  for (const line of lines.slice(0, 4)) {
    layout.text(line, { size: 10, lineGap: 3, gapAfter: 6 });
  }
}

function drawPriorities(layout, items) {
  if (!items?.length) return;
  layout.sectionTitle('Priorités Coach');
  items.slice(0, 5).forEach((item, index) => {
    const text = t(item);
    const h = Math.max(22, layout.heightOf(text, layout.width - 28, { size: 9.5 }) + 10);
    layout.ensure(h + 6);
    const y = layout.y;
    layout.doc.circle(layout.left + 8, y + 8, 7).fill(KR_V42_COLORS.primary);
    layout.setFont(true, 8, KR_V42_COLORS.white);
    layout.doc.text(String(index + 1), layout.left + 4, y + 4, { width: 8, align: 'center' });
    layout.setFont(false, 9.5, KR_V42_COLORS.text);
    layout.doc.text(text, layout.left + 24, y + 2, { width: layout.width - 24, lineGap: 2 });
    layout.y = Math.max(layout.doc.y, y + h) + 6;
  });
}

function drawVigilance(layout, items) {
  if (!items?.length) return;
  layout.sectionTitle('Points de vigilance');
  for (const item of items) {
    const text = t(item);
    const h = Math.max(24, layout.heightOf(text, layout.width - 16, { size: 9.5 }) + 12);
    layout.ensure(h + 6);
    const y = layout.y;
    layout.doc.rect(layout.left, y, 3, h).fill(KR_V42_COLORS.accent);
    layout.doc.roundedRect(layout.left + 3, y, layout.width - 3, h, 3).fill(KR_V42_COLORS.bg);
    layout.setFont(false, 9.5, KR_V42_COLORS.text);
    layout.doc.text(text, layout.left + 12, y + 5, { width: layout.width - 20, lineGap: 2 });
    layout.y = y + h + 6;
  }
}

function drawInterview(layout, items) {
  if (!items?.length) return;
  layout.sectionTitle('À clarifier en entrevue');
  for (const item of items) {
    const text = t(item);
    const h = Math.max(16, layout.heightOf(text, layout.width - 20, { size: 9.5 }) + 4);
    layout.ensure(h + 4);
    layout.doc
      .rect(layout.left, layout.y + 2, 8, 8)
      .strokeColor(KR_V42_COLORS.primary)
      .lineWidth(1)
      .stroke();
    layout.setFont(false, 9.5, KR_V42_COLORS.text);
    layout.doc.text(text, layout.left + 16, layout.y, { width: layout.width - 16, lineGap: 2 });
    layout.y = Math.max(layout.doc.y, layout.y + h) + 5;
  }
}

function drawDimensions(layout, dimensions) {
  if (!dimensions?.length) return;
  layout.sectionTitle('Dimensions');
  for (const row of dimensions) {
    const score = row.score;
    const labelH = layout.heightOf(row.label, layout.width - 48, { bold: true, size: 9 });
    layout.ensure(labelH + 22);
    layout.setFont(true, 9, KR_V42_COLORS.text);
    layout.doc.text(t(row.label), layout.left, layout.y, { width: layout.width - 48 });
    layout.setFont(true, 10, KR_V42_COLORS.primary);
    layout.doc.text(score == null || score === '' ? '—' : String(score), layout.left, layout.y, {
      width: layout.width,
      align: 'right',
    });
    layout.y += labelH + 3;
    const n = Number(score);
    const pct = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) / 100 : 0;
    layout.doc.roundedRect(layout.left, layout.y, layout.width, 7, 3).fill(KR_V42_COLORS.bg);
    if (pct > 0) {
      layout.doc.roundedRect(layout.left, layout.y, Math.max(2, layout.width * pct), 7, 3).fill(KR_V42_COLORS.primary);
    }
    layout.y += 11;
    if (row.evidenceBadge) {
      layout.text(row.evidenceBadge, {
        size: 7.5,
        color: KR_V42_COLORS.muted,
        gapAfter: 8,
      });
    } else {
      layout.gap(6);
    }
  }
}

function drawNutrition(layout, nutrition) {
  if (!nutrition) return;
  const has = nutrition.lecture?.length || nutrition.structure || nutrition.obstacles?.length || nutrition.actions?.length;
  if (!has) return;
  layout.sectionTitle('Nutrition');
  if (nutrition.lecture?.length) {
    layout.text('Lecture nutrition', { bold: true, size: 9, color: KR_V42_COLORS.primary, gapAfter: 3 });
    for (const line of nutrition.lecture) layout.text(line, { gapAfter: 5 });
  }
  if (nutrition.structure) {
    layout.text('Structure suggérée', { bold: true, size: 9, color: KR_V42_COLORS.primary, gapAfter: 3 });
    layout.text(nutrition.structure, { gapAfter: 5 });
  }
  if (nutrition.obstacles?.length) {
    layout.text('Obstacles', { bold: true, size: 9, color: KR_V42_COLORS.primary, gapAfter: 3 });
    for (const item of nutrition.obstacles) layout.text(`• ${item}`, { gapAfter: 3 });
  }
  if (nutrition.actions?.length) {
    layout.text('Actions prioritaires', { bold: true, size: 9, color: KR_V42_COLORS.primary, gapAfter: 3 });
    for (const item of nutrition.actions) layout.text(`• ${item}`, { gapAfter: 3 });
  }
}

function drawWeeks(layout, weeks) {
  if (!weeks?.length) return;
  layout.sectionTitle('Plan 4 semaines');
  for (const week of weeks) {
    const actions = week.actions || [];
    const body = [week.focus, ...actions].filter(Boolean).join('\n');
    const h = 28 + layout.heightOf(body || ' ', layout.width - 16, { size: 9 });
    layout.ensure(Math.min(h, 80));
    layout.text(week.title || `Semaine ${week.week}`, {
      bold: true,
      size: 10,
      color: KR_V42_COLORS.primary,
      gapAfter: 2,
    });
    if (week.focus) {
      layout.text(week.focus, { size: 9, color: KR_V42_COLORS.muted, gapAfter: 4 });
    }
    for (const action of actions) {
      layout.text(`• ${action}`, { size: 9.5, gapAfter: 3 });
    }
    layout.gap(6);
  }
}

function drawVerbatims(layout, items) {
  if (!items?.length) return;
  layout.sectionTitle('Réponses ouvertes');
  for (const item of items) {
    const quote = `« ${item.verbatim} »`;
    const h = 28 + layout.heightOf(quote, layout.width - 16, { size: 9.5 });
    layout.ensure(Math.min(h, 70));
    layout.text('VERBATIM CLIENT', {
      bold: true,
      size: 7.5,
      color: KR_V42_COLORS.muted,
      gapAfter: 3,
    });
    layout.text(quote, { size: 9.5, gapAfter: 3 });
    layout.text(`Question source : ${item.questionText || item.questionCode}`, {
      size: 8,
      color: KR_V42_COLORS.muted,
      gapAfter: 10,
    });
  }
}

function drawTechnical(layout, technical) {
  const rows = [
    ['Questionnaire', technical?.questionnaireVersion],
    ['Ruleset', technical?.rulesetVersion],
    ['Modèle de rapport', technical?.reportModelVersion],
    ['Version d’analyse', technical?.analysisVersion != null ? String(technical.analysisVersion) : ''],
    ['Empreinte', technical?.contentHash],
    ['Soumission', formatPdfDate(technical?.submittedAt)],
    ['Analyse', formatPdfDate(technical?.analyzedAt)],
  ].filter(([, value]) => value);
  if (!rows.length) return;
  layout.ensure(120);
  layout.sectionTitle('Informations techniques');
  for (const [label, value] of rows) {
    layout.text(`${label} : ${value}`, { size: 8, color: KR_V42_COLORS.muted, gapAfter: 3 });
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
  layout.y = 36;
  drawHero(layout, vm, logoPath);
  drawQuickRead(layout, vm.quickRead);
  drawSummary(layout, vm.summary);
  drawPriorities(layout, vm.coachPriorities);
  if (vm.vigilance?.length || vm.interviewQuestions?.length || vm.dimensions?.length) {
    layout.addPage();
  }
  drawVigilance(layout, vm.vigilance);
  drawInterview(layout, vm.interviewQuestions);
  drawDimensions(layout, vm.dimensions);
  drawNutrition(layout, vm.nutrition);
  drawWeeks(layout, vm.fourWeekPlan);
  drawVerbatims(layout, vm.verbatims);
  drawTechnical(layout, vm.technical || vm.provenance);

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
  };
}
