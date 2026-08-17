import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateOfficialMotivationPdf } from '../../src/coach/server/motivation/generate-motivation-pdf.mjs';
import { validateMotivationInviteBody } from '../../src/coach/server/motivation/validate-motivation-invite-request.mjs';
import { renderMotivationPdf } from '../../src/coach/motivation/pdf/render-motivation-pdf.mjs';
import {
  PROFILE_A_STABLE,
  buildCompleteMotivationSubmission,
} from '../../src/coach/motivation/fixtures/complete-profiles.mjs';
import { analyzeMotivationAssessment } from '../../src/coach/motivation/engine/analyze-motivation.mjs';
import {
  QUESTIONNAIRE_V41,
  REPORT_MODEL_V42,
  RULESET_V41,
} from '../../src/coach/motivation/versions/motivation-versions.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLIENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG = '11111111-1111-1111-1111-111111111111';

test('PDF request validator rejects a browser-supplied report', () => {
  const forged = validateMotivationInviteBody({
    client_id: CLIENT_ID,
    report: { schemaVersion: REPORT_MODEL_V42, forged: true },
  });
  assert.equal(forged.ok, false);
  const analysis = validateMotivationInviteBody({
    client_id: CLIENT_ID,
    analysis_snapshot: { forged: true },
  });
  assert.equal(analysis.ok, false);
  const answers = validateMotivationInviteBody({
    client_id: CLIENT_ID,
    answers: [{ questionCode: 'MOT_AUTO_01', numericValue: 5 }],
  });
  assert.equal(answers.ok, false);
  const ok = validateMotivationInviteBody({ client_id: CLIENT_ID, organization_id: ORG });
  assert.equal(ok.ok, true);
});

test('official PDF uses the trusted process path and never a request report', async () => {
  const submission = buildCompleteMotivationSubmission(PROFILE_A_STABLE, {
    clientName: 'Alex Test',
    assessmentId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  });
  const analyzed = analyzeMotivationAssessment({
    questionnaireVersion: QUESTIONNAIRE_V41,
    rulesetVersion: RULESET_V41,
    reportModelVersion: REPORT_MODEL_V42,
    answers: submission.answers,
    presentedQuestionCodes: submission.presentedQuestionCodes,
    clientName: 'Alex Test',
    clientId: CLIENT_ID,
  });
  const rendered = await renderMotivationPdf(analyzed.report, {
    clientName: 'Alex Test',
    clientId: CLIENT_ID,
  });
  const pdf = Buffer.isBuffer(rendered) ? rendered : rendered.buffer;
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.match(
    (await import('../../src/coach/motivation/pdf/render-motivation-pdf.mjs')).motivationPdfFilename({
      clientName: 'Alex Test',
      clientId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      date: new Date('2026-08-16T12:00:00.000Z'),
      analysisVersion: 1,
    }),
    /profil-motivationnel_alex-test_aaaaaaaa_2026-08-16_v1\.pdf/,
  );
});

test('generateOfficialMotivationPdf refuses cross-org and missing clients', async () => {
  const forbidden = await generateOfficialMotivationPdf({
    accessToken: 'tok',
    organizationId: ORG,
    clientId: CLIENT_ID,
    createdByUserId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_test',
    serviceRoleKey: 'service_role_test_key_not_real',
    fetchImpl: async (url) => {
      if (String(url).includes('/rest/v1/clients')) {
        return {
          ok: true,
          status: 200,
          async json() { return []; },
          async text() { return '[]'; },
        };
      }
      throw new Error(`unexpected ${url}`);
    },
  });
  assert.equal(forbidden.ok, false);
  assert.ok(['forbidden', 'not_found'].includes(forbidden.error));
});

test('motivation PDF stays on the single Hobby function', () => {
  const api = fs.readFileSync(path.join(root, 'api/coach-motivation.js'), 'utf8');
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.match(api, /op=pdf|return 'pdf'/);
  assert.match(api, /generateOfficialMotivationPdf/);
  assert.doesNotMatch(api, /SERVICE_ROLE|service_role/);
  assert.ok(vercel.rewrites.some((row) => (
    row.source === '/api/coach-motivation-pdf'
    && row.destination === '/api/coach-motivation?op=pdf'
  )));
  assert.equal(fs.existsSync(path.join(root, 'api/coach-motivation-pdf.js')), false);
  const files = fs.readdirSync(path.join(root, 'api')).filter((name) => name.endsWith('.js'));
  assert.equal(files.length, 12, files.join(','));
  assert.equal(fs.existsSync(path.join(root, 'middleware.js')), true);
});
