import { describe, it } from 'node:test';
import { expect } from './expect-shim.mjs';
import { resolveFontFile } from '../../src/coach/motivation/lib/pdf/components/layout.mjs';
import { NARRATIVE_STYLE } from '../../src/coach/motivation/lib/pdf/theme.mjs';
import { assertValidUnicode } from '../../src/coach/motivation/lib/pdf/unicode-guard.mjs';
import { extractPdfPagesText } from '../../src/coach/motivation/lib/pdf/pdf-text.mjs';
import { isValidPdfBuffer } from '../../src/coach/motivation/lib/pdf/render-v31.mjs';
import {
  PROFILE_A_STABLE,
  analyzeCompleteMotivationProfile,
} from '../../src/coach/motivation/fixtures/complete-profiles.mjs';
import {
  renderMotivationPdf,
  motivationPdfFilename,
} from '../../src/coach/motivation/pdf/render-motivation-pdf.mjs';

function sampleInput() {
  return analyzeCompleteMotivationProfile(PROFILE_A_STABLE, {
    assessmentId: 'asm_pdf',
    clientName: 'Client été',
    completedAt: new Date('2026-08-16T12:00:00.000Z'),
  }).result;
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
