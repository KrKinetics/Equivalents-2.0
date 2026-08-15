/**
 * Coach dashboard intake-invite click orchestration.
 * Send/API result is authoritative. Dashboard refresh is best-effort.
 * Never rewrite a successful mutation as "Création du lien refusée."
 */

export const INTAKE_SEND_FAILURE_STATUS = 'Création du lien refusée.';
export const INTAKE_REFRESH_FAILURE_NOTICE =
  'La liste n’a pas pu être actualisée. Rechargez la page pour voir le nouvel état.';

/**
 * @param {unknown} currentStatus
 * @returns {string}
 */
export function composeRefreshFailureStatus(currentStatus) {
  const prefix = String(currentStatus || '').trim();
  if (!prefix) return INTAKE_REFRESH_FAILURE_NOTICE;
  if (prefix.includes(INTAKE_REFRESH_FAILURE_NOTICE)) return prefix;
  return `${prefix} ${INTAKE_REFRESH_FAILURE_NOTICE}`;
}

/**
 * @param {unknown} result
 * @returns {'ok'|'error'}
 */
export function statusKindForInviteResult(result) {
  return result?.email_sent === true ? 'ok' : 'error';
}

/**
 * @param {object} opts
 * @param {() => Promise<object>} opts.send
 * @param {(result: object) => Promise<void>|void} opts.applyResult
 * @param {() => Promise<void>} opts.refresh
 * @param {(message: string, kind?: string) => void} opts.setStatus
 * @param {() => string} opts.getStatus
 * @returns {Promise<{ committed: boolean, refreshed: boolean, skipped?: boolean, result: object|null }>}
 */
export async function runIntakeInviteGesture({
  send,
  applyResult,
  refresh,
  setStatus,
  getStatus,
} = {}) {
  let result;
  try {
    result = await send();
  } catch {
    setStatus(INTAKE_SEND_FAILURE_STATUS, 'error');
    return { committed: false, refreshed: false, result: null };
  }

  try {
    await applyResult(result);
  } catch {
    if (result?.email_sent === true) {
      const to = typeof result.recipient_email === 'string' ? result.recipient_email : '';
      setStatus(to ? `Invitation envoyée à ${to}.` : 'Invitation envoyée.', 'ok');
    }
  }

  try {
    await refresh();
    return { committed: true, refreshed: true, result };
  } catch {
    setStatus(
      composeRefreshFailureStatus(getStatus()),
      statusKindForInviteResult(result),
    );
    return { committed: true, refreshed: false, result };
  }
}

/**
 * @param {object} opts
 * @param {string} opts.clientId
 * @param {Set<string>} opts.inFlight
 * @param {() => Promise<object>} opts.send
 * @param {(result: object) => Promise<void>|void} opts.applyResult
 * @param {() => Promise<void>} opts.refresh
 * @param {(message: string, kind?: string) => void} opts.setStatus
 * @param {() => string} opts.getStatus
 */
export async function runIntakeInviteButtonAction({
  clientId,
  inFlight,
  send,
  applyResult,
  refresh,
  setStatus,
  getStatus,
} = {}) {
  if (!clientId || !inFlight || inFlight.has(clientId)) {
    return { skipped: true, committed: false, refreshed: false, result: null };
  }
  inFlight.add(clientId);
  try {
    const outcome = await runIntakeInviteGesture({
      send,
      applyResult,
      refresh,
      setStatus,
      getStatus,
    });
    return { skipped: false, ...outcome };
  } finally {
    inFlight.delete(clientId);
  }
}
