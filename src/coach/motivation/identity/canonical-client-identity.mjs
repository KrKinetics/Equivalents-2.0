/**
 * Canonical client identity for Coach reports and PDFs.
 * Built only from the authorized client record — never from answers, URLs, or snapshots.
 */

import { getReportTimestamp } from '../lib/report-timestamp.mjs';
import { sanitizeClientNameForFilename } from '../lib/pdf/filename.mjs';

export class ClientIdentityError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ClientIdentityError';
    this.code = code;
  }
}

export function shortClientId(clientId) {
  const id = String(clientId || '').replace(/-/g, '').trim();
  return id.slice(0, 8);
}

export function buildCanonicalClientIdentity(client) {
  const clientId = String(client?.id || client?.client_id || '').trim();
  const fullName = String(client?.full_name || client?.fullName || '').trim();
  if (!clientId || !fullName || /^client$/i.test(fullName)) {
    return { ok: false, error: 'client_identity_missing' };
  }
  const email = String(client?.email || '').trim();
  const phone = String(client?.phone || '').trim();
  const serviceType = String(client?.service_type || client?.serviceType || '').trim();
  return {
    ok: true,
    identity: {
      clientId,
      fullName,
      email: email || null,
      phone: phone || null,
      serviceType: serviceType || null,
      shortId: shortClientId(clientId),
    },
  };
}

export function assertPdfClientIdentity({
  requestedClientId,
  analysisClientId,
  reportClientId,
  identity,
} = {}) {
  if (!identity?.fullName || !identity?.clientId) {
    return { ok: false, error: 'client_identity_missing' };
  }
  const requested = String(requestedClientId || '').trim();
  const analysis = String(analysisClientId || '').trim();
  const report = String(reportClientId || '').trim();
  if (!requested || analysis !== requested || report !== requested || identity.clientId !== requested) {
    return { ok: false, error: 'client_identity_mismatch' };
  }
  return { ok: true };
}

export function requireCanonicalIdentity(client) {
  const built = buildCanonicalClientIdentity(client);
  if (!built.ok) throw new ClientIdentityError(built.error);
  return built.identity;
}

export function buildMotivationPdfFilename({
  identity,
  submittedAt = null,
  analysisVersion = 1,
  timezone = 'America/Toronto',
} = {}) {
  if (!identity?.fullName || !identity?.shortId) {
    throw new ClientIdentityError('client_identity_missing');
  }
  const { filenameDate } = getReportTimestamp({
    date: submittedAt ? new Date(submittedAt) : new Date(),
    timezone,
  });
  const slug = sanitizeClientNameForFilename(identity.fullName);
  const version = Number.isFinite(Number(analysisVersion)) ? Number(analysisVersion) : 1;
  return `profil-motivationnel_${slug}_${identity.shortId}_${filenameDate}_v${version}.pdf`;
}

export function pdfDocumentInfo(identity, analysisVersion) {
  if (!identity?.fullName) throw new ClientIdentityError('client_identity_missing');
  const version = analysisVersion == null ? '' : ` - Analyse v${analysisVersion}`;
  return {
    Title: `Profil motivationnel - ${identity.fullName}`,
    Subject: `Rapport Coach KR Kinetics - ${identity.fullName}${version}`,
    Author: 'KR Kinetics',
    Creator: 'KR Kinetics',
    Producer: 'KR Kinetics',
    Keywords: identity.shortId ? `ref:${identity.shortId}` : '',
  };
}
