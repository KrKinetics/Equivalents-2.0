import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPdfClientIdentity,
  buildCanonicalClientIdentity,
  buildMotivationPdfFilename,
  pdfDocumentInfo,
  shortClientId,
} from '../../src/coach/motivation/identity/canonical-client-identity.mjs';
import { analyzeCompleteMotivationProfileV43, V43_COHERENT } from '../../src/coach/motivation/fixtures/complete-profiles-v43.mjs';
import { renderMotivationPdf, motivationPdfFilename } from '../../src/coach/motivation/pdf/render-motivation-pdf.mjs';
import { extractPdfPagesText } from '../../src/coach/motivation/lib/pdf/pdf-text.mjs';
import { generateOfficialMotivationPdf } from '../../src/coach/server/motivation/generate-motivation-pdf.mjs';

const DANNY = {
  id: '5a94561a-1111-4111-8111-aaaaaaaaaaaa',
  full_name: 'Danny R',
  email: 'danny@example.com',
  phone: '5145550100',
  service_type: 'complete',
};

test('canonical identity refuses a missing name and never falls back to Client', () => {
  assert.equal(buildCanonicalClientIdentity({ id: DANNY.id, full_name: '' }).error, 'client_identity_missing');
  assert.equal(buildCanonicalClientIdentity({ id: '', full_name: 'Danny R' }).error, 'client_identity_missing');
  const ok = buildCanonicalClientIdentity(DANNY);
  assert.equal(ok.ok, true);
  assert.equal(ok.identity.shortId, '5a94561a');
  assert.equal(ok.identity.fullName, 'Danny R');
});

test('identity mismatch blocks PDF generation', () => {
  const identity = buildCanonicalClientIdentity(DANNY).identity;
  assert.equal(assertPdfClientIdentity({
    requestedClientId: DANNY.id,
    analysisClientId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    reportClientId: DANNY.id,
    identity,
  }).error, 'client_identity_mismatch');
});

test('filename contains slug, short ref, date and analysis version', () => {
  const identity = buildCanonicalClientIdentity(DANNY).identity;
  const name = buildMotivationPdfFilename({
    identity,
    submittedAt: '2026-08-16T12:00:00.000Z',
    analysisVersion: 1,
  });
  assert.equal(name, 'profil-motivationnel_danny-r_5a94561a_2026-08-16_v1.pdf');
  const other = buildCanonicalClientIdentity({
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    full_name: 'Danny R',
  }).identity;
  const otherName = buildMotivationPdfFilename({
    identity: other,
    submittedAt: '2026-08-16T12:00:00.000Z',
    analysisVersion: 1,
  });
  assert.notEqual(name, otherName);
  assert.match(otherName, /bbbbbbbb/);
});

test('PDF metadata and every page carry the client name and short ref', async () => {
  const { result } = analyzeCompleteMotivationProfileV43(V43_COHERENT, {
    clientId: DANNY.id,
    clientName: DANNY.full_name,
  });
  const identity = buildCanonicalClientIdentity(DANNY).identity;
  const rendered = await renderMotivationPdf(result.report, {
    identity,
    analysisVersion: 1,
    submittedAt: '2026-08-16T12:00:00.000Z',
    analyzedAt: '2026-08-16T12:05:00.000Z',
  });
  assert.ok(rendered.pageCount >= 4);
  assert.ok(rendered.pageCount <= 5);
  const pages = await extractPdfPagesText(rendered.buffer);
  assert.match(pages[0].text, /Danny R/);
  for (const page of pages) {
    assert.match(page.text, /Danny R/);
    assert.match(page.text, /5a94561a/);
  }
  const info = pdfDocumentInfo(identity, 1);
  assert.match(info.Title, /Danny R/);
  assert.match(info.Subject, /Danny R/);
  assert.equal(info.Author, 'KR Kinetics');
  assert.equal(shortClientId(DANNY.id), '5a94561a');
  assert.match(motivationPdfFilename({ identity, submittedAt: '2026-08-16T12:00:00.000Z', analysisVersion: 1 }), /danny-r_5a94561a/);
});

test('official PDF path never invents a Client fallback name', () => {
  assert.equal(buildCanonicalClientIdentity({ id: DANNY.id, full_name: '   ' }).error, 'client_identity_missing');
});
