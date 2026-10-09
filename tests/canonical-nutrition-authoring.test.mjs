import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertWorkspaceClientAccess, workspaceOpenPath } from '../src/coach/workspace/workspace-access.mjs';
import { resolveWorkspaceOpenState } from '../src/coach/workspace/workspace-dossier-ui.mjs';
import { prepareCanonicalPublication } from '../src/coach/publication/dossier-to-nutrition-plan.mjs';
import { krPublicationPreview } from '../src/coach/publication/kr-publication-action.mjs';
import { validatePdfRequestBody } from '../src/coach/server/validation/pdf-request.mjs';

const CLIENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function savedDossier(overrides = {}) {
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
    ...overrides,
  };
}

test('dashboard and Master Coach use the same workspace client id', () => {
  const path = workspaceOpenPath(CLIENT_ID);
  assert.equal(path, `/workspace/?client_id=${CLIENT_ID}`);
  assert.equal(
    `https://app.krkinetics.com${path}`,
    `https://app.krkinetics.com/workspace/?client_id=${CLIENT_ID}`,
  );
});

test('opening a workspace does not replace or create a dossier', () => {
  const existing = { payload: savedDossier() };
  const resolved = resolveWorkspaceOpenState(existing, { nom: 'stub' });
  assert.equal(resolved.mode, 'existing');
  assert.equal(resolved.payload, existing.payload);
  assert.throws(
    () => assertWorkspaceClientAccess({
      client: null,
      membership: {
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organization: { slug: 'kr-kinetics', name: 'KR KINETICS' },
        role: 'coach',
      },
    }),
    /introuvable/,
  );
});

test('one saved dossier projects the release plan and the PDF day', () => {
  const payload = savedDossier();
  const result = prepareCanonicalPublication(payload, { language: 'fr', brand: 'kr' });
  assert.equal(result.ok, true);
  assert.equal(result.writesDossier, false);
  assert.equal(result.releasesAthlete, false);
  assert.equal(result.plan.days.length, 1);
  assert.equal(result.plan.days[0].meals[0].portions[0].quantity, 1);
  assert.equal(result.pdfRequestDays.training.repartition[0], 1);
  assert.equal(result.pdfRequestDays.training.banque.pro, 1);
  const pdf = validatePdfRequestBody({
    client_id: CLIENT_ID,
    organization_slug: 'kr-kinetics',
    locale: 'fr',
    athlete_name: 'Athlete',
    goal_label: 'Maintien',
    macro_ratio_label: '25,45,30',
    coach_notes: result.plan.coachNotes,
    goal_multiplier: result.plan.goalMultiplier,
    training: result.pdfRequestDays.training,
  });
  assert.equal(pdf.ok, true);
});

test('a used seventh meal and an Elevate dossier are refused', () => {
  const seventh = savedDossier();
  seventh.jours.entrainement.repartition[42] = 1;
  assert.equal(
    prepareCanonicalPublication(seventh, { brand: 'kr' }).code,
    'SEVENTH_MEAL_NOT_IN_RELEASE_CONTRACT',
  );
  const elevate = krPublicationPreview({
    brandId: 'elevate',
    organizationSlug: 'elevate-fitness',
    payload: savedDossier(),
  });
  assert.equal(elevate.ok, false);
  assert.equal(elevate.code, 'ELEVATE_NOT_PUBLISHABLE');
  assert.equal(elevate.writesDossier, false);
  assert.equal(elevate.releasesAthlete, false);
});

test('publish control does not save the dossier', () => {
  const source = fs.readFileSync(
    new URL('../coach-portal/assets/workspace-bootstrap.mjs', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('function onPublishKrKinetics()');
  const end = source.indexOf('if (ctx.brandId === \'kr\'', start);
  assert.ok(start > 0 && end > start);
  const body = source.slice(start, end);
  assert.equal(body.includes('saveClientDossier'), false);
  assert.equal(body.includes('sauvegarderProfil'), false);
  assert.equal(body.includes('krPublicationPreview'), true);
});
