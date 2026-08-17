/**
 * Coach-facing planning landmarks presentation.
 * Conversions stay in intake-anthropometrics.mjs. Renderers must not recalculate.
 */

import { buildIntakeAnthropometricsView } from './intake-anthropometrics.mjs';
import { formatCoachDate } from '../motivation/lib/report-timestamp.mjs';

function text(value) {
  return String(value ?? '').trim();
}

/**
 * @param {unknown} raw
 * @returns {{
 *   age: string,
 *   heightPrimary: string,
 *   heightSecondary: string,
 *   weightPrimary: string,
 *   weightSecondary: string,
 *   sourceSubmittedAt: string|null,
 *   sourceCaption: string,
 * } | null}
 */
export function presentPlanningLandmarks(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const anthro = raw.anthropometrics && typeof raw.anthropometrics === 'object'
    ? raw.anthropometrics
    : raw;
  const age = text(anthro.age);
  const heightPrimary = text(anthro.heightPrimary);
  const heightSecondary = text(anthro.heightSecondary);
  const weightPrimary = text(anthro.weightPrimary);
  const weightSecondary = text(anthro.weightSecondary);
  if (!age && !heightPrimary && !weightPrimary) return null;
  if (age === '0 ans' || weightPrimary === '0 lb' || heightPrimary === '0 cm') return null;
  const sourceSubmittedAt = raw.sourceSubmittedAt || anthro.sourceSubmittedAt || null;
  const sourceCaption = sourceSubmittedAt
    ? `Pré-entrevue soumise le ${formatCoachDate(sourceSubmittedAt)}`
    : '';
  return {
    age,
    heightPrimary,
    heightSecondary,
    weightPrimary,
    weightSecondary,
    sourceSubmittedAt: sourceSubmittedAt || null,
    sourceCaption,
  };
}

/**
 * @param {Record<string, unknown>} answers
 * @param {{ sourceSubmittedAt?: string|null }} [extras]
 */
export function presentPlanningLandmarksFromAnswers(answers, extras = {}) {
  const view = buildIntakeAnthropometricsView(answers);
  if (!view?.collected) return null;
  return presentPlanningLandmarks({
    ...view,
    sourceSubmittedAt: extras.sourceSubmittedAt || null,
  });
}
