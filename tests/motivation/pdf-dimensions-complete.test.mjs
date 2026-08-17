import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParityBundle, renderParityBundle } from './report-parity-helpers.mjs';

test('PDF appendix prints every available dimension', async () => {
  const bundle = buildParityBundle();
  const { pdfText } = await renderParityBundle(bundle);
  const dimensions = bundle.vm.dimensions || [];
  const groups = bundle.vm.dimensionGroups || [];
  const appendixCount = groups.reduce((sum, group) => sum + (group.items || []).length, 0);
  assert.ok(dimensions.length >= 8);
  assert.equal(bundle.presentation.manifest.dimensionGroups, appendixCount || dimensions.length);
  assert.match(pdfText, /Annexe — Dimensions détaillées|Annexe - Dimensions/i);
  const compact = pdfText.replace(/\s+/g, ' ');
  for (const row of dimensions) {
    assert.match(compact, new RegExp(String(row.label).slice(0, 18).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
