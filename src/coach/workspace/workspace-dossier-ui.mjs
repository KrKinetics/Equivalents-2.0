/**
 * Pure helpers for authenticated workspace open/apply UX and client selector.
 * Workspace menu lists org clients (never localStorage athlete_* keys).
 */

export const WORKSPACE_CLIENT_SELECT_LABEL = 'Client actif';
export const WORKSPACE_UNSAVED_SWITCH_MESSAGE =
  'Des modifications ne sont pas sauvegardées. Changer de client quand même?';

/** Volatile / non-nutritional keys excluded from dirty detection. */
export const WORKSPACE_DIRTY_EXCLUDED_KEYS = Object.freeze([
  'savedAt', // regenerated on every getProfilData() call
  'activeJour', // day-tab navigation, not a dossier edit
]);

/**
 * Canonical persisted dossier shape for dirty detection.
 * Strips volatile timestamps and UI-navigation fields; never includes the client selector.
 * @param {unknown} payload
 * @returns {object|null}
 */
export function canonicalizePersistedDossierPayload(payload) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const clone = JSON.parse(JSON.stringify(payload));
  for (const key of WORKSPACE_DIRTY_EXCLUDED_KEYS) {
    delete clone[key];
  }
  return clone;
}

/**
 * @param {unknown} payload
 * @returns {string}
 */
export function dossierPayloadFingerprint(payload) {
  const canonical = canonicalizePersistedDossierPayload(payload);
  return canonical ? JSON.stringify(canonical) : '';
}

/**
 * @param {unknown} baselinePayload last loaded/saved canonical payload
 * @param {unknown} currentPayload current getPersistedDossierPayload() result
 */
export function isPersistedDossierDirty(baselinePayload, currentPayload) {
  if (baselinePayload == null) return false;
  return dossierPayloadFingerprint(baselinePayload) !== dossierPayloadFingerprint(currentPayload);
}

/**
 * Decide which profile to apply on workspace open.
 * @param {null|{payload: object}} existing
 * @param {object} stub
 * @returns {{ mode: 'existing'|'empty', payload: object, status: string, statusKind: 'ok'|'busy'|'error' }}
 */
export function resolveWorkspaceOpenState(existing, stub) {
  if (existing?.payload) {
    return {
      mode: 'existing',
      payload: existing.payload,
      status: 'Dossier chargé',
      statusKind: 'ok',
    };
  }
  return {
    mode: 'empty',
    payload: stub,
    status: 'Aucun dossier sauvegardé pour ce client',
    statusKind: 'ok',
  };
}

/**
 * Render #liste_profils as the active-client selector (org clients only).
 * @param {HTMLSelectElement|null|undefined} select
 * @param {{ clients: { id: string, full_name: string }[], selectedClientId: string }} args
 */
export function renderWorkspaceClientMenu(select, { clients, selectedClientId }) {
  if (!select) return null;
  const rows = Array.isArray(clients) ? clients : [];
  select.innerHTML = '';
  select.setAttribute('aria-label', WORKSPACE_CLIENT_SELECT_LABEL);
  select.title = WORKSPACE_CLIENT_SELECT_LABEL;

  for (const row of rows) {
    if (!row?.id) continue;
    const opt = select.ownerDocument.createElement('option');
    opt.value = row.id;
    opt.textContent = String(row.full_name || '').trim() || row.id;
    select.appendChild(opt);
  }

  if (selectedClientId && [...select.options].some((o) => o.value === selectedClientId)) {
    select.value = selectedClientId;
  }
  return select.value || null;
}

/**
 * @param {{ currentClientId: string, nextClientId: string, isDirty: boolean, confirm?: (msg: string) => boolean }} args
 * @returns {{ proceed: boolean, reason: 'same'|'clean'|'confirmed'|'cancelled' }}
 */
export function shouldProceedWorkspaceClientSwitch({
  currentClientId,
  nextClientId,
  isDirty,
  confirm: confirmFn,
}) {
  if (!nextClientId || nextClientId === currentClientId) {
    return { proceed: false, reason: 'same' };
  }
  if (!isDirty) return { proceed: true, reason: 'clean' };
  const ask = typeof confirmFn === 'function'
    ? confirmFn
    : (typeof globalThis.confirm === 'function' ? globalThis.confirm.bind(globalThis) : () => false);
  const ok = ask(WORKSPACE_UNSAVED_SWITCH_MESSAGE);
  return ok
    ? { proceed: true, reason: 'confirmed' }
    : { proceed: false, reason: 'cancelled' };
}

/**
 * Wait until DOMContentLoaded handlers have run and calculator data is ready.
 */
export function waitForWorkspaceCalculatorReady(getGlobals = () => globalThis, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const g = getGlobals();
      const domReady = g.document?.readyState === 'interactive' || g.document?.readyState === 'complete';
      const apiReady = typeof g.appliquerProfilData === 'function'
        && typeof g.getProfilData === 'function'
        && typeof g.sauvegarderProfil === 'function'
        && typeof g.choisirPdfCreator === 'function'
        && g.COACH_DATA?.totalFoods === 287;
      if (domReady && apiReady) {
        if (typeof g.requestAnimationFrame === 'function') {
          g.requestAnimationFrame(() => g.requestAnimationFrame(() => resolve()));
        } else {
          setTimeout(resolve, 0);
        }
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('Calculateur Coach non prêt (timeout).'));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}
