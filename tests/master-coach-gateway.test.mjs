import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  executeMasterCoachGateway,
  gatewaySignature,
  resolveCoachCalculatorAsset,
  UNSAVED_DOSSIER_MESSAGE,
} from '../src/coach/server/internal/master-coach-gateway.mjs';

const SECRET = 'test-gateway-secret';
const NOW = 1_700_000_000_000;
const PORTAL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ATTEMPT = '11111111-1111-4111-8111-111111111111';

function client(serviceType = 'complete') {
  return {
    id: PORTAL,
    organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    fullName: 'Athlete',
    email: 'athlete@example.com',
    phone: null,
    notes: '',
    serviceType,
    fictional: false,
  };
}

function store(overrides = {}) {
  return {
    getClient: async () => client(),
    getDossier: async () => ({ payload: { sexe: 'H', jours: { entrainement: {} } }, updatedAt: '2026-10-10T00:00:00.000Z' }),
    saveDossier: async () => ({ updatedAt: '2026-10-10T01:00:00.000Z' }),
    createClient: async () => ({ id: PORTAL }),
    patchClient: async (_id, patch) => ({ ...client(), ...patch, fullName: patch.fullName || 'Athlete' }),
    listIntake: async () => [{ id: ATTEMPT, status: 'submitted', createdAt: '2026-10-01T00:00:00.000Z' }],
    listMotivation: async () => [],
    snapshot: async () => [{ portalClientId: PORTAL, hasDossier: true, intakeStatus: 'submitted', motivationStatus: null }],
    ...overrides,
  };
}

function signed(body, timestamp = String(NOW)) {
  const rawBody = JSON.stringify(body);
  return {
    rawBody,
    timestamp,
    signature: gatewaySignature(SECRET, timestamp, rawBody),
    secret: SECRET,
    now: NOW,
  };
}

test('rejects a missing signature before any client read', async () => {
  let reads = 0;
  const result = await executeMasterCoachGateway({
    ...signed({ op: 'client.get', portalClientId: PORTAL }),
    signature: '0'.repeat(64),
    store: store({ getClient: async () => { reads += 1; return client(); } }),
  });
  assert.equal(result.status, 401);
  assert.equal(result.body.code, 'LEGACY_GATEWAY_AUTH_FAILED');
  assert.equal(reads, 0);
});

test('rejects an expired signature and a forbidden owner field', async () => {
  const expired = await executeMasterCoachGateway({
    ...signed({ op: 'client.get', portalClientId: PORTAL }, String(NOW - 120_000)),
    store: store(),
  });
  assert.equal(expired.status, 401);
  const forbidden = await executeMasterCoachGateway({
    ...signed({ op: 'client.get', portalClientId: PORTAL, owner_user_id: PORTAL }),
    store: store(),
  });
  assert.equal(forbidden.status, 400);
  assert.equal(forbidden.body.code, 'FORBIDDEN_FIELD');
});

test('rejects an unknown operation instead of running a query', async () => {
  const result = await executeMasterCoachGateway({
    ...signed({ op: 'sql', statement: 'select 1' }),
    store: store(),
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'UNKNOWN_OPERATION');
});

test('programming clients cannot read or publish a nutrition dossier', async () => {
  let dossierReads = 0;
  const result = await executeMasterCoachGateway({
    ...signed({ op: 'dossier.get', portalClientId: PORTAL }),
    store: store({
      getClient: async () => client('programming'),
      getDossier: async () => { dossierReads += 1; return null; },
    }),
  });
  assert.equal(result.status, 403);
  assert.equal(result.body.code, 'NOT_ENTITLED');
  assert.equal(dossierReads, 0);
});

test('dossier put validates and does not publish', async () => {
  let saved = 0;
  const result = await executeMasterCoachGateway({
    ...signed({ op: 'dossier.put', portalClientId: PORTAL, payload: { sexe: 'H', jours: { entrainement: {} } } }),
    store: store({ saveDossier: async () => { saved += 1; return { updatedAt: '2026-10-10T01:00:00.000Z' }; } }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.writesPublication, false);
  assert.equal(saved, 1);
  const invalid = await executeMasterCoachGateway({
    ...signed({ op: 'dossier.put', portalClientId: PORTAL, payload: { note: 'x' } }),
    store: store(),
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, 'DOSSIER_INVALID');
});

test('publish fails closed while the dossier is dirty and does not call the publisher', async () => {
  let published = 0;
  const result = await executeMasterCoachGateway({
    ...signed({ op: 'nutrition.publish', portalClientId: PORTAL, publicationAttemptId: ATTEMPT, dirty: true }),
    store: store(),
    publishCanonical: async () => { published += 1; return { ok: true, revisionNumber: 1 }; },
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.message, UNSAVED_DOSSIER_MESSAGE);
  assert.equal(result.body.writesDossier, false);
  assert.equal(published, 0);
});

test('publish delegates once to the existing publisher', async () => {
  let published = 0;
  const result = await executeMasterCoachGateway({
    ...signed({ op: 'nutrition.publish', portalClientId: PORTAL, publicationAttemptId: ATTEMPT, dirty: false }),
    store: store(),
    publishCanonical: async () => { published += 1; return { ok: true, revisionNumber: 4, idempotent: false }; },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.revisionNumber, 4);
  assert.equal(published, 1);
});

test('a missing portal client is not treated as another organization', async () => {
  const result = await executeMasterCoachGateway({
    ...signed({ op: 'intake.list', portalClientId: PORTAL }),
    store: store({ getClient: async () => null }),
  });
  assert.equal(result.status, 404);
  assert.equal(result.body.code, 'PORTAL_CLIENT_NOT_LINKED');
});

test('calculator asset paths stay inside the calculator directory', () => {
  const root = process.cwd();
  assert.equal(resolveCoachCalculatorAsset(root, 'coach-calculator/index.html')?.endsWith('index.html'), true);
  assert.equal(resolveCoachCalculatorAsset(root, 'coach-calculator/../../.env'), null);
  assert.equal(resolveCoachCalculatorAsset(root, 'src/coach/secret.mjs'), null);
});

test('dashboard is marked legacy and client forms are not redirected', () => {
  const dashboard = fs.readFileSync(new URL('../coach-portal/dashboard.html', import.meta.url), 'utf8');
  const intake = fs.readFileSync(new URL('../coach-portal/intake.html', import.meta.url), 'utf8');
  const host = fs.readFileSync(new URL('../coach-calculator/master-coach-host.js', import.meta.url), 'utf8');
  const motivation = fs.readFileSync(new URL('../coach-portal/motivation.html', import.meta.url), 'utf8');
  assert.match(dashboard, /LEGACY \/ FALLBACK/);
  assert.match(dashboard, /params.get\('legacy'\)/);
  assert.match(dashboard, /location.replace\('https:\/\/maitre-coach.vercel.app\/clients'\)/);
  assert.doesNotMatch(intake, /location.replace/);
  assert.doesNotMatch(motivation, /location.replace/);
  assert.doesNotMatch(intake, /maitre-coach\.vercel\.app/);
  const calculator = fs.readFileSync(new URL('../coach-calculator/index.html', import.meta.url), 'utf8');
  assert.match(host, /Des modifications ne sont pas sauvegardées/);
  assert.match(host, /kr-publish-nutrition/);
  assert.match(host, /form\[action="\/dashboard.html"\]/);
  assert.doesNotMatch(host, /\.app-header/);
  assert.match(calculator, /class="app-header"/);
  assert.match(calculator, /logo-kr-kinetics-horizontal\.png/);
  assert.match(calculator, /logo-elevate-fitness\.jpg/);
  assert.match(calculator, /ÉVALUATION DES HABITUDES & PLANIFICATION ALIMENTAIRE/);
  assert.equal(resolveCoachCalculatorAsset(process.cwd(), 'coach-calculator/assets/logo-kr-kinetics-horizontal.png')?.endsWith('logo-kr-kinetics-horizontal.png'), true);
  assert.equal(resolveCoachCalculatorAsset(process.cwd(), 'coach-calculator/assets/logo-elevate-fitness.jpg')?.endsWith('logo-elevate-fitness.jpg'), true);
  assert.doesNotMatch(host, /iframe/i);
  assert.doesNotMatch(host, /service_role/);
});

test('renders a stored report without accepting answers or sql', async () => {
  const result = await executeMasterCoachGateway({
    ...signed({ op: 'intake.report', portalClientId: PORTAL }),
    store: store(),
    renderReport: async ({ op, client }) => {
      assert.equal(op, 'intake.report');
      assert.equal(client.id, PORTAL);
      return { ok: true, submittedAt: '2026-10-01T00:00:00.000Z', markup: '<article>Rapport</article>', css: '.intake-report{color:#071B41}' };
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.markup, '<article>Rapport</article>');
  assert.equal(result.body.answers, undefined);
  const injected = await executeMasterCoachGateway({
    ...signed({ op: 'motivation.report', portalClientId: PORTAL, sql: 'select 1' }),
    store: store(),
    renderReport: async () => ({ ok: true, markup: '<article></article>', css: '' }),
  });
  assert.equal(injected.status, 400);
  assert.equal(injected.body.code, 'FORBIDDEN_FIELD');
  const missing = await executeMasterCoachGateway({
    ...signed({ op: 'intake.reportPdf', portalClientId: PORTAL }),
    store: store(),
  });
  assert.equal(missing.status, 503);
  assert.equal(missing.body.code, 'QUESTIONNAIRE_GATEWAY_FAILED');
});
