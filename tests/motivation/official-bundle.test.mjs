import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICIAL_CONTENT_HASH,
  OFFICIAL_QUESTIONNAIRE_VERSION,
  OFFICIAL_REPORT_MODEL_VERSION,
  OFFICIAL_RULESET_VERSION,
  assertOfficialMotivationBundle,
} from '../../src/coach/motivation/client/official-bundle.mjs';
import {
  QUESTIONNAIRE_V41,
  REPORT_MODEL_V42,
  RULESET_V41,
  resolveMotivationEngine,
} from '../../src/coach/motivation/versions/motivation-versions.mjs';

test('official browser bundle hash matches resolveMotivationEngine', () => {
  const engine = resolveMotivationEngine({
    questionnaireVersion: QUESTIONNAIRE_V41,
    rulesetVersion: RULESET_V41,
    reportModelVersion: REPORT_MODEL_V42,
  });
  assert.equal(OFFICIAL_QUESTIONNAIRE_VERSION, engine.questionnaireVersion);
  assert.equal(OFFICIAL_RULESET_VERSION, engine.rulesetVersion);
  assert.equal(OFFICIAL_REPORT_MODEL_VERSION, engine.reportModelVersion);
  assert.equal(OFFICIAL_CONTENT_HASH, engine.contentHash);
  assert.equal(assertOfficialMotivationBundle({
    questionnaire_version: engine.questionnaireVersion,
    ruleset_version: engine.rulesetVersion,
    report_model_version: engine.reportModelVersion,
    content_hash: engine.contentHash,
  }).ok, true);
  assert.equal(assertOfficialMotivationBundle({
    questionnaire_version: engine.questionnaireVersion,
    ruleset_version: engine.rulesetVersion,
    report_model_version: engine.reportModelVersion,
    content_hash: '0'.repeat(64),
  }).ok, false);
});
