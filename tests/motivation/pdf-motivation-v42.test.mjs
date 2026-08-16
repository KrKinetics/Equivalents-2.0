import { describe, it } from 'node:test';
import { expect } from './expect-shim.mjs';
import { resolveFontFile } from '../../src/coach/motivation/lib/pdf/components/layout.mjs';
import { NARRATIVE_STYLE } from '../../src/coach/motivation/lib/pdf/theme.mjs';
import { assertValidUnicode } from '../../src/coach/motivation/lib/pdf/unicode-guard.mjs';
import { extractPdfPagesText } from '../../src/coach/motivation/lib/pdf/pdf-text.mjs';
import { isValidPdfBuffer } from '../../src/coach/motivation/lib/pdf/render-v31.mjs';
import {
  QUESTIONNAIRE_V41,
  RULESET_V41,
  REPORT_MODEL_V42,
} from '../../src/coach/motivation/versions/motivation-versions.mjs';
import { analyzeMotivationAssessment } from '../../src/coach/motivation/engine/analyze-motivation.mjs';
import {
  renderMotivationPdf,
  motivationPdfFilename,
} from '../../src/coach/motivation/pdf/render-motivation-pdf.mjs';

function sampleInput() {
  const codes = ['COACH_01', 'GOAL_01', 'NUT_GOAL_01', 'MOT_RES_01', 'CHOICE_01', 'CHOICE_03'];
  const questions = codes.map((code, i) => {
    if (code.startsWith('GOAL') || code.startsWith('NUT_GO')) {
      return {
        id: `q${i}`,
        code,
        text: code,
        type: 'short_text',
        required: true,
        active: true,
        order: i + 1,
        section: 't',
        interpretationTags: code.includes('NUT') ? ['nutrition_goal'] : ['goal'],
      };
    }
    return {
      id: `q${i}`,
      code,
      text: code,
      type: 'likert',
      required: true,
      active: true,
      order: i + 1,
      section: 't',
      likertMin: 1,
      likertMax: 5,
      scoringDirection: 'positive',
      interpretationTags: [],
      primaryDimension: code.startsWith('CHOICE') ? 'choice_need' : 'self_efficacy',
    };
  });
  const answers = questions.map((q) => {
    if (q.type === 'short_text') {
      return {
        questionId: q.id,
        textValue: q.code === 'GOAL_01' ? 'être en forme déjà' : 'qualité',
      };
    }
    return { questionId: q.id, numericValue: q.code === 'COACH_01' ? 5 : 3 };
  });
  return analyzeMotivationAssessment({
    questionnaireVersion: QUESTIONNAIRE_V41,
    rulesetVersion: RULESET_V41,
    reportModelVersion: REPORT_MODEL_V42,
    questions,
    answers,
    assessmentId: 'asm_pdf',
    clientName: 'Client été',
    completedAt: new Date('2026-08-16T12:00:00.000Z'),
  });
}

describe('motivation PDF v4.2', () => {
  it('resolves registered Roboto fonts (no Helvetica fallback)', () => {
    expect(resolveFontFile('Roboto-Regular.ttf')).toMatch(/Roboto-Regular\.ttf$/);
    expect(resolveFontFile('Roboto-Bold.ttf')).toMatch(/Roboto-Bold\.ttf$/);
    expect(NARRATIVE_STYLE.font).not.toMatch(/Helvetica|Times-Roman|Courier/i);
  });

  it('builds a confidential filename from the shared helper', () => {
    const name = motivationPdfFilename({
      clientName: 'Éric Test',
      date: new Date('2026-08-16T12:00:00.000Z'),
    });
    expect(name).toMatch(/^rapport-coach-motivation-eric-test-2026-08-16\.pdf$/);
  });

  it('renders a report-model-v4.2 snapshot to a valid PDF', async () => {
    const { report } = sampleInput();
    const { buffer, pageCount } = await renderMotivationPdf(report, {
      generatedAt: new Date('2026-08-16T12:00:00.000Z'),
    });
    expect(isValidPdfBuffer(buffer)).toBe(true);
    expect(pageCount).toBeGreaterThan(0);
    const pages = await extractPdfPagesText(buffer);
    const text = pages.map((p) => p.text).join('\n');
    assertValidUnicode(text);
    expect(text).toMatch(/KR Kinetics|Rapport coach/i);
  });
});
