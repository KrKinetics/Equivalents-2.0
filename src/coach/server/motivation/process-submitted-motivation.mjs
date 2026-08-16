/**
 * Coach-authenticated official analysis of a submitted motivation assessment.
 * Uses the caller's JWT only. Never accepts browser-computed analysis.
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
  return {
    ok: true,
    analysisId: row.id,
    analysisVersion: row.analysis_version,
    idempotent: extras.idempotent === true,
    createdAt: row.created_at || extras.createdAt || null,
    analysisSnapshot: extras.analysisSnapshot || row.analysis_snapshot || null,
    provenance: extras.provenance || {
      questionnaireVersion: row.questionnaire_version,
      rulesetVersion: row.ruleset_version,
      reportModelVersion: row.report_model_version,
      contentHash: row.content_hash,
    },
  };
}

async function persistMotivationAnalysis({
  accessToken,
  supabaseUrl,
  publishableKey,
  fetchImpl,
  responseId,
  clientId,
  engine,
  presentedQuestionCodes,
  answers,
  analysisSnapshot,
}) {
  const base = String(supabaseUrl).replace(/\/$/, '');
  const response = await fetchImpl(`${base}/rest/v1/rpc/persist_client_motivation_analysis`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_response_id: responseId,
      p_client_id: clientId,
      p_questionnaire_version: engine.questionnaireVersion,
      p_ruleset_version: engine.rulesetVersion,
      p_report_model_version: engine.reportModelVersion,
      p_content_hash: engine.contentHash,
      p_definition_snapshot: engine.definitionSnapshot,
      p_presented_question_codes: presentedQuestionCodes,
      p_answers_snapshot: answers,
      p_analysis_snapshot: analysisSnapshot,
    }),
  });
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: 'forbidden' };
  }
  if (!response.ok) return { ok: false, error: 'unavailable' };
  const payload = await response.json();
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row?.id || !row.analysis_version) return { ok: false, error: 'unavailable' };
  return {
    ok: true,
    id: row.id,
    analysis_version: row.analysis_version,
    idempotent: row.idempotent === true,
    created_at: row.created_at || null,
  };
}

/**
 * @returns {Promise<
 *   | { ok: true, analysisId: string, analysisVersion: number, idempotent: boolean, analysisSnapshot: object, provenance: object }
 *   | { ok: false, error: 'forbidden' | 'not_found' | 'hash_mismatch' | 'unknown_engine' | 'unavailable' }
 * >}
 */
export async function processSubmittedMotivationAssessment({
  accessToken,
  organizationId,
  clientId,
  responseId = null,
  supabaseUrl,
  publishableKey,
  fetchImpl = globalThis.fetch,
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
    return toResult(matching, { idempotent: true });
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

  const persisted = await persistMotivationAnalysis({
    accessToken,
    supabaseUrl,
    publishableKey,
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
  });
}

export { MotivationContentHashMismatchError as _MotivationContentHashMismatchError };
