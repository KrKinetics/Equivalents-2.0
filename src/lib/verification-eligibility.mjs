/**
 * Single verified-eligibility decision point.
 *
 * This module intentionally receives an already-computed audit item and never
 * imports the audit engine, avoiding circular dependencies and repeated audits.
 */

import { hasStatusMismatch } from './food-status.mjs';

export function validateVerificationEligibility(food, auditItem, options = {}) {
  const alerts = Array.isArray(auditItem?.alerts) ? auditItem.alerts : [];
  const openErrors = alerts.filter(
    (alert) =>
      alert?.severity === 'ERROR' &&
      alert.resolutionStatus !== 'resolved_documented' &&
      alert.code !== 'VERIFIED_WITH_OPEN_ERRORS'
  );
  const codes = [...new Set(openErrors.map((alert) => alert.code).filter(Boolean))];
  const sourceAuthoritative = options.sourceAuthoritative === true;
  const statusSynchronized = !hasStatusMismatch(food);
  const ok = sourceAuthoritative && statusSynchronized && openErrors.length === 0;

  return {
    ok,
    openErrors,
    codes,
  };
}

export function verifiedOpenErrorsMessage(food, eligibility) {
  const id = food?.id || '(sans id)';
  const codes = eligibility?.codes?.length
    ? eligibility.codes.join(', ')
    : 'SOURCE_NON_AUTHORITATIVE';
  return `VERIFIED_WITH_OPEN_ERRORS: ${id} contient ${codes}`;
}
