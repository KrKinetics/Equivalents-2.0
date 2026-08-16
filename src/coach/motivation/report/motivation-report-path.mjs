import { parseClientIdParam } from '../../workspace/workspace-access.mjs';

export const MOTIVATION_REPORT_PATH = '/motivation-report.html';

/**
 * Authenticated Coach report URL. Client identifier only — never a token,
 * answers, or analysis snapshot.
 * @param {unknown} clientId
 * @returns {string}
 */
export function motivationReportOpenPath(clientId) {
  const id = parseClientIdParam(clientId);
  if (!id) return MOTIVATION_REPORT_PATH;
  return `${MOTIVATION_REPORT_PATH}?client_id=${encodeURIComponent(id)}`;
}
