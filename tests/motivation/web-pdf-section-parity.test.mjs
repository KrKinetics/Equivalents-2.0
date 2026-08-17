import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParityBundle,
  renderParityBundle,
  countHtmlSection,
  visibleHtml,
} from './report-parity-helpers.mjs';

function countPdfTitle(pdfText, title) {
  return new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(pdfText);
}

test('same snapshot has matching web/pdf section parity manifest', async () => {
  const bundle = buildParityBundle();
  const { html, pdfText, rendered } = await renderParityBundle(bundle);
  const presentation = bundle.presentation;
  const manifest = {
    hero: {
      web: countHtmlSection(html, 'hero'),
      pdf: /ATHLÈTE|Client test KR/.test(pdfText),
    },
    quickRead: {
      web: (html.match(/data-quick=/g) || []).length,
      pdf: presentation.manifest.quickRead,
    },
    portraitCoach: {
      web: countHtmlSection(html, 'portrait-coach') ? presentation.manifest.portraitCoach : 0,
      pdf: countPdfTitle(pdfText, 'Mode d\'emploi') ? presentation.manifest.portraitCoach : 0,
    },
    operatingBrief: {
      web: countHtmlSection(html, 'operating-brief') ? presentation.manifest.operatingBrief : 0,
      pdf: countPdfTitle(pdfText, 'Synthèse opérationnelle') ? presentation.manifest.operatingBrief : 0,
    },
    coachNarrative: {
      web: countHtmlSection(html, 'coach-narrative') ? presentation.manifest.coachNarrative : 0,
      pdf: countPdfTitle(pdfText, 'Analyse narrative du coach') ? presentation.manifest.coachNarrative : 0,
    },
    coachPriorities: {
      web: countHtmlSection(html, 'priorities') ? presentation.manifest.coachPriorities : 0,
      pdf: countPdfTitle(pdfText, 'Priorités Coach') ? presentation.manifest.coachPriorities : 0,
    },
    riskBuckets: {
      web: countHtmlSection(html, 'risk-buckets') ? presentation.manifest.riskBuckets : 0,
      pdf: countPdfTitle(pdfText, 'Risques') ? presentation.manifest.riskBuckets : 0,
    },
    interviewDetailed: {
      web: countHtmlSection(html, 'interview') ? presentation.manifest.interviewDetailed : 0,
      pdf: countPdfTitle(pdfText, 'Préparer l\'entrevue') ? presentation.manifest.interviewDetailed : 0,
    },
    verbatims: {
      web: countHtmlSection(html, 'verbatims') ? presentation.manifest.verbatims : 0,
      pdf: countPdfTitle(pdfText, 'Voix de l\'athlète') ? presentation.manifest.verbatims : 0,
    },
    decisionFactors: {
      web: countHtmlSection(html, 'dimensions') ? presentation.manifest.decisionFactors : 0,
      pdf: countPdfTitle(pdfText, 'Facteurs de décision') ? presentation.manifest.decisionFactors : 0,
    },
    dimensionGroups: {
      web: presentation.manifest.dimensionGroups,
      pdf: countPdfTitle(pdfText, 'Annexe') ? presentation.manifest.dimensionGroups : 0,
    },
    nutrition: {
      web: countHtmlSection(html, 'nutrition') ? presentation.manifest.nutrition : 0,
      pdf: countPdfTitle(pdfText, 'Nutrition') ? presentation.manifest.nutrition : 0,
    },
    fourWeekPlan: {
      web: countHtmlSection(html, 'four-week-plan') ? presentation.manifest.fourWeekPlan : 0,
      pdf: countPdfTitle(pdfText, 'Plan 4 semaines') ? presentation.manifest.fourWeekPlan : 0,
    },
    technical: {
      web: countHtmlSection(html, 'technical'),
      pdf: countPdfTitle(pdfText, 'Informations techniques'),
    },
  };

  const lost = Object.entries(manifest).filter(([, row]) => {
    if (typeof row.web === 'boolean') return row.web && !row.pdf;
    return row.web > 0 && row.pdf === 0;
  });
  assert.deepEqual(lost, [], `lost sections: ${lost.map(([id]) => id).join(', ')}`);
  assert.equal(manifest.hero.web, true);
  assert.equal(manifest.hero.pdf, true);
  assert.equal(manifest.quickRead.web, manifest.quickRead.pdf);
  assert.equal(manifest.coachPriorities.web, manifest.coachPriorities.pdf);
  assert.equal(manifest.verbatims.web, manifest.verbatims.pdf);
  assert.equal(manifest.fourWeekPlan.web, manifest.fourWeekPlan.pdf);
  assert.equal(manifest.dimensionGroups.web, manifest.dimensionGroups.pdf);
  assert.ok(rendered.pageCount >= 4);
  assert.ok(rendered.pageCount <= 20);
  assert.match(visibleHtml(html), /Analyse narrative du coach/);
  assert.doesNotMatch(html, /\[object Object\]/);
  assert.doesNotMatch(pdfText, /\[object Object\]/);
});
