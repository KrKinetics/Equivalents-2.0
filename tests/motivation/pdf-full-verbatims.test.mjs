import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParityBundle, renderParityBundle } from './report-parity-helpers.mjs';

test('PDF prints every athlete verbatim from the presentation model', async () => {
  const bundle = buildParityBundle();
  const { html, pdfText } = await renderParityBundle(bundle);
  const verbatims = bundle.vm.verbatims || [];
  assert.ok(verbatims.length >= 1);
  assert.equal(bundle.presentation.manifest.verbatims, verbatims.length);
  const compactPdf = pdfText.replace(/\s+/g, ' ');
  const compactHtml = html.replace(/\s+/g, ' ');
  for (const item of verbatims) {
    const snippet = item.verbatim.slice(0, 28);
    const escaped = snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(compactHtml, new RegExp(escaped));
    assert.match(compactPdf, new RegExp(escaped));
  }
});
