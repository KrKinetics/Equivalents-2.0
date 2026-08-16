/**
 * Deterministic KR pre-interview PDF filename.
 * Dedicated path — do not reuse the nutrition Plan_ filename helper.
 */

export function sanitizeIntakeReportFilenamePart(value, fallback = 'Client') {
  const safe = String(value || '')
    .replace(/[^a-zA-Z0-9À-ſ_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return safe || fallback;
}

/**
 * @param {{ clientName?: unknown, submittedAtIso?: unknown }} [opts]
 * @returns {string}
 */
export function buildIntakeReportPdfFilename({ clientName, submittedAtIso } = {}) {
  const client = sanitizeIntakeReportFilenamePart(clientName, 'Client');
  const raw = String(submittedAtIso || '');
  const date = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : new Date().toISOString().slice(0, 10);
  return `KR-Kinetics_Pre-entrevue_${client}_${date}.pdf`;
}
