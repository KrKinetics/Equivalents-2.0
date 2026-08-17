import { describe, it } from 'node:test';
import { expect } from './expect-shim.mjs';
import { isValidPdfBuffer } from '../../src/coach/motivation/lib/pdf/render-v31.mjs';
import { extractPdfPagesText } from '../../src/coach/motivation/lib/pdf/pdf-text.mjs';
import { renderMotivationPdf } from '../../src/coach/motivation/pdf/render-motivation-pdf.mjs';
import {
  COMPLETE_PROFILES,
  PROFILE_A_STABLE,
  PROFILE_B_RISKS,
  PROFILE_C_ADAPTIVE_NUTRITION,
  PROFILE_TEST1000098,
  analyzeCompleteMotivationProfile,
} from '../../src/coach/motivation/fixtures/complete-profiles.mjs';
import { TEST1000098_PREFERENCE_MATCH } from '../../src/coach/motivation/fixtures/test-1000098.mjs';

function assertCompleteContract({ submission, result }, profileId) {
  expect(result.report.schemaVersion).toBe('report-model-v4.2');
  expect(result.report.questionnaireVersion).toBe('questionnaire-v4.1');
  expect(result.report.rulesetVersion).toBe('ruleset-v4.1');
  expect(result.presentedQuestionCodes).toEqual(submission.presentedQuestionCodes);
  expect(result.adaptiveQuestionCodes).toEqual(submission.expectedAdaptiveQuestionCodes);
  expect(result.adaptiveQuestionCodes.length).toBeLessThanOrEqual(4);
  expect(result.scoring.dimensions.length).toBeGreaterThan(0);
  expect(result.nutrition.dimensions.length).toBeGreaterThan(0);
  expect(Array.isArray(result.evaluation.insights)).toBe(true);
  expect(Array.isArray(result.evaluation.contradictions)).toBe(true);
  expect(result.report.readiness).toBeDefined();
  expect(result.report.behavioralReadiness).toBeDefined();
  expect(Array.isArray(result.report.findings)).toBe(true);
  expect(Array.isArray(result.report.actionableFindings)).toBe(true);
  expect(Array.isArray(result.report.normalizedObstacles)).toBe(true);
  expect(result.report.fourWeekPlan.weeks.length).toBeGreaterThan(0);
  expect(result.report.interviewChecklist.length).toBeGreaterThan(0);
  expect(result.report.priorityInterviewQuestions.length).toBeGreaterThan(0);
  expect(result.provenance.questionnaireVersion).toBe('questionnaire-v4.1');
  expect(result.provenance.rulesetVersion).toBe('ruleset-v4.1');
  expect(result.provenance.reportModelVersion).toBe('report-model-v4.2');
  expect(result.provenance.contentHash).toHaveLength(64);
  expect(result.provenance.definitionSnapshot.questions.length).toBeGreaterThan(34);
  expect(profileId).toBeTruthy();
}

describe('complete motivation fixtures', () => {
  it('analyzes profiles A, B and C against the immutable engine', () => {
    for (const profile of COMPLETE_PROFILES) {
      const run = analyzeCompleteMotivationProfile(profile, {
        assessmentId: `asm_${profile.id}`,
        clientName: `Profil ${profile.id}`,
      });
      assertCompleteContract(run, profile.id);
    }
  });

  it('keeps TEST1000098 as a complete v4.1 / v4.2 profile', () => {
    const run = analyzeCompleteMotivationProfile(PROFILE_TEST1000098, {
      assessmentId: 'asm_test1000098',
      clientName: 'TEST1000098',
    });
    assertCompleteContract(run, 'TEST1000098');
    const { result } = run;
    expect(result.report.openAnswers.some((row) => /bien[- ]?[eê]tre/i.test(row.originalAnswer ?? ''))).toBe(true);
    expect(result.report.normalizedObstacles.some((row) => row.canonicalId === 'meal_plan' || row.canonicalId === 'food_planning')).toBe(true);
    const preference = result.report.directAnswers.find((row) => row.questionCode === 'NUT_PREF_01');
    expect(String(preference?.displayValue ?? '')).toMatch(TEST1000098_PREFERENCE_MATCH);
  });

  it('distinguishes a stable profile from a risk/contradiction profile', () => {
    const a = analyzeCompleteMotivationProfile(PROFILE_A_STABLE).result;
    const b = analyzeCompleteMotivationProfile(PROFILE_B_RISKS).result;
    const insightCodes = b.evaluation.insights.map((insight) => insight.code);
    const contradictionCodes = b.evaluation.contradictions.map((item) => item.code);
    expect(insightCodes).toContain('results_over_long_term');
    expect(insightCodes).toContain('all_or_nothing_risk');
    expect(contradictionCodes).toContain('intent_vs_history');
    expect(contradictionCodes).toContain('slow_progress_vs_results');
    expect(b.evaluation.insights.length).toBeGreaterThan(a.evaluation.insights.length);
    expect(b.evaluation.contradictions.length).toBeGreaterThan(a.evaluation.contradictions.length);
  });

  it('selects at least one nutrition adaptive item for profile C', () => {
    const { result } = analyzeCompleteMotivationProfile(PROFILE_C_ADAPTIVE_NUTRITION);
    expect(result.adaptiveQuestionCodes.some((code) => code.startsWith('NUT_'))).toBe(true);
  });

  it('renders a complete profile to a valid report-model-v4.2 PDF', async () => {
    const { result } = analyzeCompleteMotivationProfile(PROFILE_A_STABLE, {
      assessmentId: 'asm_pdf_a',
      clientName: 'Profil A',
      completedAt: new Date('2026-08-16T16:00:00.000Z'),
    });
    const { buffer, pageCount } = await renderMotivationPdf(result.report, {
      generatedAt: new Date('2026-08-16T16:00:00.000Z'),
      clientName: 'Profil A',
      clientId: result.report?.metadata?.clientId || 'client_complete',
    });
    expect(isValidPdfBuffer(buffer)).toBe(true);
    expect(pageCount).toBeGreaterThan(0);
    const text = (await extractPdfPagesText(buffer)).map((page) => page.text).join('\n');
    expect(text).toMatch(/KR Kinetics|Rapport coach/i);
  });
});
