import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParityBundle, renderParityBundle, PARITY_CLIENT } from './report-parity-helpers.mjs';

test('every PDF page carries athlete name, reference and analysis', async () => {
  const bundle = buildParityBundle();
  const { pages, rendered, pdfText } = await renderParityBundle(bundle);
  assert.ok(rendered.pageCount >= 4);
  assert.match(pages[0].text, /Client test KR/);
  assert.match(pages[0].text, /client\.test@example\.com|Courriel/i);
  assert.match(pdfText, /Référence|Réf\./);
  for (const page of pages) {
    assert.match(page.text, /Client test KR/);
    assert.match(page.text, new RegExp(bundle.identity.shortId));
    assert.match(page.text, /Page \d+ \/ \d+/);
  }
  assert.match(pdfText, /Analyse : v1|Analyse v1/);
  assert.equal(PARITY_CLIENT.full_name, 'Client test KR');
});
