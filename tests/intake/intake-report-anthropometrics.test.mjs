import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIntakeReportViewModel } from '../../src/coach/intake-report/intake-report-view-model.mjs';
import { buildIntakeReportDocumentHtml } from '../../src/coach/intake-report/build-intake-report-html.mjs';
import { describeWorkspaceIntakeLandmarks } from '../../src/coach/workspace/workspace-intake-landmarks.mjs';

const SUBMITTED_AT = '2026-08-15T16:05:00.000Z';
const BASE = Object.freeze({
  email: 'client.test@example.com',
  objective_primary: 'Perte de masse adipeuse',
  objective_detail: 'Retrouver de l’énergie.',
  activity_level: 'Modéré',
  work_type: 'Bureau',
  schedule: 'Matin',
  medications_status: 'Non',
  allergies_status: 'Non',
  restriction_status: 'Non',
  challenges: ['Manque de temps'],
  interview_priority: 'Plan de semaine',
  consent: true,
});

test('web and PDF anthropometrics stay identical for an imperial submission', () => {
  const answers = {
    ...BASE,
    age_years: '34',
    height_unit: 'imperial',
    height_feet: '5',
    height_inches: '10',
    weight_lb: '185',
  };
  const vm = buildIntakeReportViewModel({
    clientName: 'Alex Test',
    submittedAt: SUBMITTED_AT,
    answers,
  });
  assert.equal(vm.anthropometrics.age, '34 ans');
  assert.equal(vm.anthropometrics.heightPrimary, '5 pi 10 po');
  assert.equal(vm.anthropometrics.heightSecondary, '178 cm');
  assert.equal(vm.anthropometrics.weightPrimary, '185 lb');
  assert.equal(vm.anthropometrics.weightSecondary, '83,9 kg');
  const screen = buildIntakeReportDocumentHtml({ viewModel: vm, mode: 'screen' });
  const pdf = buildIntakeReportDocumentHtml({ viewModel: vm, mode: 'pdf' });
  assert.match(screen, /REPÈRES DE PLANIFICATION/);
  assert.match(pdf, /REPÈRES DE PLANIFICATION/);
  assert.match(screen, /Poids déclaré au questionnaire/);
  assert.match(pdf, /Poids déclaré au questionnaire/);
  assert.ok(screen.indexOf('REPÈRES DE PLANIFICATION') < screen.indexOf('OBJECTIF'));
  assert.ok(pdf.indexOf('REPÈRES DE PLANIFICATION') < pdf.indexOf('OBJECTIF'));
  const screenVm = buildIntakeReportViewModel({ clientName: 'Alex Test', submittedAt: SUBMITTED_AT, answers });
  const pdfVm = buildIntakeReportViewModel({ clientName: 'Alex Test', submittedAt: SUBMITTED_AT, answers });
  assert.deepEqual(screenVm.anthropometrics, pdfVm.anthropometrics);
  assert.deepEqual(screenVm.anthropometrics, vm.anthropometrics);
});

test('metric submission keeps entered centimetres first', () => {
  const vm = buildIntakeReportViewModel({
    clientName: 'Alex Test',
    submittedAt: SUBMITTED_AT,
    answers: {
      ...BASE,
      age_years: '34',
      height_unit: 'metric',
      height_cm: '178',
      weight_lb: '185',
    },
  });
  assert.equal(vm.anthropometrics.heightPrimary, '178 cm');
  assert.equal(vm.anthropometrics.heightSecondary, '5 pi 10 po');
});

test('legacy intake report omits the planning block and never prints undefined or 0', () => {
  const vm = buildIntakeReportViewModel({
    clientName: 'Alex Test',
    submittedAt: SUBMITTED_AT,
    answers: BASE,
  });
  assert.equal(vm.anthropometrics, null);
  const html = buildIntakeReportDocumentHtml({ viewModel: vm, mode: 'screen' });
  assert.doesNotMatch(html, /REPÈRES DE PLANIFICATION/);
  assert.doesNotMatch(html, /undefined/);
  assert.doesNotMatch(html, />0 ans<|>0 lb<|>0 cm</);
});

test('nutrition workspace landmarks stay read-only and dated', () => {
  const landmarks = describeWorkspaceIntakeLandmarks({
    ...BASE,
    age_years: '34',
    height_unit: 'imperial',
    height_feet: '5',
    height_inches: '10',
    weight_lb: '185',
  }, SUBMITTED_AT);
  assert.match(landmarks.age, /34 ans/);
  assert.match(landmarks.heightPrimary, /5 pi 10 po/);
  assert.match(landmarks.weightPrimary, /185 lb/);
  assert.ok(landmarks.submittedAtDisplay);
  assert.equal(describeWorkspaceIntakeLandmarks(BASE, SUBMITTED_AT), null);
});
