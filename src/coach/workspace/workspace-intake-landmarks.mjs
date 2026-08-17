/**
 * Read-only pre-interview landmarks for the nutrition workspace.
 * Never writes into calculator fields. Never logs answers.
 */

import { buildIntakeAnthropometricsView } from '../intake/intake-anthropometrics.mjs';
import { formatIntakeReportSubmittedAt } from '../intake-report/intake-report-view-model.mjs';

export function describeWorkspaceIntakeLandmarks(answers, submittedAt) {
  const anthropometrics = buildIntakeAnthropometricsView(answers);
  if (!anthropometrics?.collected) return null;
  return {
    ...anthropometrics,
    submittedAtDisplay: formatIntakeReportSubmittedAt(submittedAt),
  };
}

export function buildWorkspaceIntakeLandmarksHtml(landmarks, escapeHtml) {
  if (!landmarks?.collected) return '';
  const rows = [
    landmarks.age ? `Âge : ${landmarks.age}` : '',
    landmarks.heightPrimary
      ? `Grandeur : ${landmarks.heightPrimary}${landmarks.heightSecondary ? ` / ${landmarks.heightSecondary}` : ''}`
      : '',
    landmarks.weightPrimary
      ? `Poids déclaré : ${landmarks.weightPrimary}${landmarks.weightSecondary ? ` / ${landmarks.weightSecondary}` : ''}`
      : '',
    landmarks.submittedAtDisplay ? `Date du questionnaire : ${landmarks.submittedAtDisplay}` : '',
  ].filter(Boolean);
  if (!rows.length) return '';
  return `
    <section id="intake-client-landmarks" class="intake-client-landmarks" aria-label="Repères client">
      <h2>Repères client</h2>
      <ul>${rows.map((row) => `<li>${escapeHtml(row)}</li>`).join('')}</ul>
    </section>
  `;
}
