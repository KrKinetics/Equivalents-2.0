/**
 * Coach-authenticated official analysis of a submitted motivation assessment.
 * Reads with the Coach JWT. Writes only through persist-trusted-analysis
 * (service role after authorization). Never accepts browser-computed analysis.
 * Fail closed on unknown engine versions or content-hash mismatch.
 * Never rewrites a previous analysis_version.
 */

import { analyzeMotivationAssessment } from '../../motivation/engine/analyze-motivation.mjs';
import {
  UnknownMotivationEngineError,
  resolveMotivationEngine,
} from '../../motivation/versions/motivation-versions.mjs';
import {
  loadMotivationAnalysisVersions,
  loadSubmittedMotivationAssessment,
} from './load-submitted-motivation.mjs';
import {
  persistTrustedMotivationAnalysis,
  readMotivationServiceRoleKey,
} from './persist-trusted-analysis.mjs';

function userIdFromAccessToken(accessToken) {
  try {
    const payload = String(accessToken || '').split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof json.sub === 'string' && json.sub ? json.sub : null;
  } catch {
    return null;
  }
}

export class MotivationContentHashMismatchError extends Error {
  constructor() {
    super('Stored motivation content hash does not match resolveMotivationEngine');
    this.name = 'MotivationContentHashMismatchError';
  }
}

function sameDefinitions(row, engine) {
  return row
    && row.questionnaire_version === engine.questionnaireVersion
    && row.ruleset_version === engine.rulesetVersion
    && row.report_model_version === engine.reportModelVersion
    && row.content_hash === engine.contentHash;
}

function toResult(row, extras = {}) {
  const createdAt = row.created_at || extras.createdAt || null;
  const provenance = extras.provenance || {
    questionnaireVersion: row.questionnaire_version,
    rulesetVersion: row.ruleset_version,
    reportModelVersion: row.report_model_version,
    contentHash: row.content_hash,
  };
  return {
    ok: true,
    analysisId: row.id,
    analysisVersion: row.analysis_version,
    idempotent: extras.idempotent === true,
    createdAt,
    submittedAt: extras.submittedAt || null,
    analysisSnapshot: extras.analysisSnapshot || row.analysis_snapshot || null,
    provenance: {
      ...provenance,
      analyzedAt: createdAt,
    },
  };
}

/**
 * @returns {Promise<
 *   | { ok: true, analysisId: string, analysisVersion: number, idempotent: boolean, analysisSnapshot: object, provenance: object }
 *   | { ok: false, error: 'forbidden' | 'not_found' | 'not_submitted' | 'hash_mismatch' | 'unknown_engine' | 'unavailable' }
 * >}
 */
export async function processSubmittedMotivationAssessment({
  accessToken,
  organizationId,
  clientId,
  createdByUserId = null,
  responseId = null,
  supabaseUrl,
  publishableKey,
  serviceRoleKey = null,
  fetchImpl = globalThis.fetch,
  env = process.env,
} = {}) {
  const loaded = await loadSubmittedMotivationAssessment({
    accessToken,
    organizationId,
    clientId,
    responseId,
    supabaseUrl,
    publishableKey,
    fetchImpl,
  });
  if (!loaded.ok) return loaded;

  const { client, invite, response } = loaded;
  let engine;
  try {
    engine = resolveMotivationEngine({
      questionnaireVersion: invite.questionnaire_version,
      rulesetVersion: invite.ruleset_version,
      reportModelVersion: invite.report_model_version,
    });
  } catch (error) {
    if (error instanceof UnknownMotivationEngineError) {
      return { ok: false, error: 'unknown_engine' };
    }
    return { ok: false, error: 'unavailable' };
  }

  if (invite.content_hash !== engine.contentHash) {
    return { ok: false, error: 'hash_mismatch' };
  }

  const existing = await loadMotivationAnalysisVersions({
    accessToken,
    responseId: response.id,
    supabaseUrl,
    publishableKey,
    fetchImpl,
  });
  const matching = existing.find((row) => sameDefinitions(row, engine));
  if (matching) {
    return toResult(matching, { idempotent: true, submittedAt: response.submitted_at });
  }

  let analyzed;
  try {
    analyzed = analyzeMotivationAssessment({
      questionnaireVersion: engine.questionnaireVersion,
      rulesetVersion: engine.rulesetVersion,
      reportModelVersion: engine.reportModelVersion,
      answers: response.answers,
      presentedQuestionCodes: response.presented_question_codes,
      assessmentId: response.id,
      clientId: client.id,
      clientName: client.full_name,
      clientCoachId: 'coach',
      status: 'completed',
      completedAt: response.submitted_at ? new Date(response.submitted_at) : null,
    });
  } catch {
    return { ok: false, error: 'unavailable' };
  }

  const analysisSnapshot = {
    schemaVersion: analyzed.report?.schemaVersion || engine.reportModelVersion,
    scoring: analyzed.scoring,
    nutrition: analyzed.nutrition,
    evaluation: analyzed.evaluation,
    report: analyzed.report,
    provenance: {
      questionnaireVersion: analyzed.provenance.questionnaireVersion,
      rulesetVersion: analyzed.provenance.rulesetVersion,
      reportModelVersion: analyzed.provenance.reportModelVersion,
      contentHash: analyzed.provenance.contentHash,
    },
  };

  const coachUserId = createdByUserId || userIdFromAccessToken(accessToken);
  const role = serviceRoleKey || readMotivationServiceRoleKey(env).serviceRoleKey;
  if (!coachUserId || !role) {
    return { ok: false, error: 'unavailable' };
  }

  const persisted = await persistTrustedMotivationAnalysis({
    supabaseUrl,
    publishableKey,
    serviceRoleKey: role,
    createdByUserId: coachUserId,
    fetchImpl,
    responseId: response.id,
    clientId: client.id,
    engine,
    presentedQuestionCodes: response.presented_question_codes,
    answers: response.answers,
    analysisSnapshot,
  });
  if (!persisted.ok) return persisted;

  return toResult({
    id: persisted.id,
    analysis_version: persisted.analysis_version,
    questionnaire_version: engine.questionnaireVersion,
    ruleset_version: engine.rulesetVersion,
    report_model_version: engine.reportModelVersion,
    content_hash: engine.contentHash,
    created_at: persisted.created_at,
  }, {
    idempotent: persisted.idempotent,
    analysisSnapshot,
    provenance: analysisSnapshot.provenance,
    submittedAt: response.submitted_at,
  });
}

export { MotivationContentHashMismatchError as _MotivationContentHashMismatchError };
