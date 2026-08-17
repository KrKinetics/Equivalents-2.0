/**
 * KR Kinetics PDF renderer for report-model-v4.4.
 * Coach decision dossier. Identity is required. Presentation only.
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
  hasNutritionContent,
  isTestableFourWeekPlan,
} from '../../report/presentation-labels.mjs';

export const MOTIVATION_PDF_RENDERER_V44_ID = 'renderCoachReportPdfV44Kr';

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
    this.locked = false;
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

  ensure(needed) {
    if (this.locked) return this.remaining() >= needed;
    if (this.page >= 5) return this.remaining() >= needed;
    if (needed > this.remaining()) this.addPage();
    return this.remaining() >= Math.min(needed, 12);
  }

  safeText(value, x, y, options = {}) {
    const width = options.width ?? this.width;
    const maxH = Math.max(0, this.bottom - y - 2);
    if (maxH < 8) return y;
    this.setFont(options.bold, options.size, options.color);
    this.doc.text(t(value), x, y, {
      width,
      lineGap: options.lineGap ?? 2,
      height: maxH,
      align: options.align,
      lineBreak: options.lineBreak,
    });
    return this.doc.y;
  }

  lockPage() { this.locked = true; }
  unlockPage() { this.locked = false; }

  record(role) {
    const current = this.pageStats[this.page - 1];
    if (!current) return;
    current.blockCount += 1;
    if (role && !current.roles.includes(role)) current.roles.push(role);
    current.usedHeight = Math.max(current.usedHeight, this.y);
  }

  continueIfRoom(minNeeded = 120) {
    const usable = this.bottom - (this.page === 1 ? 12 : KR_V42_PAGE.headerHeight + 12);
    if (this.remaining() >= minNeeded && this.remaining() / usable > 0.22) return true;
    return this.addPage();
  }

  addPage(role = 'content') {
    if (this.locked || this.page >= 5) return false;
    const already = this.doc.bufferedPageRange().count;
    if (already >= 5) {
      this.page = already;
      return false;
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
    this.setFont(true, 9, KR_V42_COLORS.text);
    const version = analysisVersion != null ? ` · Analyse v${analysisVersion}` : '';
    this.doc.text(`${t(identity.fullName)}${version}`, this.left + 92, 26, {
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

  pageKicker(title) {
    this.setFont(true, KR_V42_TYPE.kicker, KR_V42_COLORS.accent);
    this.doc.text(t(title).toUpperCase(), this.left, this.y, { width: this.width, height: 14 });
    this.y = this.doc.y + 4;
  }

  sectionTitle(title) {
    if (!this.ensure(56)) return;
    this.setFont(true, KR_V42_TYPE.section, KR_V42_COLORS.primary);
    this.doc.text(t(title), this.left, this.y, { width: this.width, height: 18 });
    const ruleY = this.doc.y + 3;
    this.doc.moveTo(this.left, ruleY).lineTo(this.left + 28, ruleY)
      .strokeColor(KR_V42_COLORS.accent).lineWidth(1.8).stroke();
    this.y = ruleY + 8;
  }

  bullets(items, limit = 5) {
    for (const item of (items || []).slice(0, limit)) {
      const text = t(item);
      const h = this.heightOf(`•  ${text}`, this.width, { size: 9.5, lineGap: 2 }) + 4;
      if (!this.ensure(h)) break;
      this.y = this.safeText(`•  ${text}`, this.left, this.y, { size: 9.5, lineGap: 2 }) + 3;
    }
  }
}

function drawIdentityHero(layout, vm, logoPath) {
  const identity = vm.identity;
  const line1 = [
    identity.email ? `Courriel : ${identity.email}` : '',
    identity.phone ? `Téléphone : ${identity.phone}` : '',
    identity.serviceType ? `Service : ${identity.serviceType}` : '',
    identity.shortId ? `Référence : ${identity.shortId}` : '',
  ].filter(Boolean).join('   ·   ');
  const line2 = [
    vm.submittedAt ? `Soumis le : ${formatPdfDate(vm.submittedAt)}` : '',
    vm.analyzedAt ? `Analysé le : ${formatPdfDate(vm.analyzedAt)}` : '',
    vm.analysisVersion != null ? `Analyse : v${vm.analysisVersion}` : '',
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
}

function labeledBlock(layout, label, value, fallback = 'À clarifier en entrevue') {
  const body = t(value || fallback);
  const h = 16 + layout.heightOf(body, layout.width - 20, { size: 10, lineGap: 2 });
  if (!layout.ensure(h + 6)) return;
  layout.fillCard(layout.left, layout.y, layout.width, h, KR_V42_COLORS.bg);
  layout.safeText(label, layout.left + 10, layout.y + 6, {
    width: layout.width - 20, bold: true, size: 7, color: KR_V42_COLORS.accent,
  });
  layout.safeText(body, layout.left + 10, layout.y + 16, {
    width: layout.width - 20, size: 10, lineGap: 2,
  });
  layout.y += h + 6;
}

function drawPage1(layout, vm, logoPath) {
  drawIdentityHero(layout, vm, logoPath);
  const brief = vm.coachDecisionBrief || {};
  labeledBlock(layout, 'OBJECTIF DE L\'ATHLÈTE', brief.athleteGoal || vm.athleteOperatingBrief?.primaryGoal);
  labeledBlock(layout, 'RÉUSSITE DÉCRITE', brief.successDescribed || vm.athleteOperatingBrief?.successDefinition);
  labeledBlock(
    layout,
    'POURQUOI MAINTENANT',
    brief.whyNowCaptured ? brief.whyNow : null,
    'À clarifier en entrevue',
  );
  if (vm.quickRead?.length && layout.remaining() > 48) {
    layout.sectionTitle('Lecture rapide');
    const line = vm.quickRead.map((item) => `${item.label} : ${item.value}`).join('   ·   ');
    layout.y = layout.safeText(line, layout.left, layout.y, { size: 8.5, lineGap: 2 }) + 8;
    layout.record('quick-read');
  }
  if (vm.coachPriorities?.length) {
    layout.sectionTitle('Dès le départ');
    layout.bullets(vm.coachPriorities, 3);
    layout.record('start');
  }
  if (brief.avoidAtStart?.length) {
    layout.sectionTitle('À éviter au départ');
    layout.bullets(brief.avoidAtStart, 3);
    layout.record('avoid');
  }
  if (brief.confirmNow?.length) {
    layout.sectionTitle('À confirmer');
    layout.bullets(brief.confirmNow, 3);
    layout.record('confirm');
  }
}

function drawManual(layout, vm) {
  layout.pageKicker('Mode d\'emploi de l\'athlète');
  const sections = vm.portraitCoach || [];
  for (const section of sections.slice(0, 3)) {
    if (!layout.ensure(56)) break;
    layout.sectionTitle(section.title);
    layout.record('portrait');
    for (const line of (section.paragraphs || []).slice(0, 2)) {
      const h = layout.heightOf(line, layout.width, { size: 9.5, lineGap: 3 }) + 4;
      if (!layout.ensure(h)) break;
      layout.y = layout.safeText(line, layout.left, layout.y, { size: 9.5, lineGap: 3 }) + 4;
    }
  }
  const brief = vm.athleteOperatingBrief || {};
  const rows = [
    ['Structure / choix', [brief.structurePreference, brief.choicePreference].filter(Boolean).join(' · ')],
    ['Communication', brief.communicationPreference],
  ].filter(([, value]) => value);
  for (const [label, value] of rows) {
    layout.setFont(true, 8, KR_V42_COLORS.primary);
    layout.doc.text(label, layout.left, layout.y, { width: 140 });
    layout.setFont(false, 9, KR_V42_COLORS.text);
    layout.doc.text(t(value), layout.left + 140, layout.y, { width: layout.width - 140 });
    layout.y = Math.max(layout.doc.y, layout.y) + 6;
  }
  if (vm.interviewQuestions?.length) {
    layout.sectionTitle('Questions à confirmer en entrevue');
    layout.record('interview');
    layout.bullets(vm.interviewQuestions, 5);
  }
}

function drawFindingRow(layout, row) {
  const label = t(row.label);
  const primary = row.displayLabel || findingPrimaryLabel(row);
  const status = row.confidenceStatus || row.evidenceBadge || findingStatusLabel(row);
  const technical = row.technicalDirection || findingTechnicalDirection(row);
  const meaning = t(row.coachMeaning || row.interpretation || '');
  const labelH = layout.heightOf(label, layout.width - 160, { bold: true, size: 8.5 });
  const meta = [primary, status].filter(Boolean).join('  ·  ');
  const metaH = layout.heightOf(meta, 155, { size: 8, bold: true });
  const techH = technical ? layout.heightOf(technical, layout.width, { size: 7 }) : 0;
  const meaningH = meaning ? layout.heightOf(meaning, layout.width, { size: 7.5 }) : 0;
  const h = Math.max(labelH, metaH) + techH + meaningH + 12;
  if (!layout.ensure(h)) return;
  const start = layout.y;
  layout.setFont(true, 8.5, KR_V42_COLORS.text);
  layout.doc.text(label, layout.left, start, { width: layout.width - 160, height: labelH + 2 });
  layout.setFont(true, 8, KR_V42_COLORS.primary);
  layout.doc.text(meta, layout.left + layout.width - 155, start, { width: 155, align: 'right', height: metaH + 2 });
  let cursor = start + Math.max(labelH, metaH) + 2;
  if (technical) {
    layout.setFont(false, 7, KR_V42_COLORS.muted);
    layout.doc.text(technical, layout.left, cursor, { width: layout.width, height: techH + 2 });
    cursor = layout.doc.y + 2;
  }
  if (meaning) {
    layout.setFont(false, 7.5, KR_V42_COLORS.muted);
    layout.doc.text(meaning, layout.left, cursor, { width: layout.width, height: meaningH + 2 });
    cursor = layout.doc.y + 3;
  }
  const n = Number(row.technicalScore ?? row.rawScore);
  const pct = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) / 100 : 0;
  const barColor = row.signalDirection === 'risk' ? KR_V42_COLORS.accent : KR_V42_COLORS.primary;
  layout.doc.roundedRect(layout.left, cursor, layout.width, 4, 2).fill(KR_V42_COLORS.bg);
  if (pct > 0) layout.doc.roundedRect(layout.left, cursor, Math.max(2, layout.width * pct), 4, 2).fill(barColor);
  layout.y = cursor + 10;
}

function drawLegacyNutrition(layout, vm) {
  const organized = vm.nutritionOrganized || {};
  const nutrition = vm.nutrition || {};
  const blocks = [
    ['Lecture nutrition', organized.suggested?.length ? organized.suggested : nutrition.lecture],
    ['Structure suggérée', nutrition.structure ? [nutrition.structure] : organized.confirm],
    ['Obstacles', organized.obstacles?.length ? organized.obstacles : nutrition.obstacles],
    ['Actions', organized.test?.length ? organized.test : nutrition.actions],
  ].filter(([, items]) => items?.length);
  if (!blocks.length && !organized.said?.length) return false;
  layout.sectionTitle('Nutrition');
  layout.record('nutrition');
  if (organized.evidenceNote) {
    layout.y = layout.safeText(organized.evidenceNote, layout.left, layout.y, {
      size: 8, color: KR_V42_COLORS.muted, lineGap: 2,
    }) + 6;
  }
  if (organized.said?.length) {
    layout.setFont(true, 8, KR_V42_COLORS.primary);
    layout.y = layout.safeText('Ce que l\'athlète a dit', layout.left, layout.y, {
      bold: true, size: 8, color: KR_V42_COLORS.primary,
    }) + 2;
    layout.bullets(organized.said, 4);
  }
  for (const [title, items] of blocks) {
    if (!layout.ensure(28)) break;
    layout.setFont(true, 8, KR_V42_COLORS.primary);
    layout.y = layout.safeText(title, layout.left, layout.y, {
      bold: true, size: 8, color: KR_V42_COLORS.primary,
    }) + 2;
    layout.bullets(items, 4);
  }
  return true;
}

function drawFactorsAndNutrition(layout, vm) {
  const hasNutrition = hasNutritionContent(vm.nutritionOrganized || vm.nutrition, vm.nutritionAction);
  layout.pageKicker(hasNutrition ? 'Facteurs de décision + nutrition' : 'Facteurs de décision');
  const factors = vm.decisionFactors?.length ? vm.decisionFactors : (vm.dimensions || []).slice(0, 8);
  if (factors.length) {
    layout.sectionTitle('Facteurs de décision');
    layout.record('factors');
    for (const row of factors.slice(0, 6)) drawFindingRow(layout, row);
  }
  if (vm.nutritionAction?.cards?.length) {
    layout.sectionTitle('Nutrition — actionnable');
    layout.record('nutrition');
    for (const card of vm.nutritionAction.cards.slice(0, 3)) {
      const lines = [
        card.athleteSaid ? `Athlète : ${card.athleteSaid}` : '',
        card.suggested ? `Lecture : ${card.suggested}` : '',
        card.toTest ? `Tester : ${card.toTest}` : '',
      ].filter(Boolean).join('\n');
      const h = 20 + layout.heightOf(lines, layout.width - 20, { size: 8.5, lineGap: 2 });
      if (!layout.ensure(h + 6)) break;
      layout.fillCard(layout.left, layout.y, layout.width, h, KR_V42_COLORS.bg);
      layout.setFont(true, 8, KR_V42_COLORS.primary);
      layout.doc.text(`${card.title}  ·  ${card.stance}`, layout.left + 10, layout.y + 6, {
        width: layout.width - 20,
      });
      layout.setFont(false, 8.5, KR_V42_COLORS.text);
      layout.doc.text(t(lines), layout.left + 10, layout.y + 18, {
        width: layout.width - 20,
        lineGap: 2,
        height: Math.max(12, h - 22),
      });
      layout.y += h + 6;
    }
    return;
  }
  if (hasNutrition) drawLegacyNutrition(layout, vm);
}

function drawPlanAndVoice(layout, vm) {
  layout.pageKicker('Plan Coach + voix de l\'athlète');
  const weeks = vm.fourWeekPlan || [];
  if (weeks.length) {
    layout.sectionTitle('Plan 4 semaines');
    if (!isTestableFourWeekPlan(weeks) && !vm.fourWeekPlanTestable) {
      layout.y = layout.safeText('Plan issu de l\'analyse historique', layout.left, layout.y, {
        size: 8, color: KR_V42_COLORS.muted,
      }) + 6;
    }
    layout.record('plan');
    const testable = isTestableFourWeekPlan(weeks) || vm.fourWeekPlanTestable;
    const weekBody = (week) => (testable
      ? [
        week.objective ? `Objectif : ${week.objective}` : '',
        week.coachAction ? `Action Coach : ${week.coachAction}` : '',
        week.observe ? `Ce qu'on observe : ${week.observe}` : '',
        week.validationCriterion ? `Critère de validation : ${week.validationCriterion}` : '',
      ]
      : [
        week.objective || week.focus,
        ...(week.actions || []).slice(0, 3),
        week.observe ? `Observer : ${week.observe}` : '',
        week.validationCriterion ? `Validation : ${week.validationCriterion}` : '',
      ]
    ).filter(Boolean).join('\n');
    const colW = (layout.width - 10) / 2;
    for (let i = 0; i < Math.min(4, weeks.length); i += 2) {
      const pair = [weeks[i], weeks[i + 1]].filter(Boolean);
      const heights = pair.map((week) => (
        40 + layout.heightOf(weekBody(week), colW - 16, { size: 8, lineGap: 2 })
      ));
      const rowH = Math.max(...heights);
      if (!layout.ensure(rowH + 8)) break;
      pair.forEach((week, col) => {
        const x = layout.left + col * (colW + 10);
        layout.fillCard(x, layout.y, colW, rowH);
        layout.setFont(true, 7, KR_V42_COLORS.accent);
        layout.doc.text(`SEMAINE ${week.week}`, x + 8, layout.y + 7, { width: colW - 16 });
        layout.setFont(true, 9, KR_V42_COLORS.primary);
        layout.doc.text(t(week.title), x + 8, layout.y + 18, { width: colW - 16 });
        const body = weekBody(week);
        layout.setFont(false, 8, KR_V42_COLORS.text);
        layout.doc.text(t(body), x + 8, layout.y + 34, {
          width: colW - 16,
          lineGap: 2,
          height: Math.max(12, rowH - 42),
        });
      });
      layout.y += rowH + 10;
    }
  }

  const voice = vm.verbatims || [];
  if (!voice.length) return;
  layout.sectionTitle('Voix de l\'athlète');
  layout.record('voice');
  for (const item of voice.slice(0, 3)) {
    const quote = `« ${t(item.verbatim)} »`;
    const source = t(item.questionText || item.questionCode);
    const why = t(item.whyItMatters || '');
    const h = 18
      + layout.heightOf(quote, layout.width - 20, { size: 9.5, lineGap: 3 })
      + layout.heightOf(source, layout.width - 20, { size: 7.5 })
      + (why ? layout.heightOf(why, layout.width - 20, { size: 7.5 }) : 0)
      + 14;
    if (!layout.ensure(h + 6)) break;
    layout.fillCard(layout.left, layout.y, layout.width, h, KR_V42_COLORS.bg);
    layout.setFont(true, 7, KR_V42_COLORS.muted);
    layout.doc.text('VOIX DE L\'ATHLÈTE', layout.left + 10, layout.y + 6, { width: layout.width - 20 });
    layout.setFont(false, 9.5, KR_V42_COLORS.text);
    layout.doc.text(quote, layout.left + 10, layout.y + 16, {
      width: layout.width - 20,
      lineGap: 3,
      height: Math.max(12, h - 28),
    });
    let cursor = layout.doc.y + 4;
    layout.setFont(false, 7.5, KR_V42_COLORS.muted);
    layout.doc.text(`Question source : ${source}`, layout.left + 10, cursor, { width: layout.width - 20 });
    if (why) {
      cursor = layout.doc.y + 2;
      layout.doc.text(`Pourquoi c'est important : ${why}`, layout.left + 10, cursor, {
        width: layout.width - 20,
      });
    }
    layout.y += h + 6;
  }
}

function drawTrace(layout, vm) {
  const tech = vm.technical || vm.provenance || {};
  const rows = [
    ['Questionnaire', tech.questionnaireVersion],
    ['Ruleset', tech.rulesetVersion],
    ['Modèle de rapport', tech.reportModelVersion],
    ['Version d\'analyse', tech.analysisVersion != null ? String(tech.analysisVersion) : ''],
    ['Référence client', vm.identity?.shortId],
    ['Empreinte', tech.contentHash],
    ['Renderer PDF', tech.pdfRenderer || MOTIVATION_PDF_RENDERER_V44_ID],
  ].filter(([, value]) => value);
  if (!rows.length || layout.remaining() < 16) return;
  if (layout.remaining() >= 40) layout.sectionTitle('Traçabilité');
  layout.record('trace');
  layout.y = layout.safeText(
    rows.map(([k, v]) => `${k} : ${v}`).join('   ·   '),
    layout.left,
    layout.y,
    { size: 7.5, color: KR_V42_COLORS.muted, lineGap: 2 },
  ) + 6;
}

export async function renderCoachReportPdfV44Kr({ display, generatedAt = new Date() } = {}) {
  const vm = display || {};
  if (!vm.identity?.fullName || !vm.identity?.shortId) {
    throw new ClientIdentityError('client_identity_missing');
  }
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

  drawPage1(layout, vm, logoPath);
  layout.continueIfRoom(110);
  drawManual(layout, vm);
  layout.continueIfRoom(130);
  drawFactorsAndNutrition(layout, vm);
  layout.continueIfRoom(150);
  drawPlanAndVoice(layout, vm);
  drawTrace(layout, vm);
  const last = layout.pageStats[layout.pageStats.length - 1];
  if (last) last.usedHeight = Math.max(last.usedHeight, layout.y);

  const pageCount = doc.bufferedPageRange().count;
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
  };
}
