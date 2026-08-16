/**
 * Immutable motivation engine versions.
 * Historical evaluations must resolve the versions they were submitted with.
 * There is no silent "latest" during analysis.
 */

import { createHash } from 'node:crypto';
import { RULES_V41, CONTRADICTIONS_V41, RULESET_V41_VERSION } from '../rules/ruleset-v4.1.mjs';
import { QUESTIONNAIRE_V41_ADAPTIVE_MAX, V41_ADAPTIVE_CANDIDATES } from '../questionnaire/adaptive-bank-v41.mjs';
import { V41_BASE_CODES, V41_ADAPTIVE_BANK_CODES, SEED_QUESTIONS_V41 } from '../questionnaire/seed-questions-v41.mjs';

export const QUESTIONNAIRE_V41 = 'questionnaire-v4.1';
export const RULESET_V41 = RULESET_V41_VERSION;
export const REPORT_MODEL_V42 = 'report-model-v4.2';

export const MOTIVATION_ENGINE_ID = 'kr-motivation-engine';

/** Combinations this portal build can compute. */
export const SUPPORTED_MOTIVATION_ENGINES = Object.freeze([
  Object.freeze({
    questionnaireVersion: QUESTIONNAIRE_V41,
    rulesetVersion: RULESET_V41,
    reportModelVersion: REPORT_MODEL_V42,
  }),
]);

export class UnknownMotivationEngineError extends Error {
  constructor(requested) {
    super(
      `Unknown motivation engine versions: questionnaire=${requested.questionnaireVersion} ruleset=${requested.rulesetVersion} reportModel=${requested.reportModelVersion}`,
    );
    this.name = 'UnknownMotivationEngineError';
    this.requested = requested;
  }
}

function versionsKey(input) {
  return `${input.questionnaireVersion}::${input.rulesetVersion}::${input.reportModelVersion}`;
}

const SUPPORTED_KEYS = new Set(SUPPORTED_MOTIVATION_ENGINES.map(versionsKey));

/**
 * Resolve an explicit engine triple. Never substitutes a newer version.
 * @param {{ questionnaireVersion: string, rulesetVersion: string, reportModelVersion: string }} input
 */
export function resolveMotivationEngine(input) {
  const requested = {
    questionnaireVersion: String(input?.questionnaireVersion ?? ''),
    rulesetVersion: String(input?.rulesetVersion ?? ''),
    reportModelVersion: String(input?.reportModelVersion ?? ''),
  };
  if (!SUPPORTED_KEYS.has(versionsKey(requested))) {
    throw new UnknownMotivationEngineError(requested);
  }

  const definitionSnapshot = buildMotivationDefinitionSnapshot(requested);
  return {
    ...requested,
    engineId: MOTIVATION_ENGINE_ID,
    rules: RULES_V41,
    contradictions: CONTRADICTIONS_V41,
    adaptiveMax: QUESTIONNAIRE_V41_ADAPTIVE_MAX,
    adaptiveCandidates: V41_ADAPTIVE_CANDIDATES,
    baseQuestionCodes: V41_BASE_CODES,
    adaptiveQuestionCodes: V41_ADAPTIVE_BANK_CODES,
    questions: SEED_QUESTIONS_V41,
    definitionSnapshot,
    contentHash: hashMotivationDefinitions(definitionSnapshot),
  };
}

/**
 * Serializable snapshot of the immutable definitions used for an analysis.
 * Persistence may store this later; this module never writes to a database.
 */
export function buildMotivationDefinitionSnapshot(versions) {
  return {
    engineId: MOTIVATION_ENGINE_ID,
    questionnaireVersion: versions.questionnaireVersion,
    rulesetVersion: versions.rulesetVersion,
    reportModelVersion: versions.reportModelVersion,
    baseQuestionCodes: [...V41_BASE_CODES],
    adaptiveQuestionCodes: [...V41_ADAPTIVE_BANK_CODES],
    questions: SEED_QUESTIONS_V41.map((q) => ({
      code: q.code,
      text: q.text,
      section: q.section,
      type: q.type ?? 'likert',
      primaryDimension: q.primaryDimension ?? null,
      scoringDirection: q.scoringDirection ?? 'positive',
      tags: q.tags ?? [],
    })),
    rules: RULES_V41,
    contradictions: CONTRADICTIONS_V41,
    adaptiveCandidates: V41_ADAPTIVE_CANDIDATES,
  };
}

export function stableJson(value) {
  return JSON.stringify(value, (_, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    }
    return item;
  });
}

export function hashMotivationDefinitions(snapshot) {
  return createHash('sha256').update(stableJson(snapshot)).digest('hex');
}

/**
 * Contract for a future persistence layer. Does not write anywhere.
 */
export function buildMotivationProvenance(input) {
  const engine = resolveMotivationEngine(input);
  return {
    questionnaireVersion: engine.questionnaireVersion,
    rulesetVersion: engine.rulesetVersion,
    reportModelVersion: engine.reportModelVersion,
    contentHash: engine.contentHash,
    definitionSnapshot: engine.definitionSnapshot,
  };
}
