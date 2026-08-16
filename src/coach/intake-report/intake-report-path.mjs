import { parseClientIdParam } from '../workspace/workspace-access.mjs';

export const INTAKE_REPORT_PATH = '/pre-interview-report.html';

/**
 * Authenticated report URL. Client identifier only — never a token or answers.
 * @param {unknown} clientId
 * @returns {string}
 */
export function intakeReportOpenPath(clientId) {
  const id = parseClientIdParam(clientId);
  if (!id) return INTAKE_REPORT_PATH;
  return `${INTAKE_REPORT_PATH}?client_id=${encodeURIComponent(id)}`;
}
