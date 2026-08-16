/**
 * KR Kinetics pre-interview report — ViewModel, HTML, auth, PDF path.
 * Does not exercise invite mail, questionnaire submission, or nutrition PDF builders.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { authorizeClientAccess } from '../src/coach/server/pdf/authorize-client-access.mjs';
import { authorizeIntakeReportAccess } from '../src/coach/intake-report/authorize-intake-report-access.mjs';
import { loadSubmittedIntakeReport } from '../src/coach/intake-report/load-submitted-intake-report.mjs';
import { validateIntakeReportPdfBody } from '../src/coach/intake-report/validate-intake-report-pdf-request.mjs';
import { intakeReportOpenPath } from '../src/coach/intake-report/intake-report-path.mjs';
import { buildIntakeReportPdfFilename } from '../src/coach/intake-report/filename.mjs';
import {
  INTAKE_REPORT_FOOTER,
  INTAKE_REPORT_SECTIONS,
  INTAKE_REPORT_TITLE,
  buildIntakeReportViewModel,
  formatIntakeReportPhone,
} from '../src/coach/intake-report/intake-report-view-model.mjs';
import {
  buildIntakeReportDocumentHtml,
  buildIntakeReportMarkup,
  getIntakeReportCss,
  getIntakeReportPdfOptions,
} from '../src/coach/intake-report/build-intake-report-html.mjs';
import { getRateLimitProfile } from '../src/coach/server/http/rate-limit-profiles.mjs';
import { checkRateLimit, resetRateLimitBuckets } from '../src/coach/server/http/rate-limit.mjs';
import { redactForLog } from '../src/coach/server/http/redact.mjs';
import { isProtectedPath } from '../src/coach/security/portal-auth.mjs';
import { resolveSafeNextPath } from '../coach-portal/assets/login-redirect.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORG_KR = '11111111-1111-1111-1111-111111111111';
const ORG_OTHER = '22222222-2222-2222-2222-222222222222';
const CLIENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SUBMITTED_AT = '2026-08-15T16:05:00.000Z';
const PHI_ANSWER = 'Jamais logger cette réponse confidentielle';
const OPAQUE_TOKEN = 'opaque_invite_token_value_24ch';

const SAMPLE_ANSWERS = Object.freeze({
  email: 'client.test@example.com',
  phone: '5145550199',
  objective_primary: 'Perdre du poids',
  objective_detail: 'Retrouver de l’énergie avant un événement familial.',
  deadline: 'Mariage — octobre 2026',
  activity_level: 'Modéré',
  work_type: 'Bureau, assis la majorité du temps',
  schedule: 'Entraînements tôt le matin',
  medications_status: 'Oui',
  medications_details: 'Vitamine D, magnésium',
  allergies_status: 'Non',
  allergies_details: '',
  restriction_status: 'Oui',
  restriction_details: 'Genou droit — éviter les sauts',
  challenges: ['Manque de temps', 'Soirées sociales'],
  foods_avoid: 'Fritures',
  interview_priority: 'Plan de semaine réaliste',
  other_info: 'Disponible le mardi soir.',
  consent: true,
  completed_step: 4,
});

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
    async text() { return JSON.stringify(payload); },
  };
}

function createFetchMock({
  userStatus = 200,
  userBody = { id: USER_ID },
  memberships = [{ id: 'm-kr', organization_id: ORG_KR, role: 'coach' }],
  orgSlug = 'kr-kinetics',
  clientRow = {
    id: CLIENT_ID,
    organization_id: ORG_KR,
    full_name: 'Alex Test',
    is_fictional: true,
    service_type: 'programming',
  },
  clientStatus = 200,
  responseRows = [{
    answers: SAMPLE_ANSWERS,
    submitted_at: SUBMITTED_AT,
    status: 'submitted',
  }],
  responseStatus = 200,
} = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes('/auth/v1/user')) return jsonResponse(userStatus, userBody);
    if (u.includes('/rest/v1/memberships')) return jsonResponse(200, memberships);
    if (u.includes('/rest/v1/organizations')) {
      return jsonResponse(200, orgSlug ? [{ id: ORG_KR, slug: orgSlug }] : []);
    }
    if (u.includes('/rest/v1/clients')) return jsonResponse(clientStatus, clientRow ? [clientRow] : []);
    if (u.includes('/rest/v1/client_intake_responses')) {
      return jsonResponse(responseStatus, responseRows);
    }
    throw new Error(`unexpected url in test mock: ${u}`);
  };
  return { fetchImpl, calls };
}

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

function mockReq({
  method = 'POST',
  body = {
    client_id: CLIENT_ID,
    organization_id: ORG_KR,
    organization_slug: 'kr-kinetics',
  },
  headers = {},
  cookie = 'coach_access_token=tok',
  origin = 'https://app.krkinetics.com',
} = {}) {
  return {
    method,
    headers: {
      cookie,
      origin,
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(JSON.stringify(body))),
      ...headers,
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

async function withHandlerEnv(fetchImpl, fn) {
  const keys = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'COACH_RATE_LIMIT_BACKEND', 'VERCEL_ENV'];
  const prev = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
    COACH_RATE_LIMIT_BACKEND: 'memory',
  });
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  globalThis.fetch = fetchImpl;
  resetRateLimitBuckets();
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

function captureLogs(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => {
    lines.push(args.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' '));
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => { console.log = original; })
    .then((value) => ({ value, logs: lines.join('\n') }));
}

test('ViewModel keeps canonical order, French labels, aliases, and skips empties', () => {
  const vm = buildIntakeReportViewModel({
    clientName: 'Alex Test',
    submittedAt: SUBMITTED_AT,
    answers: SAMPLE_ANSWERS,
  });
  assert.equal(vm.title, INTAKE_REPORT_TITLE);
  assert.equal(vm.footer, INTAKE_REPORT_FOOTER);
  assert.equal(vm.clientName, 'Alex Test');
  assert.ok(vm.submittedAtDisplay);
  assert.equal(vm.submittedDateIso, '2026-08-15');
  assert.deepEqual(vm.sections.map((section) => section.id), INTAKE_REPORT_SECTIONS.map((section) => section.id));
  assert.equal(vm.sections[0].title, 'PROFIL DU CLIENT');
  assert.equal(vm.sections[0].rows[0].label, 'Courriel');
  assert.equal(vm.sections[1].rows[0].display, 'Perte de masse adipeuse');
  assert.equal(vm.sections.find((section) => section.id === 'health').rows.some((row) => row.key === 'allergies_details'), false);
  assert.equal(vm.sections.some((section) => section.rows.some((row) => row.key === 'consent')), false);
  assert.equal(vm.sections.some((section) => section.rows.some((row) => row.key === 'completed_step')), false);
  assert.equal(formatIntakeReportPhone('5145550199'), '514 555-0199');
  assert.equal(vm.sections[0].rows[1].display, '514 555-0199');
});

test('ViewModel omits empty sections and formats long / escaped answers only at HTML layer', () => {
  const long = `Besoin d’un suivi détaillé.\n${'Disponibilité limitée. '.repeat(80)}`;
  const vm = buildIntakeReportViewModel({
    clientName: 'Alex <script>alert(1)</script>',
    submittedAt: SUBMITTED_AT,
    answers: {
      interview_priority: long,
      other_info: '<img src=x onerror=alert(1)>',
      email: '   ',
      challenges: [],
    },
  });
  assert.deepEqual(vm.sections.map((section) => section.id), ['priority', 'other']);
  assert.equal(vm.sections[0].rows[0].display, long.trim());
  assert.match(vm.sections[1].rows[0].display, /<img src=x onerror=alert\(1\)>/);
  const html = buildIntakeReportMarkup(vm, { logoSrc: 'data:image/png;base64,aaa' });
  assert.match(html, /Alex &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  assert.match(html, /white-space:pre-wrap|intake-report-answer/);
  assert.ok(html.includes(long.slice(0, 40)) || html.includes('Besoin d’un suivi') || html.includes('Besoin d&#39;un suivi'));
});

test('screen and PDF HTML share IA and omit the action bar', () => {
  const vm = buildIntakeReportViewModel({
    clientName: 'Alex Test',
    submittedAt: SUBMITTED_AT,
    answers: SAMPLE_ANSWERS,
  });
  const screen = buildIntakeReportDocumentHtml({ viewModel: vm, mode: 'screen', logoSrc: '/assets/logo-kr-kinetics-horizontal.png' });
  const pdf = buildIntakeReportDocumentHtml({ viewModel: vm, mode: 'pdf', logoSrc: 'data:image/png;base64,aaa' });
  for (const html of [screen, pdf]) {
    assert.match(html, /RAPPORT DE PRÉ-ENTREVUE/);
    assert.match(html, /PROFIL DU CLIENT/);
    assert.match(html, /OBJECTIF &amp; CONTEXTE/);
    assert.match(html, /MODE DE VIE/);
    assert.match(html, /SANTÉ &amp; RESTRICTIONS/);
    assert.match(html, /HABITUDES &amp; DÉFIS/);
    assert.match(html, /PRIORITÉ POUR LA PREMIÈRE RENCONTRE/);
    assert.match(html, /AUTRE INFORMATION UTILE/);
    assert.match(html, /#071B41/);
    assert.match(html, /#0B285B/);
    assert.match(html, /#ED1136/);
    assert.match(html, /KR KINETICS — Pré-entrevue confidentielle/);
    assert.doesNotMatch(html, /Retour au tableau de bord/);
    assert.doesNotMatch(html, /Télécharger le PDF/);
    assert.doesNotMatch(html, /1123px/);
    assert.doesNotMatch(html, /overflow\s*:\s*hidden/);
    assert.doesNotMatch(html, /intake\.html\?token=/);
    assert.doesNotMatch(html, /build-pdf-html|pdf-a4-page/);
  }
  assert.match(getIntakeReportCss('pdf'), /size:A4/);
  assert.match(getIntakeReportCss('screen'), /max-width:820px/);
  const shipped = fs.readFileSync(path.join(root, 'coach-portal/assets/intake-report-document.css'), 'utf8').replace(/\r\n/g, '\n').trim();
  assert.equal(shipped, getIntakeReportCss('screen').trim());
});

test('report URL helper is client_id only', () => {
  assert.equal(
    intakeReportOpenPath(CLIENT_ID),
    `/pre-interview-report.html?client_id=${CLIENT_ID}`,
  );
  assert.doesNotMatch(intakeReportOpenPath(CLIENT_ID), /token|answers/);
  assert.equal(
    buildIntakeReportPdfFilename({ clientName: 'TEST EMAIL INVITE KR', submittedAtIso: '2026-08-15' }),
    'KR-Kinetics_Pre-entrevue_TEST_EMAIL_INVITE_KR_2026-08-15.pdf',
  );
});

test('PDF validator accepts identifiers only and rejects browser-supplied answers', () => {
  assert.equal(validateIntakeReportPdfBody({ client_id: CLIENT_ID }).ok, true);
  assert.equal(validateIntakeReportPdfBody({
    client_id: CLIENT_ID,
    organization_id: ORG_KR,
    organization_slug: 'kr-kinetics',
  }).ok, true);
  assert.equal(validateIntakeReportPdfBody({ client_id: CLIENT_ID, answers: SAMPLE_ANSWERS }).ok, false);
  assert.equal(validateIntakeReportPdfBody({ client_id: CLIENT_ID, token: OPAQUE_TOKEN }).ok, false);
  assert.equal(validateIntakeReportPdfBody({ client_id: 'not-a-uuid' }).ok, false);
  assert.equal(validateIntakeReportPdfBody({ extra: true, client_id: CLIENT_ID }).ok, false);
});

test('intake report authorization allows programming, nutrition, and complete; rejects cross-org', async () => {
  const base = {
    accessToken: 'jwt',
    organizationId: ORG_KR,
    clientId: CLIENT_ID,
    supabaseUrl: 'https://example.test',
    publishableKey: 'key',
  };
  for (const serviceType of ['programming', 'nutrition', 'complete']) {
    const allowed = await authorizeIntakeReportAccess({
      ...base,
      fetchImpl: async () => jsonResponse(200, [{
        id: CLIENT_ID,
        organization_id: ORG_KR,
        full_name: 'Alex',
        is_fictional: true,
        service_type: serviceType,
      }]),
    });
    assert.equal(allowed.ok, true, serviceType);
    assert.equal(allowed.client.service_type, serviceType);
  }

  const nutritionGate = await authorizeClientAccess({
    ...base,
    fetchImpl: async () => jsonResponse(200, [{
      id: CLIENT_ID,
      organization_id: ORG_KR,
      full_name: 'Alex',
      is_fictional: true,
      service_type: 'programming',
    }]),
  });
  assert.deepEqual(nutritionGate, { ok: false, error: 'forbidden' });

  const crossOrg = await authorizeIntakeReportAccess({
    ...base,
    fetchImpl: async () => jsonResponse(200, [{
      id: CLIENT_ID,
      organization_id: ORG_OTHER,
      full_name: 'Alex',
      is_fictional: true,
      service_type: 'complete',
    }]),
  });
  assert.deepEqual(crossOrg, { ok: false, error: 'forbidden' });
});

test('server loads submitted answers and never reads a browser answers field', async () => {
  const { fetchImpl, calls } = createFetchMock();
  const loaded = await loadSubmittedIntakeReport({
    accessToken: 'jwt',
    organizationId: ORG_KR,
    clientId: CLIENT_ID,
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'key',
    fetchImpl,
    answers: { other_info: 'BROWSER FORGERY' },
  });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.answers.other_info, 'Disponible le mardi soir.');
  assert.equal(loaded.answers.other_info === 'BROWSER FORGERY', false);
  assert.ok(calls.some((call) => call.url.includes('client_intake_responses')));
  assert.equal(JSON.stringify(calls).includes('BROWSER FORGERY'), false);
});

test('protected report paths, login next, rate profile, and redaction', () => {
  assert.equal(isProtectedPath('/pre-interview-report.html'), true);
  assert.equal(isProtectedPath('/assets/pre-interview-report.js'), true);
  assert.equal(isProtectedPath('/src/coach/intake-report/intake-report-view-model.mjs'), true);
  assert.equal(
    resolveSafeNextPath(`?next=/pre-interview-report.html?client_id=${CLIENT_ID}`),
    `/pre-interview-report.html?client_id=${CLIENT_ID}`,
  );
  const reportPdf = getRateLimitProfile('generate-intake-report-pdf');
  const nutritionPdf = getRateLimitProfile('generate-pdf');
  assert.equal(reportPdf.max, nutritionPdf.max);
  assert.equal(reportPdf.windowMs, nutritionPdf.windowMs);
  resetRateLimitBuckets();
  const key = 'generate-intake-report-pdf:test-user';
  for (let i = 0; i < reportPdf.max; i += 1) {
    assert.equal(checkRateLimit(key, reportPdf).ok, true);
  }
  assert.equal(checkRateLimit(key, reportPdf).ok, false);
  const redacted = redactForLog({
    answers: SAMPLE_ANSWERS,
    token: OPAQUE_TOKEN,
    other_info: PHI_ANSWER,
  });
  assert.equal(redacted.answers, '[redacted]');
  assert.equal(redacted.token, '[redacted]');
  assert.equal(String(redacted.other_info).includes(PHI_ANSWER), true);
});

test('PDF endpoint rejects unauthenticated requests, browser answers, and keeps no-store', async () => {
  const handler = (await import('../api/coach-generate-intake-report-pdf.js')).default;
  const { fetchImpl } = createFetchMock();
  await withHandlerEnv(fetchImpl, async () => {
    const noAuth = mockRes();
    await handler(mockReq({ cookie: '' }), noAuth.res);
    assert.equal(noAuth.result.statusCode, 401);
    assert.equal(noAuth.result.headers['Cache-Control'], 'private, no-store');
    assert.match(String(noAuth.result.body), /"error":"unauthorized"/);

    const method = mockRes();
    await handler(mockReq({ method: 'GET' }), method.res);
    assert.equal(method.result.statusCode, 405);

    const withAnswers = mockRes();
    await handler(mockReq({
      body: { client_id: CLIENT_ID, answers: SAMPLE_ANSWERS },
    }), withAnswers.res);
    assert.equal(withAnswers.result.statusCode, 400);
    assert.doesNotMatch(String(withAnswers.result.body), /%PDF/);
    assert.doesNotMatch(String(withAnswers.result.body), /Disponible le mardi soir/);
  });
});

test('PDF endpoint rejects cross-organization clients and does not leak tokens or answers', async () => {
  const handler = (await import('../api/coach-generate-intake-report-pdf.js')).default;
  const { fetchImpl } = createFetchMock({
    clientRow: {
      id: CLIENT_ID,
      organization_id: ORG_OTHER,
      full_name: 'Alex Test',
      is_fictional: true,
      service_type: 'nutrition',
    },
  });
  const { value, logs } = await captureLogs(() => withHandlerEnv(fetchImpl, async () => {
    const res = mockRes();
    await handler(mockReq(), res.res);
    return res.result;
  }));
  assert.equal(value.statusCode, 403);
  assert.match(String(value.body), /"error":"forbidden"/);
  assert.equal(logs.includes(PHI_ANSWER), false);
  assert.equal(logs.includes(OPAQUE_TOKEN), false);
  assert.equal(logs.includes('Disponible le mardi soir'), false);
  assert.doesNotMatch(logs, /intake\.html\?token=/);
});

test('intake report Chromium PDF render smoke', { skip: process.env.SKIP_PDF_RENDER === '1' }, async (t) => {
  try {
    const { renderHtmlToPdfBuffer } = await import('../src/coach/server/pdf/render-pdf.mjs');
    const { loadBrandLogoDataUri } = await import('../src/coach/server/pdf/resolve-logo.mjs');
    const logo = await loadBrandLogoDataUri('kr');
    const vm = buildIntakeReportViewModel({
      clientName: 'Alex Test',
      submittedAt: SUBMITTED_AT,
      answers: SAMPLE_ANSWERS,
    });
    const html = buildIntakeReportDocumentHtml({
      viewModel: vm,
      mode: 'pdf',
      logoSrc: logo.dataUri,
    });
    const pdf = await renderHtmlToPdfBuffer(html, {
      pdfOptions: getIntakeReportPdfOptions(vm.footer),
    });
    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.ok(pdf.length > 1000);
    assert.doesNotMatch(pdf.toString('latin1'), /opaque_invite_token/);
  } catch (error) {
    const detail = `${error?.message || ''} ${error?.cause?.message || ''} ${error?.code || ''}`;
    if (/Could not find Chrome|Failed to launch|browser_launch|pdf_render_failed/i.test(detail)) {
      t.skip('No local Chromium available');
    } else throw error;
  }
});

test('PDF endpoint loads server answers for programming clients and can render', async (t) => {
  const handler = (await import('../api/coach-generate-intake-report-pdf.js')).default;
  const { fetchImpl, calls } = createFetchMock({
    clientRow: {
      id: CLIENT_ID,
      organization_id: ORG_KR,
      full_name: 'Alex Test',
      is_fictional: true,
      service_type: 'programming',
    },
  });
  const { value, logs } = await captureLogs(() => withHandlerEnv(fetchImpl, async () => {
    const res = mockRes();
    await handler(mockReq(), res.res);
    return res.result;
  }));
  assert.ok(calls.some((call) => call.url.includes('client_intake_responses')));
  assert.equal(JSON.stringify(calls).includes('BROWSER FORGERY'), false);
  assert.equal(logs.includes(PHI_ANSWER), false);
  assert.equal(logs.includes('Disponible le mardi soir'), false);
  if (value.statusCode !== 200) {
    const detail = Buffer.isBuffer(value.body) ? value.body.toString('utf8') : String(value.body);
    if (/pdf_render_failed|chromium|Could not find Chrome|Failed to launch/i.test(`${detail}\n${logs}`)) {
      t.skip('No local Chromium available for intake report PDF');
      return;
    }
    assert.equal(value.statusCode, 200, detail.slice(0, 400));
  }
  assert.equal(value.statusCode, 200);
  assert.equal(value.headers['Content-Type'], 'application/pdf');
  assert.match(String(value.headers['Content-Disposition']), /KR-Kinetics_Pre-entrevue_Alex_Test_2026-08-15\.pdf/);
  const pdf = Buffer.isBuffer(value.body) ? value.body : Buffer.from(value.body);
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.doesNotMatch(pdf.toString('latin1'), /opaque_invite_token_value_24ch/);
});

test('dashboard keeps the modal and adds a new-tab report CTA for every service', () => {
  const dashboardJs = fs.readFileSync(path.join(root, 'coach-portal/assets/dashboard.js'), 'utf8');
  const reportHtml = fs.readFileSync(path.join(root, 'coach-portal/pre-interview-report.html'), 'utf8');
  const reportJs = fs.readFileSync(path.join(root, 'coach-portal/assets/pre-interview-report.js'), 'utf8');
  const api = fs.readFileSync(path.join(root, 'api/coach-generate-intake-report-pdf.js'), 'utf8');
  const preview = fs.readFileSync(path.join(root, 'scripts/coach-workspace-preview.mjs'), 'utf8');
  const vercel = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
  assert.match(dashboardJs, /btn-intake-view/);
  assert.match(dashboardJs, /Voir réponses/);
  assert.match(dashboardJs, /btn-intake-report/);
  assert.match(dashboardJs, /target="_blank"/);
  assert.match(dashboardJs, /rel="noopener"/);
  assert.match(dashboardJs, /intakeReportOpenPath\(row\.id\)/);
  assert.doesNotMatch(
    dashboardJs,
    /clientHasNutritionAccess\(row\.service_type\)[\s\S]{0,160}btn-intake-report/,
  );
  assert.match(reportHtml, /Retour au tableau de bord/);
  assert.match(reportHtml, /Télécharger le PDF/);
  assert.match(reportHtml, /pre-interview-report-chrome\.css/);
  assert.match(reportJs, /parseClientIdParam/);
  assert.match(reportJs, /\/api\/coach-generate-intake-report-pdf/);
  assert.match(reportJs, /answers: response\.answers/);
  assert.doesNotMatch(reportJs, /JSON\.stringify\(\{[\s\S]*answers/);
  assert.doesNotMatch(reportJs, /searchParams\.get\(['"]token['"]\)/);
  assert.match(api, /loadSubmittedIntakeReport/);
  assert.doesNotMatch(api, /authorizeClientAccess/);
  assert.doesNotMatch(api, /buildPdfDocumentHtml/);
  assert.match(preview, /coach-generate-intake-report-pdf/);
  assert.match(vercel, /coach-generate-intake-report-pdf\.js/);
  assert.match(vercel, /pre-interview-report\.html/);
});
