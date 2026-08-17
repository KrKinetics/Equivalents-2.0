import test from 'node:test';
import assert from 'node:assert/strict';
import { V43_MIXED } from '../../src/coach/motivation/fixtures/complete-profiles-v43.mjs';
import { assertCrossSectionClaimConsistency } from '../../src/coach/motivation/report/presentation-claim-consistency.mjs';
import { buildCoachNarrative } from '../../src/coach/motivation/report/build-coach-narrative.mjs';
import { buildParityBundle, renderParityBundle } from './report-parity-helpers.mjs';

test('coach narrative is gated by claim strength and never invents certainty', async () => {
  const bundle = buildParityBundle(V43_MIXED);
  const narrative = buildCoachNarrative(bundle.vm);
  assert.ok(narrative.parts.length >= 4);
  assert.ok(narrative.wordCount >= 180);
  const text = narrative.paragraphs.join('\n');
  const mixed = (bundle.vm.dimensions || []).filter((row) => row.claimStrength === 'mixed');
  const divergent = (bundle.vm.dimensions || []).filter((row) => row.claimStrength === 'divergent');
  if (mixed.length) {
    assert.match(text, /mixtes|hypothèse|à tester|pourrait/i);
  }
  if (divergent.length) {
    assert.match(text, /contredisent|ne pas conclure/i);
  }
  assert.doesNotMatch(text, /l'athlète est définitivement|preuve certaine|nous savons que/i);
  assert.doesNotMatch(text, /\[object Object\]/);
  const { html, pdfText } = await renderParityBundle(bundle);
  assert.match(html, /Analyse narrative du coach/);
  assert.match(pdfText, /Analyse narrative du coach/);
  assert.deepEqual(assertCrossSectionClaimConsistency({
    findings: bundle.vm.dimensions,
    portrait: bundle.vm.portraitCoach,
    plan: bundle.vm.fourWeekPlan,
    priorities: bundle.vm.coachPriorities,
    nutrition: { ...bundle.vm.nutrition, ...bundle.vm.nutritionOrganized, cards: bundle.vm.nutritionAction?.cards },
    pdfText,
    html,
  }), []);
});

test('narrative source coverage audit reports gaps without changing the questionnaire', () => {
  const bundle = buildParityBundle();
  const coverage = bundle.presentation.narrative.coverage;
  const ids = coverage.areas.map((area) => area.id);
  assert.deepEqual(ids, [
    'objectif',
    'pourquoi_maintenant',
    'reussite',
    'obstacles',
    'adhesion',
    'reprise',
    'structure',
    'choix',
    'communication',
    'nutrition',
  ]);
  assert.ok(coverage.areas.every((area) => 'sources' in area && 'clarificationUseful' in area));
});
