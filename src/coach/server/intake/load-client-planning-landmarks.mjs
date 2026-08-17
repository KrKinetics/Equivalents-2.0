/**
 * Load submitted pre-interview planning landmarks for an authorized client.
 * Join only by authorized client_id. Never invent zeros. Never log values.
 */

import { buildIntakeAnthropometricsView } from '../../intake/intake-anthropometrics.mjs';
import { presentPlanningLandmarks } from '../../intake/planning-landmarks-view.mjs';

function isoOrNull(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/**
 * Trusted snapshot → Coach API / view-model payload. No full intake answers.
 * @param {unknown} snapshot
 */
export function planningLandmarksFromAnalysisSnapshot(snapshot) {
  const root = asObject(snapshot);
  if (!root) return null;
  const planning = asObject(root.context)?.intakePlanning || asObject(root.intakePlanning);
  if (!planning) return null;
  const snapshotClientId = textId(root.client_id || root.clientId);
  const planningClientId = textId(planning.clientId);
  if (snapshotClientId && planningClientId && snapshotClientId !== planningClientId) {
    return null;
  }
  return presentPlanningLandmarks(planning);
}

function textId(value) {
  return String(value || '').trim();
}

/**
 * @param {object} opts
 * @returns {Promise<null | {
 *   clientId: string,
 *   sourceIntakeResponseId: string,
 *   sourceSubmittedAt: string,
 *   anthropometrics: object,
 * }>}
 */
export async function loadClientPlanningLandmarks({
  accessToken,
  organizationId,
  clientId,
  submittedBeforeOrAt = null,
  supabaseUrl,
  publishableKey,
  fetchImpl = globalThis.fetch,
} = {}) {
  try {
    if (
      !accessToken
      || !organizationId
      || !clientId
      || !supabaseUrl
      || !publishableKey
      || typeof fetchImpl !== 'function'
    ) {
      return null;
    }

    const base = String(supabaseUrl).replace(/\/$/, '');
    const params = new URLSearchParams({
      organization_id: `eq.${organizationId}`,
      client_id: `eq.${clientId}`,
      status: 'eq.submitted',
      select: 'id,client_id,organization_id,status,submitted_at,answers',
      order: 'submitted_at.desc',
      limit: '20',
    });
    if (submittedBeforeOrAt) {
      params.set('submitted_at', `lte.${submittedBeforeOrAt}`);
    }

    const response = await fetchImpl(`${base}/rest/v1/client_intake_responses?${params}`, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) return null;
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) return null;

    const cutoff = submittedBeforeOrAt ? new Date(submittedBeforeOrAt) : null;
    const cutoffOk = cutoff && !Number.isNaN(cutoff.getTime());

    for (const row of rows) {
      if (!row || row.status !== 'submitted') continue;
      if (String(row.client_id || '') !== String(clientId)) continue;
      if (String(row.organization_id || '') !== String(organizationId)) continue;
      const submittedAt = isoOrNull(row.submitted_at);
      if (!submittedAt) continue;
      if (cutoffOk && new Date(submittedAt).getTime() > cutoff.getTime()) continue;

      const answers = asObject(row.answers) || {};
      const anthropometrics = buildIntakeAnthropometricsView(answers);
      if (!anthropometrics?.collected) continue;

      return {
        clientId: String(row.client_id),
        sourceIntakeResponseId: String(row.id || ''),
        sourceSubmittedAt: submittedAt,
        anthropometrics: {
          age: anthropometrics.age,
          heightPrimary: anthropometrics.heightPrimary,
          heightSecondary: anthropometrics.heightSecondary,
          weightPrimary: anthropometrics.weightPrimary,
          weightSecondary: anthropometrics.weightSecondary,
        },
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function toIntakePlanningContext(planning) {
  if (!planning?.clientId || !planning.anthropometrics) return null;
  return {
    sourceIntakeResponseId: planning.sourceIntakeResponseId || '',
    sourceSubmittedAt: planning.sourceSubmittedAt || null,
    clientId: planning.clientId,
    anthropometrics: {
      age: planning.anthropometrics.age || '',
      heightPrimary: planning.anthropometrics.heightPrimary || '',
      heightSecondary: planning.anthropometrics.heightSecondary || '',
      weightPrimary: planning.anthropometrics.weightPrimary || '',
      weightSecondary: planning.anthropometrics.weightSecondary || '',
    },
  };
}
