import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePdfRequestBody } from '../src/coach/server/validation/pdf-request.mjs';
import { buildPlanSnapshot } from '../src/coach/server/pdf/build-plan-snapshot.mjs';
import { buildPdfDocumentHtml } from '../src/coach/server/pdf/build-pdf-html.mjs';
import { buildPdfFilename } from '../src/coach/server/pdf/filename.mjs';
import { authorizeClientAccess } from '../src/coach/server/pdf/authorize-client-access.mjs';
import { computeBanqueTotals, computePlannedTotalsFromRepartition } from '../src/lib/coach-calculator-engine.mjs';
import { brandIdFromOrganizationSlug } from '../src/coach/workspace/org-brand.mjs';

const validDay = {
  banque: { pro: 2, fec: 3, leg: 1, fru: 1, lai: 0, lip: 1, whey: 0 },
  repartition: [
    1, 1, 0, 0, 0, 0, 0,
    0, 1, 0, 1, 0, 0, 0,
    1, 1, 1, 0, 0, 1, 0,
    0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0,
  ],
  targets: { kcal: 1800, pro: 120, glu: 180, lip: 60 },
};
const validBody = {
  organization_slug: 'kr-kinetics',
  client_id: '11111111-1111-4111-8111-111111111111',
  locale: 'fr',
  athlete_name: 'Ana Test',
  goal_label: 'Maintien',
  macro_ratio_label: '25 / 45 / 30',
  coach_notes: 'Prendre avec un repas.',
  training: validDay,
};

function mockRes() {
  const result = { headers: {}, body: null, statusCode: 0 };
  return {
    result,
    res: {
      statusCode: 0,
      setHeader(key, value) { result.headers[key] = value; },
      end(body) {
        result.body = body;
        this.statusCode = this.statusCode || result.statusCode;
      },
      get statusCode() { return result.statusCode; },
      set statusCode(v) { result.statusCode = v; },
    },
  };
}

test('PDF request validator accepts valid body and rejects unsafe payloads', () => {
  assert.equal(validatePdfRequestBody(validBody).ok, true);
  assert.equal(validatePdfRequestBody({}).ok, false);
  assert.equal(validatePdfRequestBody({ ...validBody, extra: true }).ok, false);
  assert.equal(validatePdfRequestBody({ ...validBody, client_id: 'not-a-uuid' }).ok, false);
  assert.equal(validatePdfRequestBody({ ...validBody, athlete_name: 'x'.repeat(121) }).ok, false);
  assert.equal(validatePdfRequestBody({ ...validBody, training: { ...validDay, targets: { ...validDay.targets, kcal: 99_999 } } }).ok, false);
  assert.equal(validatePdfRequestBody({ ...validBody, coach_notes: '<script>alert(1)</script>' }).ok, false);
  assert.equal(validatePdfRequestBody({ ...validBody, coach_notes: 'javascript:alert(1)' }).ok, false);
  assert.equal(validatePdfRequestBody({ ...validBody, training: { ...validDay, banque: { nope: 1 } } }).ok, false);
  assert.equal(validatePdfRequestBody({ ...validBody, organization_slug: '../etc/passwd' }).ok, false);
  assert.equal(validatePdfRequestBody({ ...validBody, athlete_name: 'https://evil.example/x' }).ok, true);
  assert.equal(validatePdfRequestBody({ ...validBody, locale: 'es' }).ok, false);
});

test('PDF snapshot matches calculator engine totals', () => {
  const snapshot = buildPlanSnapshot({ day: validDay, targets: validDay.targets, locale: 'fr' });
  assert.deepEqual(snapshot.banqueTotals, computeBanqueTotals(validDay.banque));
  assert.deepEqual(snapshot.plannedTotals, computePlannedTotalsFromRepartition(validDay.repartition));
  assert.ok(snapshot.meals.length >= 1);
  assert.equal(snapshot.jourLabel.includes('Entraînement') || snapshot.jourLabel.includes('Training'), true);
});

test('PDF HTML FR/EN × KR/Elevate — texts, order, escaping, no secrets', () => {
  const cases = [
    { locale: 'fr', brandId: 'kr', brandText: 'KR Kinetics', recon: 'Réconciliation' },
    { locale: 'en', brandId: 'kr', brandText: 'KR Kinetics', recon: 'Energy reconciliation' },
    { locale: 'fr', brandId: 'elevate', brandText: 'Elevate Fitness', recon: 'Réconciliation' },
    { locale: 'en', brandId: 'elevate', brandText: 'Elevate Fitness', recon: 'Energy reconciliation' },
  ];
  for (const c of cases) {
    const snapshot = buildPlanSnapshot({ day: validDay, targets: validDay.targets, locale: c.locale });
    const html = buildPdfDocumentHtml({
      locale: c.locale,
      brandId: c.brandId,
      athleteName: 'José-François Éléphant',
      dateStr: '2026-08-04',
      goalLabel: c.locale === 'fr' ? 'Maintien' : 'Maintenance',
      ratioLabel: '25 / 45 / 30',
      notes: '<b>Safe text</b>',
      trainingSnapshot: snapshot,
    });
    assert.match(html, new RegExp(c.brandText));
    assert.match(html, /José-François Éléphant|José-François/);
    assert.match(html, new RegExp(c.recon));
    assert.match(html, /&lt;b&gt;Safe text&lt;\/b&gt;/);
    assert.doesNotMatch(html, /<b>Safe text<\/b>/);
    assert.doesNotMatch(html, /service_role|SUPABASE_SERVICE|eyJ[A-Za-z0-9_-]{20,}\./i);
    assert.doesNotMatch(html, /coach_access_token|Bearer /i);
    assert.match(html, /Préparé par|Prepared by/);
    assert.match(html, new RegExp(`data-pdf-brand="${c.brandId}"`));
    assert.match(html, /pdf-brand-header/);
    assert.match(html, /pdf-brand-rule/);
    if (c.brandId === 'elevate') {
      assert.doesNotMatch(html, /KR Kinetics/);
      assert.match(html, /#D4A94F|#050505/);
    }
    if (c.brandId === 'kr') {
      assert.doesNotMatch(html, /Elevate Fitness/);
      assert.match(html, /#ED1136|#071B41/);
    }
    assert.doesNotMatch(html, /filter:brightness\(0\)\s*invert\(1\)/);
    const pageCount = (html.match(/<section class="pdf-a4-page/g) || []).length;
    assert.equal(pageCount, 1);
  }
});

test('PDF with rest day yields two pages when rest has planned kcal', () => {
  const training = buildPlanSnapshot({ day: validDay, targets: validDay.targets, locale: 'fr', jourKey: 'entrainement' });
  const rest = buildPlanSnapshot({ day: validDay, targets: validDay.targets, locale: 'fr', jourKey: 'repos' });
  const html = buildPdfDocumentHtml({
    locale: 'fr', brandId: 'kr', athleteName: 'Ana', dateStr: '2026-08-04',
    goalLabel: 'Maintien', ratioLabel: '25/45/30', trainingSnapshot: training, restSnapshot: rest,
  });
  assert.equal((html.match(/<section class="pdf-a4-page/g) || []).length, 2);
});

test('PDF filename follows brand and locale conventions', () => {
  assert.equal(
    buildPdfFilename({ locale: 'fr', brandSlug: 'kr', athleteName: 'Ana Léa!', dateIso: '2026-08-04' }),
    'Plan_KR_Kinetics_Ana_Léa__2026-08-04.pdf',
  );
  assert.equal(
    buildPdfFilename({ locale: 'en', brandSlug: 'elevate', athleteName: 'Ana Test', dateIso: '2026-08-04' }),
    'Plan_Elevate_Fitness_Ana_Test_2026-08-04_EN.pdf',
  );
  assert.equal(brandIdFromOrganizationSlug('kr-kinetics'), 'kr');
  assert.equal(brandIdFromOrganizationSlug('elevate-fitness'), 'elevate');
  assert.equal(brandIdFromOrganizationSlug('other'), null);
});

test('client access is organization-scoped and fictional-only', async () => {
  const good = await authorizeClientAccess({
    accessToken: 'jwt', organizationId: 'org', clientId: 'client', supabaseUrl: 'https://example.test',
    publishableKey: 'key',
    fetchImpl: async () => ({
      ok: true,
      json: async () => [{ id: 'client', organization_id: 'org', full_name: 'Demo', is_fictional: true }],
    }),
  });
  assert.deepEqual(good, { ok: true, client: { id: 'client', organization_id: 'org', full_name: 'Demo' } });

  const wrongOrg = await authorizeClientAccess({
    accessToken: 'jwt', organizationId: 'other', clientId: 'client', supabaseUrl: 'https://example.test',
    publishableKey: 'key',
    fetchImpl: async () => ({
      ok: true,
      json: async () => [{ id: 'client', organization_id: 'org', is_fictional: true }],
    }),
  });
  assert.deepEqual(wrongOrg, { ok: false, error: 'forbidden' });

  const nonFictional = await authorizeClientAccess({
    accessToken: 'jwt', organizationId: 'org', clientId: 'client', supabaseUrl: 'https://example.test',
    publishableKey: 'key',
    fetchImpl: async () => ({
      ok: true,
      json: async () => [{ id: 'client', organization_id: 'org', is_fictional: false }],
    }),
  });
  assert.deepEqual(nonFictional, { ok: false, error: 'forbidden' });
});

test('PDF endpoint rejects unauthenticated and invalid payloads before PDF stream', async () => {
  const handler = (await import('../api/coach-generate-pdf.js')).default;

  const noAuth = mockRes();
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: validBody,
    socket: {},
  }, noAuth.res);
  assert.equal(noAuth.result.statusCode, 401);
  assert.match(String(noAuth.result.body), /"error":"unauthorized"/);
  assert.equal(noAuth.result.headers['Cache-Control'], 'private, no-store');
  assert.equal(noAuth.result.headers['X-Content-Type-Options'], 'nosniff');
  assert.ok(noAuth.result.headers['X-Request-Id']);

  const badJson = mockRes();
  await handler({
    method: 'POST',
    headers: { cookie: 'coach_access_token=x', 'content-type': 'application/json' },
    body: { ...validBody, extra: true },
    socket: {},
  }, badJson.res);
  assert.ok([400, 401].includes(badJson.result.statusCode));
  assert.match(String(badJson.result.body), /error/);
  assert.doesNotMatch(String(badJson.result.body), /%PDF/);

  const method = mockRes();
  await handler({ method: 'GET', headers: {}, socket: {} }, method.res);
  assert.equal(method.result.statusCode, 405);
});

test('PDF renderer smoke test', { skip: process.env.SKIP_PDF_RENDER === '1' }, async (t) => {
  try {
    const { renderHtmlToPdfBuffer } = await import('../src/coach/server/pdf/render-pdf.mjs');
    const snapshot = buildPlanSnapshot({ day: validDay, targets: validDay.targets, locale: 'fr' });
    const html = buildPdfDocumentHtml({
      locale: 'fr', brandId: 'kr', athleteName: 'Smoke', dateStr: '2026-08-04',
      goalLabel: 'Maintien', ratioLabel: '25/45/30', trainingSnapshot: snapshot,
    });
    const pdf = await renderHtmlToPdfBuffer(html);
    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.ok(pdf.length > 500);
  } catch (error) {
    const detail = `${error?.message || ''} ${error?.cause?.message || ''} ${error?.code || ''}`;
    if (/Could not find Chrome|Failed to launch|browser_launch|renderer is unavailable|pdf_render_failed/i.test(detail)) {
      t.skip('No local Chromium available');
    } else throw error;
  }
});
