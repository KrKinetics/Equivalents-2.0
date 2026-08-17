import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildParityBundle, renderParityBundle } from '../tests/motivation/report-parity-helpers.mjs';
import { auditNarrativeSourceCoverage } from '../src/coach/motivation/report/build-coach-narrative.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'reports', 'motivation-2f-visual');
fs.mkdirSync(outDir, { recursive: true });

const bundle = buildParityBundle();
const { html, rendered, pages, pdfText } = await renderParityBundle(bundle);
fs.writeFileSync(path.join(outDir, 'client-test-kr.pdf'), rendered.buffer);
fs.writeFileSync(path.join(outDir, 'web-report.html'), `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><link rel="stylesheet" href="../../coach-portal/assets/motivation-report.css"></head><body>${html}</body></html>`);
const coverage = auditNarrativeSourceCoverage(bundle.vm);
const summary = {
  pageCount: rendered.pageCount,
  manifest: bundle.presentation.manifest,
  narrativeWordCount: bundle.presentation.narrative.wordCount,
  coverage,
  sections: bundle.presentation.sections.map((section) => section.id),
  pageRoles: rendered.pageStats,
};
fs.writeFileSync(path.join(outDir, 'qa-summary.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, 'pdf-text.txt'), pdfText);
console.log(JSON.stringify({
  pageCount: rendered.pageCount,
  pages: pages.length,
  wordCount: bundle.presentation.narrative.wordCount,
  sections: summary.sections,
  gaps: coverage.gaps.map((item) => item.id),
}, null, 2));
