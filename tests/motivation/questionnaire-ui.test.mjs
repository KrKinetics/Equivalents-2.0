import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'coach-portal/motivation.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'coach-portal/assets/motivation.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'coach-portal/assets/portal.css'), 'utf8');
const reportHtml = fs.readFileSync(path.join(root, 'coach-portal/motivation-report.html'), 'utf8');
const reportJs = fs.readFileSync(path.join(root, 'coach-portal/assets/motivation-report.js'), 'utf8');

test('motivation radios and checkboxes are not stretched to 100%', () => {
  assert.match(css, /\.motivation-likert input\[type="radio"\]/);
  assert.match(css, /\.motivation-choices input\[type="checkbox"\]/);
  assert.match(css, /\.motivation-consent-box input\[type="checkbox"\]/);
  assert.match(css, /width:\s*18px/);
  assert.match(css, /max-width:\s*18px/);
  assert.match(css, /flex:\s*0 0 18px/);
});

test('Likert renders five compact numbered options with official end labels', () => {
  assert.match(js, /class="motivation-likert-scale"/);
  assert.match(js, /class="motivation-likert-opt"/);
  assert.match(js, /LIKERT_SCALE\.map/);
  assert.match(js, /LIKERT_LABELS\[0\]/);
  assert.match(js, /LIKERT_LABELS\[4\]/);
  assert.match(js, /const LIKERT_SCALE = \[1, 2, 3, 4, 5\]/);
});

test('choice cards associate labels and keep controls on the left', () => {
  assert.match(js, /class="motivation-choice-card"/);
  assert.match(js, /for="\$\{escapeHtml\(id\)\}"/);
  assert.match(css, /\.motivation-choice-card/);
  assert.match(css, /text-align:\s*left/);
  assert.match(css, /\.motivation-choice-card span[\s\S]*overflow-wrap:\s*anywhere/);
});

test('back and next buttons have explicit visible labels and styles', () => {
  assert.match(html, /← Précédent/);
  assert.match(html, /Suivant →/);
  assert.match(html, /aria-label="Précédent"/);
  assert.match(html, /aria-label="Suivant"/);
  assert.match(html, /class="motivation-btn-back/);
  assert.match(html, /class="motivation-btn-next/);
  assert.match(css, /button\.motivation-btn-back[\s\S]*background:\s*#fff/);
  assert.match(css, /button\.motivation-btn-back[\s\S]*color:\s*var\(--brand-primary\)/);
  assert.match(css, /button\.motivation-btn-next[\s\S]*background:\s*var\(--brand-primary\)/);
  assert.match(css, /button\.motivation-btn-next[\s\S]*color:\s*#fff/);
});

test('motivation form uses a questionnaire-specific max width', () => {
  assert.match(css, /\.motivation-page \.intake-shell[\s\S]{0,80}840px/);
  assert.doesNotMatch(css, /\.dashboard[\s\S]{0,40}840px/);
});

test('report PDF stays disabled until an official report is loaded and errors offer retry', () => {
  const reportCss = fs.readFileSync(path.join(root, 'coach-portal/assets/motivation-report.css'), 'utf8');
  assert.match(reportHtml, /id="download-pdf"[^>]*\bhidden\b/);
  assert.match(reportHtml, /id="download-pdf"[^>]*\bdisabled\b/);
  assert.match(reportHtml, /class="[^"]*\bhidden\b/);
  assert.match(reportHtml, /id="retry-report"/);
  assert.match(reportHtml, /Analyse temporairement indisponible/);
  assert.match(reportJs, /setPdfAvailable\(false\)/);
  assert.match(reportJs, /classList\.toggle\('hidden', !reportReady\)/);
  assert.match(reportJs, /showReportError/);
  assert.match(reportCss, /#download-pdf\[hidden\]/);
  assert.match(reportCss, /display:\s*none\s*!important/);
});
