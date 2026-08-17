import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCompleteMotivationProfile, PROFILE_A_STABLE } from '../../src/coach/motivation/fixtures/complete-profiles.mjs';
import {
  analyzeCompleteMotivationProfileV42,
  V42_DANNY_LIKE,
} from '../../src/coach/motivation/fixtures/complete-profiles-v42.mjs';
import {
  analyzeCompleteMotivationProfileV43,
  V43_COHERENT,
} from '../../src/coach/motivation/fixtures/complete-profiles-v43.mjs';
import { buildCanonicalClientIdentity } from '../../src/coach/motivation/identity/canonical-client-identity.mjs';
import { buildMotivationReportViewModel } from '../../src/coach/motivation/report/motivation-report-view-model.mjs';
import { buildMotivationReportMarkup } from '../../src/coach/motivation/report/build-motivation-report-html.mjs';
import { renderMotivationPdf } from '../../src/coach/motivation/pdf/render-motivation-pdf.mjs';
import { extractPdfPagesText, isEffectivelyBlankPage } from '../../src/coach/motivation/lib/pdf/pdf-text.mjs';
import { KR_V42_PAGE } from '../../src/coach/motivation/lib/pdf/theme-v42-kr.mjs';
import { hasNutritionContent } from '../../src/coach/motivation/report/presentation-labels.mjs';

const DANNY = {
  id: '5a94561a-1111-4111-8111-aaaaaaaaaaaa',
  full_name: 'Danny R',
  email: 'danny@example.com',
  phone: '5145550100',
  service_type: 'complete',
};

const LONG_IDENTITY = {
  id: '5a94561a-1111-4111-8111-aaaaaaaaaaaa',
  full_name: 'Jean-Philippe Beauregard-Tremblay',
  email: 'jean-philippe.beauregard-tremblay.entrainement@example.com',
  phone: '514-555-0199',
  service_type: 'Entraînement + nutrition complète',
};

function buildBundle(analyzeFn, profile, client, extras = {}) {
  const { result } = analyzeFn(profile, {
    assessmentId: extras.assessmentId || 'asm_legacy',
    clientId: client.id,
    clientName: client.full_name,
    completedAt: new Date('2026-08-16T12:00:00.000Z'),
  });
  const identity = buildCanonicalClientIdentity(client).identity;
  const vm = buildMotivationReportViewModel({
    report: result.report,
    identity,
    clientId: client.id,
    clientName: client.full_name,
    analysisVersion: 1,
    submittedAt: '2026-08-16T12:00:00.000Z',
    analyzedAt: '2026-08-16T12:05:00.000Z',
    provenance: result.provenance,
  });
  return { result, identity, vm, report: result.report };
}

async function renderBundle(bundle) {
  const beforeSchema = bundle.report.schemaVersion;
  const beforeModel = bundle.report.metadata?.reportModelVersion;
  const beforeNutrition = JSON.stringify(bundle.report.nutrition || null);
  const rendered = await renderMotivationPdf(bundle.report, {
    identity: bundle.identity,
    analysisVersion: 1,
    submittedAt: '2026-08-16T12:00:00.000Z',
    analyzedAt: '2026-08-16T12:05:00.000Z',
  });
  assert.equal(bundle.report.schemaVersion, beforeSchema);
  assert.equal(bundle.report.metadata?.reportModelVersion, beforeModel);
  assert.equal(JSON.stringify(bundle.report.nutrition || null), beforeNutrition);
  const pages = await extractPdfPagesText(rendered.buffer);
  return { rendered, pages, text: pages.map((page) => page.text).join('\n') };
}

function assertNoRawEnglishTendencies(text) {
  assert.doesNotMatch(text, /\b(low|moderate|high)\b/);
  assert.doesNotMatch(text, /high\s*[·.]\s*Mixte/i);
}

function assertWebPdfParity(vm, html, pdfText) {
  const webNutrition = /data-section="nutrition"/.test(html);
  const hasNutrition = hasNutritionContent(vm.nutritionOrganized || vm.nutrition, vm.nutritionAction);
  assert.equal(webNutrition, hasNutrition);
  if (webNutrition) {
    assert.match(pdfText, /Nutrition/i);
    const tokens = [
      ...(vm.nutrition?.lecture || []),
      vm.nutrition?.structure,
      ...(vm.nutrition?.obstacles || []),
      ...(vm.nutrition?.actions || []),
      ...(vm.nutritionOrganized?.said || []),
      ...(vm.nutritionOrganized?.suggested || []),
      ...(vm.nutritionAction?.cards || []).flatMap((card) => [card.athleteSaid, card.suggested, card.toTest]),
    ].filter(Boolean);
    assert.ok(tokens.length > 0, 'web nutrition visible without extractable content');
    const shared = tokens.some((token) => {
      const needle = String(token).replace(/\s+/g, ' ').trim().slice(0, 42);
      return needle.length >= 12 && pdfText.replace(/\s+/g, ' ').includes(needle);
    });
    assert.equal(shared, true, 'nutrition visible on web disappeared from PDF');
  } else {
    assert.doesNotMatch(pdfText, /Facteurs de décision \+ nutrition/i);
  }

  const goal = vm.coachDecisionBrief?.athleteGoal || vm.athleteOperatingBrief?.primaryGoal;
  if (goal && html.includes(goal.slice(0, 24))) {
    assert.match(pdfText.replace(/\s+/g, ' '), new RegExp(goal.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const verbatim = vm.verbatims?.[0]?.verbatim;
  if (verbatim && html.includes(verbatim.slice(0, 20))) {
    assert.match(pdfText.replace(/\s+/g, ' '), new RegExp(verbatim.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
}

function assertPageFill(rendered) {
  const bottom = KR_V42_PAGE.height - KR_V42_PAGE.footerHeight;
  const stats = rendered.pageStats || [];
  assert.ok(stats.length >= 1);
  stats.forEach((row, index) => {
    assert.equal(isEffectivelyBlankPage('x'.repeat(Math.max(0, Math.round(row.usedHeight || 0)))), false);
    const start = row.page === 1 ? (rendered.heroBandHeight || 160) : KR_V42_PAGE.headerHeight + 12;
    const usable = bottom - start;
    const dead = bottom - row.usedHeight;
    const deadRatio = dead / usable;
    const last = index === stats.length - 1;
    if (!last) {
      assert.ok(
        deadRatio <= 0.40,
        `page ${row.page} dead space ${Math.round(deadRatio * 100)}% used=${row.usedHeight}`,
      );
    }
    assert.ok(row.blockCount >= 1, `page ${row.page} has no blocks`);
  });
}

async function extractHeroItems(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false }).promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  return content.items.map((item) => ({
    text: item.str || '',
    yFromTop: KR_V42_PAGE.height - (item.transform[5] + (item.height || item.transform[3] || 8)),
    height: item.height || item.transform[3] || 8,
  }));
}

test('historical report-model-v4.2 PDF keeps nutrition and does not rewrite the snapshot', async () => {
  const bundle = buildBundle(analyzeCompleteMotivationProfile, PROFILE_A_STABLE, {
    ...DANNY,
    full_name: 'Client test KR',
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  });
  assert.equal(bundle.report.schemaVersion, 'report-model-v4.2');
  const html = buildMotivationReportMarkup(bundle.vm);
  const { rendered, pages, text } = await renderBundle(bundle);
  assert.ok(rendered.pageCount >= 3 && rendered.pageCount <= 5);
  assertWebPdfParity(bundle.vm, html, text);
  assertNoRawEnglishTendencies(text);
  assert.match(text, /Plan issu de l'analyse historique/);
  assert.doesNotMatch(text, /Action Coach :/);
  assert.match(text, /renderCoachReportPdfV44Kr/);
  assert.match(text, /report-model-v4\.2/);
  pages.forEach((page) => assert.equal(isEffectivelyBlankPage(page.text), false, `blank ${page.pageNumber}`));
  assertPageFill(rendered);
});

test('historical report-model-v4.3 Danny-like PDF keeps nutrition and provenance', async () => {
  const bundle = buildBundle(analyzeCompleteMotivationProfileV42, V42_DANNY_LIKE, DANNY, {
    assessmentId: 'asm_danny_like',
  });
  assert.equal(bundle.report.schemaVersion, 'report-model-v4.3');
  assert.equal(bundle.report.metadata.reportModelVersion, 'v4.3');
  assert.equal(bundle.result.provenance.questionnaireVersion, 'questionnaire-v4.2');
  assert.equal(bundle.result.provenance.rulesetVersion, 'ruleset-v4.2');
  const html = buildMotivationReportMarkup(bundle.vm);
  assert.match(html, /data-section="nutrition"/);
  assert.match(html, /Ce que l'athlète a dit|Ce que ça suggère|Obstacles/);
  assert.match(html, /Plan issu de l'analyse historique/);
  assert.match(html, /renderCoachReportPdfV44Kr/);
  const { rendered, pages, text } = await renderBundle(bundle);
  assert.ok(rendered.pageCount >= 3 && rendered.pageCount <= 4, `Danny pages=${rendered.pageCount}`);
  assertWebPdfParity(bundle.vm, html, text);
  assert.match(text, /Danny R/);
  assert.match(text, /Nutrition/i);
  assert.match(text, /Plan issu de l'analyse historique/);
  assert.doesNotMatch(text, /Action Coach :/);
  assert.doesNotMatch(text, /Critère de validation :/);
  assert.match(text, /report-model-v4\.3/);
  assert.match(text, /questionnaire-v4\.2/);
  assert.match(text, /ruleset-v4\.2/);
  assert.match(text, /renderCoachReportPdfV44Kr/);
  assertNoRawEnglishTendencies(text);
  if (bundle.vm.dimensions.some((row) => row.claimStrength === 'mixed')) {
    assert.match(text, /Signal mixte/);
    assert.doesNotMatch(text, /high\s*[·.]\s*Mixte/i);
  }
  assert.equal(
    bundle.vm.coachPriorities.some((item) => /lien alimentation-performance paraît/i.test(item)),
    false,
  );
  pages.forEach((page) => {
    assert.match(page.text, /Danny R/);
    assert.match(page.text, /5a94561a/);
    assert.equal(isEffectivelyBlankPage(page.text), false, `blank ${page.pageNumber}`);
  });
  assertPageFill(rendered);
});

test('new report-model-v4.4 PDF keeps testable plan contract and nutrition cards', async () => {
  const bundle = buildBundle(analyzeCompleteMotivationProfileV43, V43_COHERENT, DANNY, {
    assessmentId: 'asm_v44',
  });
  assert.equal(bundle.report.schemaVersion, 'report-model-v4.4');
  const html = buildMotivationReportMarkup(bundle.vm);
  const { rendered, text } = await renderBundle(bundle);
  assert.ok(rendered.pageCount >= 3 && rendered.pageCount <= 5);
  assertWebPdfParity(bundle.vm, html, text);
  assert.match(text, /Objectif :/);
  assert.match(text, /Action Coach :/);
  assert.match(text, /Ce qu'on observe :/);
  assert.match(text, /Critère de validation :/);
  assert.doesNotMatch(text, /Plan issu de l'analyse historique/);
  assert.match(text, /report-model-v4\.4/);
  assertNoRawEnglishTendencies(text);
  assertPageFill(rendered);
});

test('hero metadata with long email, name, phone and service stays on the navy band', async () => {
  const bundle = buildBundle(analyzeCompleteMotivationProfileV42, V42_DANNY_LIKE, LONG_IDENTITY);
  const { rendered, text } = await renderBundle(bundle);
  assert.match(text, /jean-philippe\.beauregard-tremblay\.entrainement@example\.com/i);
  assert.match(text, /514-555-0199|5145550199/);
  assert.match(text, /Entraînement \+ nutrition complète|Entrainement \+ nutrition complete/);
  assert.match(text, /Soumis/);
  assert.match(text, /Analysé|Analyse/);
  assert.ok(rendered.heroBandHeight > 160);
  const items = await extractHeroItems(rendered.buffer);
  const meta = items.filter((item) => /Soumis|Analysé|Analyse|Courriel|Téléphone|Service|Référence|@|514/.test(item.text));
  assert.ok(meta.length >= 3, `hero meta items=${meta.length}`);
  for (const item of meta) {
    assert.ok(
      item.yFromTop + item.height <= rendered.heroBandHeight + 3,
      `light text overflow: "${item.text}" y=${item.yFromTop.toFixed(1)} band=${rendered.heroBandHeight}`,
    );
  }
});
