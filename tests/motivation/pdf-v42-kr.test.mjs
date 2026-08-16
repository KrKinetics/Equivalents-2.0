import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROFILE_A_STABLE,
  analyzeCompleteMotivationProfile,
} from '../../src/coach/motivation/fixtures/complete-profiles.mjs';
import {
  MOTIVATION_PDF_RENDERER_ID,
  renderMotivationPdf,
} from '../../src/coach/motivation/pdf/render-motivation-pdf.mjs';
import { renderCoachReportPdfV42Kr } from '../../src/coach/motivation/lib/pdf/render-v42-kr.mjs';
import { extractPdfPagesText, isEffectivelyBlankPage } from '../../src/coach/motivation/lib/pdf/pdf-text.mjs';
import { assertValidUnicode } from '../../src/coach/motivation/lib/pdf/unicode-guard.mjs';
import {
  KR_V42_CANONICAL_LOGO,
  KR_V42_LEGACY_LOGO,
  KR_V42_PACKAGED_LOGO,
} from '../../src/coach/motivation/lib/pdf/kr-v42-logo.mjs';
import { KR_V42_COLORS } from '../../src/coach/motivation/lib/pdf/theme-v42-kr.mjs';
import { formatCoachDateTime } from '../../src/coach/motivation/lib/report-timestamp.mjs';
import { buildMotivationReportMarkup } from '../../src/coach/motivation/report/build-motivation-report-html.mjs';
import { buildMotivationReportViewModel } from '../../src/coach/motivation/report/motivation-report-view-model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function sha256(rel) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
}

test('packaged v4.2 logo is an exact copy of the portal mark', () => {
  const canonical = sha256(KR_V42_CANONICAL_LOGO);
  const packaged = sha256(KR_V42_PACKAGED_LOGO);
  const legacy = sha256(KR_V42_LEGACY_LOGO);
  assert.equal(packaged, canonical);
  assert.notEqual(packaged, legacy);
});

test('renderMotivationPdf uses the current KR v4.2 renderer, not v31', async () => {
  const src = fs.readFileSync(path.join(root, 'src/coach/motivation/pdf/render-motivation-pdf.mjs'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/coach/motivation/lib/pdf/render-v42-kr.mjs'), 'utf8');
  const theme = fs.readFileSync(path.join(root, 'src/coach/motivation/lib/pdf/theme-v42-kr.mjs'), 'utf8');
  assert.match(src, /renderCoachReportPdfV42Kr/);
  assert.doesNotMatch(src, /renderCoachReportPdfV41|renderCoachReportPdfV31/);
  assert.doesNotMatch(renderer, /#991f2d|#1a1a2e|kr-kinetics-logo\.png/);
  assert.doesNotMatch(theme, /#991f2d|#1a1a2e/);
  assert.match(theme, /#071b41/);
  assert.match(theme, /#ed1136/);
  assert.equal(fs.existsSync(path.join(root, 'src/coach/motivation/lib/pdf/render-v31.mjs')), true);

  const { result } = analyzeCompleteMotivationProfile(PROFILE_A_STABLE, {
    assessmentId: 'asm_pdf_kr',
    clientName: 'Client test KR',
    completedAt: new Date('2026-08-16T12:00:00.000Z'),
  });
  const rendered = await renderMotivationPdf(result.report, {
    clientName: 'Client test KR',
    generatedAt: new Date('2026-08-16T12:00:00.000Z'),
    analysisVersion: 1,
    submittedAt: '2026-08-16T12:00:00.000Z',
    analyzedAt: '2026-08-16T12:05:00.000Z',
  });
  assert.equal(rendered.renderer, MOTIVATION_PDF_RENDERER_ID);
  assert.match(String(rendered.logoPath || ''), /logo-kr-kinetics-horizontal\.png$/);
  assert.doesNotMatch(String(rendered.logoPath || ''), /kr-kinetics-logo\.png$/);
  assert.equal(rendered.buffer.subarray(0, 5).toString(), '%PDF-');
  assert.ok(rendered.buffer.length > 1000);
  assert.ok(rendered.pageCount >= 2);
  const pages = await extractPdfPagesText(rendered.buffer);
  const text = pages.map((page) => page.text).join('\n');
  assertValidUnicode(text);
  assert.match(text, /Profil motivationnel/);
  assert.match(text, /Client test KR/);
  assert.match(text, /Lecture rapide/i);
  assert.match(text, /Priorités Coach|Priorites Coach/i);
  assert.match(text, /DIMENSIONS|Dimensions/i);
  assert.match(text, /Plan 4 semaines|Semaine 1/i);
  assert.match(text, /entrevue/i);
  assert.match(text, /Informations techniques/i);
  assert.match(text, /Confidentiel/);
  assert.match(text, /1 \/ /);
  for (const page of pages) {
    assert.equal(isEffectivelyBlankPage(page.text), false, `blank page ${page.pageNumber}`);
  }
  assert.equal(KR_V42_COLORS.primary, '#071b41');
  assert.equal(KR_V42_COLORS.accent, '#ed1136');
});

test('v4.2 PDF page 1 has a single hero logo and continuation pages keep the small mark', async () => {
  const renderer = fs.readFileSync(path.join(root, 'src/coach/motivation/lib/pdf/render-v42-kr.mjs'), 'utf8');
  assert.match(renderer, /drawHero\(layout, vm, logoPath\)/);
  assert.doesNotMatch(
    renderer,
    /layout\.drawHeader\(\);\s*[\s\S]{0,80}drawHero/,
  );

  const { result } = analyzeCompleteMotivationProfile(PROFILE_A_STABLE, {
    assessmentId: 'asm_pdf_logo',
    clientName: 'Client test KR',
    completedAt: new Date('2026-08-16T12:00:00.000Z'),
  });
  const rendered = await renderMotivationPdf(result.report, {
    clientName: 'Client test KR',
    analysisVersion: 1,
  });
  const page1 = (rendered.logoPlacements || []).filter((row) => row.page === 1);
  assert.equal(page1.length, 1);
  assert.equal(page1[0].role, 'hero');
  const later = (rendered.logoPlacements || []).filter((row) => row.page > 1);
  assert.ok(later.length >= 1);
  assert.ok(later.every((row) => row.role === 'header'));
});

test('PDF timestamps use America/Toronto and match the web report', async () => {
  const submittedAt = '2026-08-16T19:55:00.000Z';
  const analyzedAt = '2026-08-16T20:38:00.000Z';
  const expectedSubmitted = formatCoachDateTime(submittedAt);
  const expectedAnalyzed = formatCoachDateTime(analyzedAt);
  assert.match(expectedSubmitted, /15 h 55/);
  assert.match(expectedAnalyzed, /16 h 38/);

  const src = fs.readFileSync(path.join(root, 'src/coach/motivation/lib/pdf/render-v42-kr.mjs'), 'utf8');
  const helper = fs.readFileSync(path.join(root, 'src/coach/motivation/lib/report-timestamp.mjs'), 'utf8');
  assert.match(src, /formatCoachDateTime/);
  assert.match(helper, /America\/Toronto/);
  assert.match(helper, /timeZone:\s*timezone/);

  const html = buildMotivationReportMarkup(buildMotivationReportViewModel({
    report: { schemaVersion: 'report-model-v4.2' },
    clientName: 'Client test KR',
    submittedAt,
    analyzedAt,
  }));
  assert.match(html, new RegExp(expectedSubmitted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, new RegExp(expectedAnalyzed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const rendered = await renderCoachReportPdfV42Kr({
    display: {
      clientName: 'Client test KR',
      submittedAt,
      analyzedAt,
      analysisVersion: 1,
      technical: {
        questionnaireVersion: 'questionnaire-v4.1',
        submittedAt,
        analyzedAt,
      },
    },
  });
  const text = (await extractPdfPagesText(rendered.buffer)).map((page) => page.text).join('\n');
  assert.match(text, /15 h 55/);
  assert.match(text, /16 h 38/);
  assert.doesNotMatch(text, /19 h 55/);
  assert.doesNotMatch(text, /20 h 38/);
});

test('QA-style v4.2 PDF stays on 5 pages and never orphans Analyse', async () => {
  const { result } = analyzeCompleteMotivationProfile(PROFILE_A_STABLE, {
    assessmentId: 'asm_pdf_pages',
    clientName: 'Client test KR',
    completedAt: new Date('2026-08-16T19:55:00.000Z'),
  });
  const rendered = await renderMotivationPdf(result.report, {
    clientName: 'Client test KR',
    analysisVersion: 1,
    submittedAt: '2026-08-16T19:55:00.000Z',
    analyzedAt: '2026-08-16T20:38:00.000Z',
    contentHash: 'a'.repeat(64),
  });
  assert.equal(rendered.pageCount, 5);
  const pages = await extractPdfPagesText(rendered.buffer);
  assert.equal(pages.length, 5);
  for (const page of pages) {
    assert.equal(isEffectivelyBlankPage(page.text), false, `blank page ${page.pageNumber}`);
    const body = page.text
      .replace(/Confidentiel — usage Coach KR Kinetics/gi, ' ')
      .replace(/\d+\s*\/\s*\d+/g, ' ')
      .replace(/Profil motivationnel/gi, ' ')
      .replace(/KR Kinetics/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    assert.ok(body.length >= 80, `thin page ${page.pageNumber}: ${body.slice(0, 60)}`);
    const onlyAnalyse = /^Analyse\b/i.test(body) && body.length < 80;
    assert.equal(onlyAnalyse, false, `orphan Analyse page ${page.pageNumber}`);
  }
  const last = pages[pages.length - 1].text;
  assert.match(last, /Informations techniques/i);
  assert.match(last, /Questionnaire|Ruleset|Empreinte|Soumission/i);
  assert.ok(last.length > 120);
});

test('KR v4.2 PDF preserves French unicode without rewriting verbatim', async () => {
  const phrase = 'évaluerez-vous préparation – adhésion récupération qualité';
  const verbatim = 'je veuxdes abdo — déjà prêt à l’œuvre';
  const rendered = await renderCoachReportPdfV42Kr({
    display: {
      title: 'Profil motivationnel',
      clientName: 'Client été',
      submittedAt: '2026-08-16T12:00:00.000Z',
      analysisVersion: 1,
      quickRead: [{ id: 'preparation', label: 'Niveau de préparation', value: 'Préparation adéquate' }],
      summary: [`Le coach évaluerez-vous la ${phrase} après ça.`],
      coachPriorities: ['Clarifier la récupération.'],
      vigilance: [],
      interviewQuestions: ['Comment évaluerez-vous l’adhésion ?'],
      dimensions: [{ id: 'adherence_recovery', label: 'Adhésion et capacité de reprise', score: 62.5, evidenceBadge: 'Mixte' }],
      fourWeekPlan: [{ week: 1, title: 'Semaine 1 — Clarifier', focus: 'Préparation', actions: ['Noter la récupération.'] }],
      verbatims: [{
        questionCode: 'GOAL_01',
        questionText: 'Objectif déclaré',
        verbatim,
      }],
      technical: {
        questionnaireVersion: 'questionnaire-v4.1',
        rulesetVersion: 'ruleset-v4.1',
        reportModelVersion: 'report-model-v4.2',
        analysisVersion: 1,
      },
    },
  });
  const text = (await extractPdfPagesText(rendered.buffer)).map((page) => page.text).join('\n');
  assertValidUnicode(text);
  for (const token of ['é', 'è', 'ê', 'à', 'ç', 'œ', '’', '«', '»', '–', '—']) {
    assert.match(text, new RegExp(token));
  }
  assert.match(text, /je veuxdes abdo/);
  assert.match(text, /VERBATIM CLIENT/);
  assert.doesNotMatch(text, /je veux des abdos/);
});
