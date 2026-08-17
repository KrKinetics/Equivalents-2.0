import test from 'node:test';
import assert from 'node:assert/strict';
import { isEffectivelyBlankPage } from '../../src/coach/motivation/lib/pdf/pdf-text.mjs';
import { MOTIVATION_PDF_PAGE_GUARD } from '../../src/coach/motivation/lib/pdf/render-v44-kr.mjs';
import { buildParityBundle, renderParityBundle } from './report-parity-helpers.mjs';

test('PDF pages flow without blank pages or an artificial 5-page cap', async () => {
  const bundle = buildParityBundle();
  const { pages, rendered, pdfText } = await renderParityBundle(bundle);
  assert.ok(rendered.pageCount >= 4);
  assert.ok(rendered.pageCount <= MOTIVATION_PDF_PAGE_GUARD);
  assert.equal(pages.length, rendered.pageCount);
  for (const page of pages) {
    assert.equal(isEffectivelyBlankPage(page.text), false, `blank page ${page.pageNumber}`);
    assert.match(page.text, /Client test KR/);
  }
  assert.match(pdfText, /Analyse narrative du coach/);
  assert.match(pdfText, /Annexe/);
  assert.match(pdfText, /Informations techniques/);
  assert.doesNotMatch(pdfText, /\[object Object\]/);
  assert.doesNotMatch(pdfText, /Semaine 1\s*[—–-]\s*Semaine 1/i);
  assert.doesNotMatch(pdfText, /Tendance modéré\b/i);
  const planPage = pages.find((page) => /Plan 4 semaines/i.test(page.text));
  assert.ok(planPage, 'Plan 4 semaines must be present in the PDF');
  assert.match(planPage.text, /Semaine 1/i, 'Plan 4 semaines title must stay with its first week');
  assert.equal((rendered.pageStats || []).length, rendered.pageCount);
  assert.ok((rendered.pageStats || []).every((row) => row.usedHeight > 0 && row.blockCount >= 1));
});
