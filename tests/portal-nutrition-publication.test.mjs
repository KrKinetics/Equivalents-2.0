import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nutritionPlanFingerprint } from '../src/coach/publication/nutrition-plan-fingerprint.mjs';
import {
  nextPublicationAttempt,
  publicationClickDecision,
  UNSAVED_DOSSIER_MESSAGE,
} from '../src/coach/publication/publication-attempt.mjs';
import { buildSavedDossierPublication } from '../src/coach/publication/saved-dossier-publication.mjs';
import { publishSavedNutritionDossier } from '../src/coach/publication/publish-saved-dossier.mjs';
import { prepareCanonicalPublication } from '../src/coach/publication/dossier-to-nutrition-plan.mjs';
import { handleCoachPublishNutritionRequest } from '../src/coach/publication/coach-publish-nutrition-handler.mjs';

const CLIENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ATTEMPT_A = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_B = '22222222-2222-4222-8222-222222222222';
const vector = JSON.parse(fs.readFileSync(
  new URL('../src/coach/publication/nutrition-plan-fingerprint-vector.json', import.meta.url),
  'utf8',
));

function savedDossier() {
  const repartition = new Array(49).fill(0);
  repartition[0] = 1;
  return {
    sexe: 'H',
    goalMultiplier: 1,
    macroMode: 'preset',
    macroRatio: '25,45,30',
    coachNotes: 'note de séance',
    jourReposActif: false,
    jours: {
      entrainement: {
        banque: { pro: '1', fec: '0', leg: '0', fru: '0', lai: '0', lip: '0', whey: '0' },
        repartition,
        heureEntrainement: '17:30',
        repartitionSelonEntrainement: true,
        eauLitres: '3',
        eauAjout: '0',
        eauManuel: true,
      },
      repos: {
        banque: { pro: '0', fec: '0', leg: '0', fru: '0', lai: '0', lip: '0', whey: '0' },
        repartition: new Array(49).fill(0),
      },
    },
  };
}

function coach() {
  return { userId: 'coach-1', organizationId: ORG_ID, organizationSlug: 'kr-kinetics' };
}

function client(serviceType = 'nutrition') {
  return { id: CLIENT_ID, organizationId: ORG_ID, fullName: 'Athlete', serviceType };
}

test('fingerprint matches the shared Master Coach vector', () => {
  assert.equal(nutritionPlanFingerprint(vector.plan), vector.fingerprint);
});

test('a dirty workspace cannot publish and does not write the dossier', () => {
  const decision = publicationClickDecision({ isDirty: true, pending: false });
  assert.equal(decision.ok, false);
  assert.equal(decision.message, UNSAVED_DOSSIER_MESSAGE);
  assert.equal(decision.message, 'Des modifications ne sont pas sauvegardées. Sauvegardez le dossier avant de publier.');
  assert.equal(decision.writesDossier, false);
  assert.equal(decision.releasesAthlete, false);
});

test('one saved dossier creates the plan and the PDF request', () => {
  const prepared = buildSavedDossierPublication({
    savedPayload: savedDossier(),
    clientId: CLIENT_ID,
    organizationSlug: 'kr-kinetics',
    athleteName: 'Athlete',
    effectiveDate: '2026-10-09',
  });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.writesDossier, false);
  const training = prepared.plan.days.find((day) => day.dayKind === 'TRAINING');
  assert.equal(prepared.pdfRequest.training.targets.kcal, training.targets.calories);
  assert.equal(prepared.pdfRequest.pdf_brand, 'kr');
  assert.equal(nutritionPlanFingerprint(prepared.plan), prepared.planFingerprint);
  const vector = JSON.parse(fs.readFileSync(
    new URL('../src/coach/publication/canonical-dossier-publication-vector.json', import.meta.url),
    'utf8',
  ));
  assert.equal(prepared.planFingerprint, vector.planFingerprint);
  assert.equal(prepared.pdfRequest.training.targets.kcal, vector.pdfKcal);
  assert.deepEqual(prepared.plan, vector.plan);
});

test('a seventh meal is published and a programming-only client is refused before PDF render', async () => {
  const seventh = savedDossier();
  seventh.jours.entrainement.repartition[42] = 1;
  let rendered = 0;
  let postedPlan = null;
  const expectedKcal = prepareCanonicalPublication(seventh, { brand: 'kr' }).plan.days[0].targets.calories;
  const released = await publishSavedNutritionDossier({
    accessToken: 'token',
    coach: coach(),
    client: client('nutrition'),
    savedDossier: { payload: seventh },
    publicationAttemptId: ATTEMPT_A,
    effectiveDate: '2026-10-09',
    renderPdf: async (request) => {
      rendered += 1;
      assert.equal(request.training.repartition[42], 1);
      assert.equal(request.training.targets.kcal, expectedKcal);
      return { bytes: Buffer.from('%PDF') };
    },
    postPackage: async (pkg) => {
      postedPlan = pkg.plan;
      return { ok: true, status: 200, revisionNumber: 1, idempotent: false };
    },
  });
  assert.equal(released.ok, true);
  assert.equal(released.revisionNumber, 1);
  assert.equal(rendered, 1);
  assert.equal(postedPlan.days[0].meals[6].mealIndex, 6);
  assert.equal(postedPlan.days[0].meals[6].portions[0].quantity, 1);

  const programming = await publishSavedNutritionDossier({
    accessToken: 'token',
    coach: coach(),
    client: client('programming'),
    savedDossier: { payload: savedDossier() },
    publicationAttemptId: ATTEMPT_A,
    effectiveDate: '2026-10-09',
    renderPdf: async () => { rendered += 1; return { bytes: Buffer.from('%PDF') }; },
    postPackage: async () => { throw new Error('must not post'); },
  });
  assert.equal(programming.status, 403);
  assert.equal(programming.error, 'not_entitled');
  assert.equal(rendered, 1);
});

test('Elevate organization is rejected before the dossier is projected', async () => {
  let rendered = 0;
  const result = await publishSavedNutritionDossier({
    accessToken: 'token',
    coach: { ...coach(), organizationSlug: 'elevate-fitness' },
    client: client('complete'),
    savedDossier: { payload: savedDossier() },
    publicationAttemptId: ATTEMPT_A,
    effectiveDate: '2026-10-09',
    renderPdf: async () => { rendered += 1; return { bytes: Buffer.from('%PDF') }; },
    postPackage: async () => { throw new Error('must not post'); },
  });
  assert.equal(result.status, 403);
  assert.equal(rendered, 0);
});

test('the same snapshot is sent once and a retry keeps the attempt id', async () => {
  const seen = [];
  const result = await publishSavedNutritionDossier({
    accessToken: 'token',
    coach: coach(),
    client: client('complete'),
    savedDossier: { payload: savedDossier() },
    publicationAttemptId: ATTEMPT_A,
    effectiveDate: '2026-10-09',
    renderPdf: async (pdfRequest) => {
      seen.push(pdfRequest);
      return { bytes: Buffer.from('%PDF-1.4') };
    },
    postPackage: async (pkg) => {
      seen.push(pkg);
      return { ok: true, status: 200, revisionNumber: 1, idempotent: false };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.revisionNumber, 1);
  assert.equal(result.writesDossier, false);
  assert.equal(seen[1].planFingerprint, nutritionPlanFingerprint(seen[1].plan));
  assert.equal(seen[0].training.targets.kcal, seen[1].plan.days[0].targets.calories);
  assert.equal(seen[1].publicationAttemptId, ATTEMPT_A);

  const retry = nextPublicationAttempt({
    currentAttemptId: ATTEMPT_A,
    pending: false,
    lastSucceeded: false,
  });
  assert.equal(retry.attemptId, ATTEMPT_A);
  assert.equal(retry.generate, false);
  const next = nextPublicationAttempt({
    currentAttemptId: null,
    pending: false,
    lastSucceeded: true,
  });
  assert.equal(next.generate, true);
  assert.notEqual(ATTEMPT_B, retry.attemptId);
});

test('unauthenticated, dirty, and spoofed browser bodies never load the dossier', async () => {
  let loaded = 0;
  const loadDossier = async () => { loaded += 1; return { payload: savedDossier() }; };
  const unauthenticated = await handleCoachPublishNutritionRequest({
    body: { client_id: CLIENT_ID, publication_attempt_id: ATTEMPT_A },
    requireAuth: async () => ({ ok: false, status: 401 }),
    loadClient: async () => { throw new Error('must not load'); },
    loadDossier,
    renderPdf: async () => { throw new Error('must not render'); },
    postPackage: async () => { throw new Error('must not post'); },
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal(loaded, 0);

  const dirty = await handleCoachPublishNutritionRequest({
    body: { dirty: true, client_id: CLIENT_ID, publication_attempt_id: ATTEMPT_A },
    requireAuth: async () => ({ ok: true, userId: 'coach-1', organizationId: ORG_ID, organizationSlug: 'kr-kinetics' }),
    loadClient: async () => { throw new Error('must not load'); },
    loadDossier,
    renderPdf: async () => { throw new Error('must not render'); },
    postPackage: async () => { throw new Error('must not post'); },
  });
  assert.equal(dirty.status, 409);
  assert.equal(dirty.body.message, UNSAVED_DOSSIER_MESSAGE);
  assert.equal(loaded, 0);

  const spoofed = await handleCoachPublishNutritionRequest({
    body: { client_id: CLIENT_ID, publication_attempt_id: ATTEMPT_A, plan: { brand: 'kr' }, owner_user_id: 'spoof' },
    requireAuth: async () => ({ ok: true, userId: 'coach-1', organizationId: ORG_ID, organizationSlug: 'kr-kinetics' }),
    loadClient: async () => { throw new Error('must not load'); },
    loadDossier,
    renderPdf: async () => { throw new Error('must not render'); },
    postPackage: async () => { throw new Error('must not post'); },
  });
  assert.equal(spoofed.status, 400);
  assert.equal(spoofed.body.error, 'spoofed_payload');
  assert.equal(loaded, 0);
});

test('browser assets and the publish route do not carry a service-role secret', () => {
  const files = [
    'api/coach-publish-nutrition.js',
    'src/coach/publication/publication-attempt.mjs',
    'src/coach/publication/publish-saved-dossier.mjs',
    'src/coach/publication/saved-dossier-publication.mjs',
  ];
  for (const file of files) {
    const src = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.equal(/service_role|SERVICE_ROLE|SUPABASE_SERVICE_ROLE/.test(src), false, file);
  }
  const workspace = fs.readFileSync(new URL('../coach-portal/assets/workspace-bootstrap.mjs', import.meta.url), 'utf8');
  const start = workspace.indexOf('async function onPublishKrKinetics()');
  const end = workspace.indexOf('if (ctx.brandId === \'kr\'', start);
  const publish = workspace.slice(start, end);
  assert.equal(/SUPABASE_SERVICE_ROLE|service_role_key|eyJ/.test(publish), false);
  assert.equal(publish.includes('getPersistedDossierPayload'), false);
  const api = fs.readFileSync(new URL('../api/coach-publish-nutrition.js', import.meta.url), 'utf8');
  assert.match(api, /requireRequestAuth/);
  assert.match(api, /client_dossiers/);
  assert.doesNotMatch(api, /owner_user_id/);
});
