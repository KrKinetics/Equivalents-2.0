/**
 * Immutable motivation engine versions.
 * Historical evaluations must resolve the versions they were submitted with.
 * There is no silent "latest" during analysis.
 */

import { createHash } from 'node:crypto';
import {
  RULES_V41,
  CONTRADICTIONS_V41,
  RULESET_V41_VERSION,
  RULESET_V41_THRESHOLDS,
} from '../rules/ruleset-v4.1.mjs';
import {
  RULES_V42,
  CONTRADICTIONS_V42,
  RULESET_V42_VERSION,
  RULESET_V42_THRESHOLDS,
} from '../rules/ruleset-v4.2.mjs';
import {
  MAX_ADAPTIVE_PER_DOMAIN,
  QUESTIONNAIRE_V41_ADAPTIVE_MAX,
  V41_ADAPTIVE_CANDIDATES,
  V41_ADAPTIVE_BANK_CODES as ADAPTIVE_BANK_CODES,
} from '../questionnaire/adaptive-bank-v41.mjs';
import {
  V41_BASE_CODES,
  V41_ADAPTIVE_BANK_CODES,
  SEED_QUESTIONS_V41,
} from '../questionnaire/seed-questions-v41.mjs';
import {
  MAX_ADAPTIVE_PER_DOMAIN as V42_MAX_ADAPTIVE_PER_DOMAIN,
  QUESTIONNAIRE_V42_HARD_MAX,
  QUESTIONNAIRE_V42_NARRATIVE_MAX,
  QUESTIONNAIRE_V42_SCORING_ADAPTIVE_MAX,
  V42_NARRATIVE_CANDIDATES,
  V42_SCORING_CANDIDATES,
} from '../questionnaire/adaptive-bank-v42.mjs';
import {
  SEED_QUESTIONS_V42,
  V42_ADAPTIVE_BANK_CODES,
  V42_BASE_CODES,
  V42_NARRATIVE_BANK_CODES,
  V42_SCORING_ADAPTIVE_CODES,
} from '../questionnaire/seed-questions-v42.mjs';
import { V41_DOMAIN_DEFINITIONS } from '../scoring/domain-interpretation-v41.mjs';
import { V42_DOMAIN_DEFINITIONS } from '../scoring/domain-interpretation-v42.mjs';
import { toEngineQuestionInput } from '../engine/to-question-input.mjs';

export const QUESTIONNAIRE_V41 = 'questionnaire-v4.1';
export const RULESET_V41 = RULESET_V41_VERSION;
export const REPORT_MODEL_V42 = 'report-model-v4.2';

export const QUESTIONNAIRE_V42 = 'questionnaire-v4.2';
export const RULESET_V42 = RULESET_V42_VERSION;
export const REPORT_MODEL_V43 = 'report-model-v4.3';

export const MOTIVATION_ENGINE_ID = 'kr-motivation-engine';

/** Combinations this portal build can compute. No silent latest. */
export const SUPPORTED_MOTIVATION_ENGINES = Object.freeze([
  Object.freeze({
    questionnaireVersion: QUESTIONNAIRE_V41,
    rulesetVersion: RULESET_V41,
    reportModelVersion: REPORT_MODEL_V42,
  }),
  Object.freeze({
    questionnaireVersion: QUESTIONNAIRE_V42,
    rulesetVersion: RULESET_V42,
    reportModelVersion: REPORT_MODEL_V43,
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

function snapshotQuestion(question) {
  return {
    code: question.code,
    text: question.text,
    description: question.description ?? null,
    section: question.section,
    type: question.type ?? 'likert',
    primaryDimension: question.primaryDimension ?? null,
    secondaryDimensions: [...(question.secondaryDimensions ?? [])],
    scoringDirection: question.scoringDirection ?? 'positive',
    weight: question.weight ?? 1,
    tags: [...(question.tags ?? [])],
    required: question.required ?? true,
    maxSelections: question.maxSelections ?? null,
    options: question.options ? [...question.options] : null,
    likertMin: question.likertMin ?? 1,
    likertMax: question.likertMax ?? 5,
  };
}

function snapshotQuestionV42(question) {
  return {
    ...snapshotQuestion(question),
    helper: question.helper ?? null,
    examples: question.examples ? [...question.examples] : null,
    chips: question.chips ? [...question.chips] : null,
    maxLength: question.maxLength ?? null,
  };
}

function isV41Triple(versions) {
  return versions.questionnaireVersion === QUESTIONNAIRE_V41
    && versions.rulesetVersion === RULESET_V41
    && versions.reportModelVersion === REPORT_MODEL_V42;
}

function isV42Triple(versions) {
  return versions.questionnaireVersion === QUESTIONNAIRE_V42
    && versions.rulesetVersion === RULESET_V42
    && versions.reportModelVersion === REPORT_MODEL_V43;
}

/**
 * Canonical snapshot of every immutable definition that can change analysis.
 * v4.1 snapshot shape is frozen so historical hashes stay bit-for-bit.
 */
export function buildMotivationDefinitionSnapshot(versions) {
  if (isV42Triple(versions)) {
    return {
      engineId: MOTIVATION_ENGINE_ID,
      questionnaireVersion: versions.questionnaireVersion,
      rulesetVersion: versions.rulesetVersion,
      reportModelVersion: versions.reportModelVersion,
      baseQuestionCodes: [...V42_BASE_CODES],
      adaptiveQuestionCodes: [...V42_SCORING_ADAPTIVE_CODES],
      narrativeQuestionCodes: [...V42_NARRATIVE_BANK_CODES],
      adaptiveBankCodes: [...V42_ADAPTIVE_BANK_CODES],
      adaptiveMax: QUESTIONNAIRE_V42_SCORING_ADAPTIVE_MAX,
      narrativeMax: QUESTIONNAIRE_V42_NARRATIVE_MAX,
      hardQuestionMax: QUESTIONNAIRE_V42_HARD_MAX,
      adaptivePerDomainMax: V42_MAX_ADAPTIVE_PER_DOMAIN,
      adaptiveCandidates: V42_SCORING_CANDIDATES.map((candidate) => ({
        code: candidate.code,
        domainId: candidate.domainId,
        priority: candidate.priority,
        affectedDecisionIds: [...(candidate.affectedDecisionIds ?? [])],
        decisionImpact: candidate.decisionImpact,
        narrativeImpact: candidate.narrativeImpact,
        frontPageImpact: candidate.frontPageImpact,
        uncertaintyReduction: candidate.uncertaintyReduction,
      })),
      narrativeCandidates: V42_NARRATIVE_CANDIDATES.map((candidate) => ({
        code: candidate.code,
        trigger: candidate.trigger,
        narrativeImpact: candidate.narrativeImpact,
        frontPageImpact: candidate.frontPageImpact,
        uncertaintyReduction: candidate.uncertaintyReduction,
        priority: candidate.priority,
      })),
      questions: SEED_QUESTIONS_V42.map(snapshotQuestionV42),
      domainDefinitions: V42_DOMAIN_DEFINITIONS.map((definition) => ({
        domainId: definition.domainId,
        label: definition.label,
        coreCodes: [...definition.coreCodes],
        adaptiveCodes: [...definition.adaptiveCodes],
        affectedDecisionIds: [...(definition.affectedDecisionIds ?? [])],
        useRawLikert: Boolean(definition.useRawLikert),
      })),
      rulesetThresholds: { ...RULESET_V42_THRESHOLDS },
      rules: RULES_V42,
      contradictions: CONTRADICTIONS_V42,
    };
  }

  return {
    engineId: MOTIVATION_ENGINE_ID,
    questionnaireVersion: versions.questionnaireVersion,
    rulesetVersion: versions.rulesetVersion,
    reportModelVersion: versions.reportModelVersion,
    baseQuestionCodes: [...V41_BASE_CODES],
    adaptiveQuestionCodes: [...V41_ADAPTIVE_BANK_CODES],
    adaptiveBankCodes: [...ADAPTIVE_BANK_CODES],
    adaptiveMax: QUESTIONNAIRE_V41_ADAPTIVE_MAX,
    adaptivePerDomainMax: MAX_ADAPTIVE_PER_DOMAIN,
    adaptiveCandidates: V41_ADAPTIVE_CANDIDATES.map((candidate) => ({
      code: candidate.code,
      domainId: candidate.domainId,
      priority: candidate.priority,
      affectedDecisionIds: [...(candidate.affectedDecisionIds ?? [])],
    })),
    questions: SEED_QUESTIONS_V41.map(snapshotQuestion),
    domainDefinitions: V41_DOMAIN_DEFINITIONS.map((definition) => ({
      domainId: definition.domainId,
      label: definition.label,
      coreCodes: [...definition.coreCodes],
      adaptiveCodes: [...definition.adaptiveCodes],
      affectedDecisionIds: [...(definition.affectedDecisionIds ?? [])],
      useRawLikert: Boolean(definition.useRawLikert),
    })),
    rulesetThresholds: { ...RULESET_V41_THRESHOLDS },
    rules: RULES_V41,
    contradictions: CONTRADICTIONS_V41,
  };
}

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
  if (isV42Triple(requested)) {
    return {
      ...requested,
      engineId: MOTIVATION_ENGINE_ID,
      rules: RULES_V42,
      contradictions: CONTRADICTIONS_V42,
      adaptiveMax: QUESTIONNAIRE_V42_SCORING_ADAPTIVE_MAX,
      narrativeMax: QUESTIONNAIRE_V42_NARRATIVE_MAX,
      hardQuestionMax: QUESTIONNAIRE_V42_HARD_MAX,
      adaptiveCandidates: V42_SCORING_CANDIDATES,
      narrativeCandidates: V42_NARRATIVE_CANDIDATES,
      baseQuestionCodes: V42_BASE_CODES,
      adaptiveQuestionCodes: V42_SCORING_ADAPTIVE_CODES,
      narrativeQuestionCodes: V42_NARRATIVE_BANK_CODES,
      questions: SEED_QUESTIONS_V42,
      questionInputs: SEED_QUESTIONS_V42.map((seed, index) => toEngineQuestionInput(seed, index)),
      definitionSnapshot,
      contentHash: hashMotivationDefinitions(definitionSnapshot),
    };
  }

  return {
    ...requested,
    engineId: MOTIVATION_ENGINE_ID,
    rules: RULES_V41,
    contradictions: CONTRADICTIONS_V41,
    adaptiveMax: QUESTIONNAIRE_V41_ADAPTIVE_MAX,
    narrativeMax: 0,
    hardQuestionMax: 38,
    adaptiveCandidates: V41_ADAPTIVE_CANDIDATES,
    narrativeCandidates: [],
    baseQuestionCodes: V41_BASE_CODES,
    adaptiveQuestionCodes: V41_ADAPTIVE_BANK_CODES,
    narrativeQuestionCodes: [],
    questions: SEED_QUESTIONS_V41,
    questionInputs: SEED_QUESTIONS_V41.map((seed, index) => toEngineQuestionInput(seed, index)),
    definitionSnapshot,
    contentHash: hashMotivationDefinitions(definitionSnapshot),
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

export { isV41Triple, isV42Triple };
