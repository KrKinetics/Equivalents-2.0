/**
 * KR Kinetics PDF renderer for report-model-v4.4.
 * Formats the canonical presentation model. Identity is required.
 * Renderers format. They do not summarize, rescore, or drop substance.
 */

import PDFDocument from 'pdfkit';
import { resolveFontFile, resolvePdfAsset } from './components/layout.mjs';
import { PDF_FONTS } from './theme.mjs';
import { KR_V42_BRAND, KR_V42_COLORS, KR_V42_PAGE, KR_V42_TYPE } from './theme-v42-kr.mjs';
import { formatCoachDateTime } from '../report-timestamp.mjs';
import {
  ClientIdentityError,
  pdfDocumentInfo,
} from '../../identity/canonical-client-identity.mjs';
import {
  findingPrimaryLabel,
  findingStatusLabel,
  findingTechnicalDirection,
} from '../../report/presentation-labels.mjs';
import { buildMotivationReportPresentation } from '../../report/build-motivation-report-presentation.mjs';

export const MOTIVATION_PDF_RENDERER_V44_ID = 'renderCoachReportPdfV44Kr';
export const MOTIVATION_PDF_PAGE_GUARD = 20;

export class MotivationPdfPageLimitError extends Error {
  constructor(pageCount) {
    super(`Motivation PDF exceeded the ${MOTIVATION_PDF_PAGE_GUARD}-page QA guard (${pageCount}).`);
    this.name = 'MotivationPdfPageLimitError';
    this.pageCount = pageCount;
  }
}

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
    this.logoPlacements = [];
    this.heroBandHeight = 0;
    this.pageStats = [{ page: 1, usedHeight: 0, blockCount: 0, roles: ['brief'] }];
  }

  setFont(bold = false, size = KR_V42_TYPE.body, color = KR_V42_COLORS.text) {
    this.doc.font(bold ? PDF_FONTS.bold : PDF_FONTS.regular).fontSize(size).fillColor(color);
  }

  heightOf(value, width = this.width, options = {}) {
    this.setFont(options.bold, options.size, options.color);
    return this.doc.heightOfString(t(value), { width, lineGap: options.lineGap ?? 2 });
  }

  remaining() {
    return this.bottom - this.y;
  }

  pageBodyHeight() {
    return this.bottom - (KR_V42_PAGE.headerHeight + 12);
  }

  record(role) {
    const current = this.pageStats[this.page - 1];
    if (!current) return;
    current.blockCount += 1;
    if (role && !current.roles.includes(role)) current.roles.push(role);
    current.usedHeight = Math.max(current.usedHeight, this.y);
  }

  addPage(role = 'content') {
    if (this.page >= MOTIVATION_PDF_PAGE_GUARD) {
      throw new MotivationPdfPageLimitError(this.page + 1);
    }
    const current = this.pageStats[this.page - 1];
    if (current) current.usedHeight = Math.max(current.usedHeight, this.y);
    this.doc.addPage();
    this.page += 1;
    this.pageStats.push({ page: this.page, usedHeight: 0, blockCount: 0, roles: [role] });
    this.drawHeader();
    this.y = KR_V42_PAGE.headerHeight + 12;
    return true;
  }

  ensure(needed) {
    if (needed <= this.remaining()) return true;
    if (needed > this.pageBodyHeight() && this.remaining() >= 36) return true;
    this.addPage();
    return this.remaining() >= Math.min(needed, 16);
  }

  drawHeader() {
    const { logoPath, identity, analysisVersion } = this.meta;
    if (logoPath) {
      try {
        const logoW = 58;
        const logoH = logoW * (302 / 993);
        this.doc.roundedRect(this.left, 10, logoW + 12, logoH + 8, 3).fill(KR_V42_COLORS.primary);
        this.doc.image(logoPath, this.left + 6, 14, { width: logoW });
        this.logoPlacements.push({ page: this.page, role: 'header' });
      } catch { /* keep text */ }
    }
    this.setFont(true, 9, KR_V42_COLORS.primary);
    this.doc.text('Profil motivationnel', this.left + 92, 14, { width: 360, lineBreak: false, height: 12 });
    this.setFont(true, 8.5, KR_V42_COLORS.text);
    const version = analysisVersion != null ? ` · Analyse v${analysisVersion}` : '';
    const ref = identity.shortId ? ` · Réf. ${identity.shortId}` : '';
    this.doc.text(`${t(identity.fullName)}${ref}${version}`, this.left + 92, 26, {
      width: 360,
      lineBreak: false,
      height: 12,
    });
    this.doc.moveTo(this.left, 40).lineTo(this.left + this.width, 40)
      .strokeColor(KR_V42_COLORS.border).lineWidth(0.8).stroke();
  }

  drawFooters(pageCount) {
    const { identity } = this.meta;
    const range = this.doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      this.doc.switchToPage(i);
      this.setFont(false, 8, KR_V42_COLORS.muted);
      const y = KR_V42_PAGE.height - 24;
      this.doc.moveTo(this.left, y - 8).lineTo(this.left + this.width, y - 8)
        .strokeColor(KR_V42_COLORS.border).lineWidth(0.6).stroke();
      this.doc.text(
        `Confidentiel — ${t(identity.fullName)} — Réf. ${identity.shortId} — Page ${i + 1} / ${pageCount}`,
        this.left,
        y,
        { width: this.width, height: 14, lineBreak: false },
      );
    }
  }

  gap(n = 8) { this.y += n; }

  fillCard(x, y, w, h, fill = KR_V42_COLORS.card) {
    this.doc.save().roundedRect(x, y, w, h, 6).fillAndStroke(fill, KR_V42_COLORS.border).restore();
  }

  flowText(value, options = {}) {
    const raw = t(value);
    if (!raw) return;
    const width = options.width ?? this.width;
    const x = options.x ?? this.left;
    const size = options.size ?? KR_V42_TYPE.body;
    const parts = raw.length > 420 ? raw.split(/(?<=[.!?])\s+/) : [raw];
    for (const part of parts.filter(Boolean)) {
      const h = this.heightOf(part, width, { ...options, size });
      if (h > this.remaining() - 2) this.ensure(Math.min(h, this.pageBodyHeight() - 8));
      this.setFont(options.bold, size, options.color || KR_V42_COLORS.text);
      this.doc.text(part, x, this.y, {
        width,
        lineGap: options.lineGap ?? 2,
        align: options.align,
      });
      this.y = this.doc.y + (options.gap ?? 3);
      this.record(options.role);
    }
  }

  sectionTitle(title, role, minAfter = 0) {
    const keepWithNext = Math.max(0, Number(minAfter) || 0);
    this.ensure(72 + keepWithNext);
    this.setFont(true, KR_V42_TYPE.section, KR_V42_COLORS.primary);
    this.doc.text(t(title), this.left, this.y, { width: this.width });
    const ruleY = this.doc.y + 3;
    this.doc.moveTo(this.left, ruleY).lineTo(this.left + 28, ruleY)
      .strokeColor(KR_V42_COLORS.accent).lineWidth(1.8).stroke();
    this.y = ruleY + 8;
    this.record(role || 'section');
  }

  subTitle(title) {
    this.ensure(36);
    this.flowText(title, { bold: true, size: 8.5, color: KR_V42_COLORS.primary, gap: 4, role: 'section' });
  }

  bullets(items) {
    for (const item of items || []) {
      this.flowText(`•  ${t(item)}`, { size: 9.5, lineGap: 2, gap: 3, role: 'list' });
    }
  }

  numbered(items) {
    (items || []).forEach((item, index) => {
      this.flowText(`${index + 1}.  ${t(item)}`, { size: 9.5, lineGap: 2, gap: 3, role: 'list' });
    });
  }
}

function drawIdentityHero(layout, hero, logoPath) {
  const identity = hero.identity || {};
  const line1 = [
    identity.email ? `Courriel : ${identity.email}` : '',
    identity.phone ? `Téléphone : ${identity.phone}` : '',
    identity.serviceType ? `Service : ${identity.serviceType}` : '',
    identity.shortId ? `Référence : ${identity.shortId}` : '',
  ].filter(Boolean).join('   ·   ');
  const line2 = [
    hero.submittedAt ? `Soumis le : ${formatPdfDate(hero.submittedAt)}` : '',
    hero.analyzedAt ? `Analysé le : ${formatPdfDate(hero.analyzedAt)}` : '',
    hero.analysisVersion != null ? `Analyse : v${hero.analysisVersion}` : '',
    hero.reportConfidence?.coachLabel || '',
  ].filter(Boolean).join('   ·   ');
  layout.setFont(true, 22, KR_V42_COLORS.white);
  const nameH = layout.doc.heightOfString(t(identity.fullName), { width: layout.width, lineGap: 1 });
  layout.setFont(false, 7.5, '#d7e0ec');
  const meta1H = line1 ? layout.doc.heightOfString(t(line1), { width: layout.width, lineGap: 2 }) : 0;
  const meta2H = line2 ? layout.doc.heightOfString(t(line2), { width: layout.width, lineGap: 2 }) : 0;
  const logoH = logoPath ? 150 * (302 / 993) : 0;
  const bandH = 14 + logoH + 8 + 12 + 16 + 12 + nameH + 10 + meta1H + (meta2H ? meta2H + 3 : 0) + 14;
  layout.heroBandHeight = bandH;
  layout.doc.rect(0, 0, KR_V42_PAGE.width, bandH).fill(KR_V42_COLORS.primary);
  let y = 14;
  if (logoPath) {
    try {
      layout.doc.image(logoPath, layout.left, y, { width: 150 });
      layout.logoPlacements.push({ page: 1, role: 'hero' });
      y += logoH + 8;
    } catch {
      y += 8;
    }
  }
  layout.setFont(true, 8, '#d7e0ec');
  layout.doc.text('RAPPORT COACH', layout.left, y, { width: layout.width, height: 12 });
  y = layout.doc.y + 1;
  layout.setFont(true, 11, KR_V42_COLORS.white);
  layout.doc.text('PROFIL MOTIVATIONNEL', layout.left, y, { width: layout.width, height: 16 });
  y = layout.doc.y + 8;
  layout.setFont(true, 7, '#d7e0ec');
  layout.doc.text('ATHLÈTE', layout.left, y, { width: layout.width, height: 10 });
  y = layout.doc.y + 2;
  layout.setFont(true, 22, KR_V42_COLORS.white);
  layout.doc.text(t(identity.fullName), layout.left, y, { width: layout.width, lineGap: 1, height: nameH + 2 });
  y = layout.doc.y + 8;
  layout.setFont(false, 7.5, '#d7e0ec');
  if (line1) {
    layout.doc.text(t(line1), layout.left, y, { width: layout.width, lineGap: 2, height: meta1H + 2 });
    y = layout.doc.y + 3;
  }
  if (line2) {
    layout.doc.text(t(line2), layout.left, y, { width: layout.width, lineGap: 2, height: meta2H + 2 });
    y = layout.doc.y + 4;
  }
  layout.y = Math.max(bandH + 10, y + 10);
  layout.record('hero');
}

function drawFindingRow(layout, row) {
  const label = t(row.label);
  const primary = row.displayLabel || findingPrimaryLabel(row);
  const status = row.confidenceStatus || row.evidenceBadge || findingStatusLabel(row);
  const technical = row.technicalDirection || findingTechnicalDirection(row);
  const meaning = t(row.coachMeaning || row.interpretation || '');
  const meta = [primary, status].filter(Boolean).join('  ·  ');
  const needed = 28
    + layout.heightOf(label, layout.width - 160, { bold: true, size: 8.5 })
    + (technical ? layout.heightOf(technical, layout.width, { size: 7 }) : 0)
    + (meaning ? layout.heightOf(meaning, layout.width, { size: 7.5 }) : 0);
  layout.ensure(Math.min(needed, 80));
  const start = layout.y;
  layout.setFont(true, 8.5, KR_V42_COLORS.text);
  layout.doc.text(label, layout.left, start, { width: layout.width - 160 });
  layout.setFont(true, 8, KR_V42_COLORS.primary);
  layout.doc.text(meta, layout.left + layout.width - 155, start, { width: 155, align: 'right' });
  layout.y = Math.max(layout.doc.y, start) + 2;
  if (technical) layout.flowText(technical, { size: 7, color: KR_V42_COLORS.muted, gap: 2, role: 'factors' });
  if (meaning) layout.flowText(meaning, { size: 7.5, color: KR_V42_COLORS.muted, gap: 3, role: 'factors' });
  const n = Number(row.technicalScore ?? row.rawScore);
  const pct = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) / 100 : 0;
  const barColor = row.signalDirection === 'risk' ? KR_V42_COLORS.accent : KR_V42_COLORS.primary;
  layout.ensure(10);
  layout.doc.roundedRect(layout.left, layout.y, layout.width, 4, 2).fill(KR_V42_COLORS.bg);
  if (pct > 0) layout.doc.roundedRect(layout.left, layout.y, Math.max(2, layout.width * pct), 4, 2).fill(barColor);
  layout.y += 10;
  layout.record('factors');
}

function drawFlowingCard(layout, title, lines, role) {
  const body = (lines || []).filter(Boolean).join('\n');
  if (!title && !body) return;
  const h = 22 + (body ? layout.heightOf(body, layout.width - 20, { size: 8.5, lineGap: 2 }) : 0);
  if (h + 6 <= layout.remaining() && h <= layout.pageBodyHeight() - 8) {
    layout.fillCard(layout.left, layout.y, layout.width, h, KR_V42_COLORS.bg);
    const start = layout.y;
    layout.setFont(true, 8, KR_V42_COLORS.primary);
    layout.doc.text(t(title), layout.left + 10, start + 6, { width: layout.width - 20 });
    layout.y = start + 18;
    if (body) {
      layout.setFont(false, 8.5, KR_V42_COLORS.text);
      layout.doc.text(t(body), layout.left + 10, layout.y, { width: layout.width - 20, lineGap: 2 });
      layout.y = layout.doc.y + 8;
    }
    layout.y = Math.max(layout.y, start + h + 6);
    layout.record(role);
    return;
  }
  layout.subTitle(title);
  if (body) layout.flowText(body, { size: 8.5, lineGap: 2, gap: 6, role });
}

function drawQuickRead(layout, section) {
  layout.sectionTitle(section.title, 'quick-read');
  for (const item of section.items || []) {
    const why = item.justification ? `\n${item.justification}` : '';
    drawFlowingCard(layout, `${item.label} : ${item.value}`, why ? [item.justification] : [], 'quick-read');
  }
}

function drawDecisionBrief(layout, section) {
  layout.sectionTitle(section.title, 'brief');
  if (section.athleteGoal) {
    layout.subTitle('Objectif de l\'athlète');
    layout.flowText(`« ${section.athleteGoal} »`, { size: 10, gap: 6, role: 'brief' });
  }
  if (section.successDescribed) {
    layout.subTitle('Réussite décrite');
    layout.flowText(`« ${section.successDescribed} »`, { size: 10, gap: 6, role: 'brief' });
  }
  layout.subTitle('Pourquoi maintenant');
  layout.flowText(section.whyNow, { size: 10, gap: 6, role: 'brief' });
  if (section.startActions?.length) {
    layout.subTitle('Dès le départ');
    layout.numbered(section.startActions);
  }
  if (section.avoidAtStart?.length) {
    layout.subTitle('À éviter au départ');
    layout.bullets(section.avoidAtStart);
  }
  if (section.confirmNow?.length) {
    layout.subTitle('À confirmer');
    layout.bullets(section.confirmNow);
  }
}

function drawPortrait(layout, section) {
  layout.sectionTitle(section.title, 'portrait');
  for (const item of section.items || []) {
    layout.subTitle(item.title);
    for (const line of item.paragraphs || []) {
      layout.flowText(line, { size: 9.5, lineGap: 3, gap: 5, role: 'portrait' });
    }
  }
}

function drawOperatingBrief(layout, section) {
  layout.sectionTitle(section.title, 'operating');
  for (const [label, value] of section.rows || []) {
    layout.ensure(28);
    layout.subTitle(label);
    layout.flowText(value, { size: 9, gap: 6, role: 'operating' });
  }
}

function drawNarrative(layout, section) {
  layout.sectionTitle(section.title, 'narrative');
  for (const part of section.parts || []) {
    layout.subTitle(part.title);
    for (const line of part.paragraphs || []) {
      layout.flowText(line, { size: 9.5, lineGap: 3, gap: 6, role: 'narrative' });
    }
  }
}

function drawInterview(layout, section) {
  layout.sectionTitle(section.title, 'interview');
  for (const item of section.items || []) {
    const text = item.text || item;
    const why = item.whyItMatters ? ` — ${item.whyItMatters}` : '';
    layout.flowText(`•  ${text}${why}`, { size: 9.5, lineGap: 2, gap: 4, role: 'interview' });
  }
}

function drawRisks(layout, section) {
  layout.sectionTitle(section.title, 'risks');
  for (const [title, items] of section.buckets || []) {
    layout.subTitle(title);
    layout.bullets(items);
  }
  for (const item of section.conflicts || []) {
    const lines = [
      item.sourceA ? `Source A. ${item.sourceA}` : '',
      item.sourceB ? `Source B. ${item.sourceB}` : '',
      item.coachImplication || '',
      item.validationQuestion || '',
    ].filter(Boolean);
    drawFlowingCard(layout, item.title || 'CONTRADICTION À CLARIFIER', lines, 'risks');
  }
}

function drawVerbatims(layout, section) {
  layout.sectionTitle(section.title, 'voice');
  for (const item of section.items || []) {
    const lines = [
      `« ${t(item.verbatim)} »`,
      item.questionText || item.questionCode ? `Question source : ${item.questionText || item.questionCode}` : '',
      item.whyItMatters ? `Pourquoi c'est important : ${item.whyItMatters}` : '',
    ].filter(Boolean);
    drawFlowingCard(layout, 'Voix de l\'athlète', lines, 'voice');
  }
}

function drawDimensions(layout, section, appendix = false) {
  layout.sectionTitle(section.title, appendix ? 'appendix' : 'factors');
  if (appendix) {
    for (const group of section.groups || []) {
      layout.subTitle(group.title);
      for (const row of group.items || []) drawFindingRow(layout, row);
    }
    return;
  }
  for (const row of section.factors || []) drawFindingRow(layout, row);
}

function drawNutrition(layout, section) {
  layout.sectionTitle(section.title, 'nutrition');
  if (section.action?.cards?.length) {
    for (const card of section.action.cards) {
      const lines = [
        card.athleteSaid ? `Ce que l'athlète a dit. ${card.athleteSaid}` : '',
        card.suggested ? `Ce que ça suggère. ${card.suggested}` : '',
        card.toTest ? `À tester. ${card.toTest}` : '',
      ].filter(Boolean);
      drawFlowingCard(layout, `${card.title}  ·  ${card.stance || ''}`, lines, 'nutrition');
    }
    return;
  }
  const organized = section.organized || {};
  const nutrition = section.nutrition || {};
  if (organized.evidenceNote) {
    layout.flowText(organized.evidenceNote, { size: 8, color: KR_V42_COLORS.muted, gap: 6, role: 'nutrition' });
  }
  const blocks = [
    ['Ce que l\'athlète a dit', organized.said],
    ['Ce que ça suggère', organized.suggested?.length ? organized.suggested : nutrition.lecture],
    ['À confirmer', organized.confirm],
    ['Structure suggérée', nutrition.structure && !organized.confirm?.length ? [nutrition.structure] : []],
    ['À tester', organized.test?.length ? organized.test : nutrition.actions],
    ['Obstacles', organized.obstacles?.length ? organized.obstacles : nutrition.obstacles],
  ].filter(([, items]) => items?.length);
  for (const [title, items] of blocks) {
    layout.subTitle(title);
    layout.bullets(items);
  }
}

function weekCardTitle(week) {
  const number = t(week?.week).trim();
  const raw = t(week?.title).trim();
  const clean = raw.replace(/^Semaine\s+\d+\s*(?:[—–-]\s*)?/i, '').trim();
  return clean ? `Semaine ${number} — ${clean}` : `Semaine ${number}`;
}

function drawPlan(layout, section) {
  layout.sectionTitle(section.title, 'plan', 130);
  if (!section.testable) {
    layout.flowText('Plan issu de l\'analyse historique', { size: 8, color: KR_V42_COLORS.muted, gap: 6, role: 'plan' });
  }
  for (const week of section.weeks || []) {
    const lines = section.testable
      ? [
        week.objective ? `Objectif : ${week.objective}` : '',
        week.coachAction ? `Action Coach : ${week.coachAction}` : '',
        week.observe ? `Ce qu'on observe : ${week.observe}` : '',
        week.validationCriterion ? `Critère de validation : ${week.validationCriterion}` : '',
      ]
      : [
        week.objective || week.focus,
        ...(week.actions || []),
        week.observe ? `Observer : ${week.observe}` : '',
        week.validationCriterion ? `Validation : ${week.validationCriterion}` : '',
      ];
    drawFlowingCard(layout, weekCardTitle(week), lines.filter(Boolean), 'plan');
  }
}

function drawTechnical(layout, section) {
  layout.sectionTitle(section.title, 'trace');
  const line = (section.rows || []).map(([label, value]) => {
    const display = (label === 'Soumission' || label === 'Analyse') && value
      ? formatPdfDate(value) || value
      : value;
    return `${label} : ${display}`;
  }).join('   ·   ');
  layout.flowText(line, { size: 8, color: KR_V42_COLORS.muted, gap: 3, role: 'trace' });
}

function drawSection(layout, section) {
  if (!section) return;
  if (section.kind === 'quick-read') return drawQuickRead(layout, section);
  if (section.kind === 'decision-brief') return drawDecisionBrief(layout, section);
  if (section.kind === 'portrait') return drawPortrait(layout, section);
  if (section.kind === 'operating-brief') return drawOperatingBrief(layout, section);
  if (section.kind === 'narrative') return drawNarrative(layout, section);
  if (section.kind === 'numbered-list') {
    layout.sectionTitle(section.title, 'priorities');
    layout.numbered(section.items);
    return;
  }
  if (section.kind === 'risk-buckets') return drawRisks(layout, section);
  if (section.kind === 'interview') return drawInterview(layout, section);
  if (section.kind === 'verbatims') return drawVerbatims(layout, section);
  if (section.kind === 'dimensions') return drawDimensions(layout, section, false);
  if (section.kind === 'nutrition') return drawNutrition(layout, section);
  if (section.kind === 'plan') return drawPlan(layout, section);
  if (section.kind === 'dimension-appendix') return drawDimensions(layout, section, true);
  if (section.kind === 'technical') return drawTechnical(layout, section);
}

export async function renderCoachReportPdfV44Kr({ display, presentation = null, generatedAt = new Date() } = {}) {
  const vm = display || {};
  if (!vm.identity?.fullName || !vm.identity?.shortId) {
    throw new ClientIdentityError('client_identity_missing');
  }
  const model = presentation || buildMotivationReportPresentation(vm);
  const logoPath = resolvePdfAsset(KR_V42_BRAND.logoRelativePaths);
  const info = pdfDocumentInfo(vm.identity, vm.analysisVersion);
  const doc = new PDFDocument({
    size: KR_V42_PAGE.size,
    bufferPages: true,
    autoFirstPage: true,
    margins: { top: 0, bottom: KR_V42_PAGE.footerHeight, left: 0, right: 0 },
    info,
  });
  doc.info.Title = info.Title;
  doc.info.Author = info.Author;
  doc.info.Subject = info.Subject;
  doc.info.Creator = info.Creator;
  doc.info.Producer = info.Producer;
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
    identity: vm.identity,
    analysisVersion: vm.analysisVersion,
    generatedAt,
  });

  drawIdentityHero(layout, model.hero, logoPath);
  for (const section of model.sections) {
    drawSection(layout, section);
  }
  const last = layout.pageStats[layout.pageStats.length - 1];
  if (last) last.usedHeight = Math.max(last.usedHeight, layout.y);

  const pageCount = doc.bufferedPageRange().count;
  if (pageCount > MOTIVATION_PDF_PAGE_GUARD) {
    throw new MotivationPdfPageLimitError(pageCount);
  }
  layout.drawFooters(pageCount);
  doc.end();
  const buffer = await done;
  return {
    buffer,
    pageCount,
    renderer: MOTIVATION_PDF_RENDERER_V44_ID,
    logoPath,
    logoPlacements: layout.logoPlacements,
    heroBandHeight: layout.heroBandHeight,
    pageStats: layout.pageStats,
    presentation: model,
  };
}
