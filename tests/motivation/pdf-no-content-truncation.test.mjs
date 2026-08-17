import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOTIVATION_PDF_PAGE_GUARD } from '../../src/coach/motivation/lib/pdf/render-v44-kr.mjs';
import { buildParityBundle, renderParityBundle } from './report-parity-helpers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('v4.4 PDF renderer has no artificial page cap or content slices', () => {
  const src = fs.readFileSync(path.join(root, 'src/coach/motivation/lib/pdf/render-v44-kr.mjs'), 'utf8');
  assert.doesNotMatch(src, /this\.page >= 5/);
  assert.doesNotMatch(src, /already >= 5/);
  assert.doesNotMatch(src, /bullets\(items, limit/);
  assert.doesNotMatch(src, /\.slice\(0,\s*[0-9]+\)/);
  assert.match(src, /MOTIVATION_PDF_PAGE_GUARD/);
  assert.match(src, /MotivationPdfPageLimitError/);
  assert.equal(MOTIVATION_PDF_PAGE_GUARD, 20);
});

test('presentation items are all present in the PDF text', async () => {
  const bundle = buildParityBundle();
  const { pdfText, rendered } = await renderParityBundle(bundle);
  const presentation = bundle.presentation;
  for (const item of presentation.sections.find((section) => section.id === 'priorities')?.items || []) {
    assert.match(pdfText.replace(/\s+/g, ' '), new RegExp(item.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const item of presentation.sections.find((section) => section.id === 'verbatims')?.items || []) {
    assert.match(pdfText.replace(/\s+/g, ' '), new RegExp(item.verbatim.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const weeks = presentation.sections.find((section) => section.id === 'four-week-plan')?.weeks || [];
  assert.equal(weeks.length, presentation.manifest.fourWeekPlan);
  for (const week of weeks) {
    assert.match(pdfText, new RegExp(`Semaine ${week.week}`, 'i'));
  }
  assert.ok(rendered.pageCount <= MOTIVATION_PDF_PAGE_GUARD);
});
