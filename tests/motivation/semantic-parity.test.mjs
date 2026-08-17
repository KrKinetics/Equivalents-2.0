import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeCompleteMotivationProfileV43,
  V43_COHERENT,
  V43_MIXED,
  V43_NUTRITION,
  V43_WEAK,
} from '../../src/coach/motivation/fixtures/complete-profiles-v43.mjs';
import { buildMotivationReportViewModel } from '../../src/coach/motivation/report/motivation-report-view-model.mjs';
import { buildMotivationReportMarkup } from '../../src/coach/motivation/report/build-motivation-report-html.mjs';
import { renderMotivationPdf } from '../../src/coach/motivation/pdf/render-motivation-pdf.mjs';
import { extractPdfPagesText } from '../../src/coach/motivation/lib/pdf/pdf-text.mjs';
import { findingByKey } from '../../src/coach/motivation/report/v44/findings.mjs';
import { assertClaimLanguage } from '../../src/coach/motivation/report/v44/language.mjs';

const CLIENT = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  name: 'Client test KR',
};

function analyze(profile) {
  return analyzeCompleteMotivationProfileV43(profile, {
    clientId: CLIENT.id,
    clientName: CLIENT.name,
  }).result;
}

function viewModel(result) {
  return buildMotivationReportViewModel({
    report: result.report,
    clientId: CLIENT.id,
    clientName: CLIENT.name,
  });
}

test('web and PDF consume the same claimStrength for mixed and weak profiles', async () => {
  for (const profile of [V43_MIXED, V43_WEAK, V43_NUTRITION, V43_COHERENT]) {
    const result = analyze(profile);
    const vm = viewModel(result);
    const html = buildMotivationReportMarkup(vm);
    const rendered = await renderMotivationPdf(result.report, {
      clientId: CLIENT.id,
      clientName: CLIENT.name,
      analysisVersion: 1,
    });
    const pdfText = (await extractPdfPagesText(rendered.buffer)).map((page) => page.text).join('\n');
    for (const key of ['adherence_recovery', 'nutrition_structure']) {
      const finding = findingByKey(result.report.canonicalFindings, key);
      const vmFinding = (vm.canonicalFindings || []).find((item) => item.key === key || item.domain === key || item.id === key);
      if (!finding) continue;
      if (vmFinding?.claimStrength) {
        assert.equal(vmFinding.claimStrength, finding.claimStrength, `${profile.id || 'profile'} ${key}`);
      }
      if (finding.claimStrength === 'mixed' || finding.claimStrength === 'divergent') {
        assert.doesNotMatch(pdfText, /Reprise\s*:\s*élevée/i);
        assert.doesNotMatch(html, /Reprise\s*:\s*élevée/i);
        if (key === 'nutrition_structure') {
          assert.doesNotMatch(pdfText, /Besoin de structure alimentaire élevé(?!e)/i);
        }
      }
      const errors = assertClaimLanguage([
        { key, text: pdfText, claimStrength: finding.claimStrength },
        { key, text: html, claimStrength: finding.claimStrength },
      ], result.report.canonicalFindings);
      assert.deepEqual(errors, [], errors.join('; '));
    }
  }
});
