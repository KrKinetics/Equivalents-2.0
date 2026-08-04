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

/** Generic denial copy — never disclose names, org ids, or existence of foreign clients. */
export const WORKSPACE_ACCESS_DENIED_MESSAGE = 'Accès refusé ou client introuvable.';
export const WORKSPACE_DASHBOARD_RETURN_LABEL = 'Retour au tableau de bord';

/**
 * Lock the calculator chrome after an access denial.
 * Clears athlete_* options and disables save/import/export/delete/fields.
 * Leaves only the server-rendered dashboard return form usable.
 * @param {Document} [doc]
 */
export function lockWorkspaceAccessDenied(doc = globalThis.document) {
  if (!doc?.body) return { message: WORKSPACE_ACCESS_DENIED_MESSAGE };

  const select = doc.getElementById('liste_profils');
  if (select) {
    select.innerHTML = '';
    select.value = '';
    select.disabled = true;
    select.hidden = true;
    select.onchange = null;
    select.removeAttribute('onchange');
    select.setAttribute('aria-hidden', 'true');
  }

  const nom = doc.getElementById('nom_athlete');
  if (nom) {
    nom.value = '';
    nom.disabled = true;
    nom.readOnly = true;
  }

  const fileInput = doc.getElementById('import-profil');
  if (fileInput) {
    fileInput.value = '';
    fileInput.disabled = true;
    fileInput.hidden = true;
  }

  for (const btn of doc.querySelectorAll('button')) {
    const onclick = btn.getAttribute('onclick') || '';
    if (
      /sauvegarderProfil|supprimerProfil|exporterProfilJSON|import-profil|importerProfilJSON/.test(onclick)
      || btn.id === 'btn-export-pdf'
    ) {
      btn.disabled = true;
      btn.hidden = true;
      btn.setAttribute('aria-hidden', 'true');
    }
  }

  // Hide calculator UI; keep banner + dashboard return form only.
  for (const el of [...doc.body.children]) {
    if (el.id === 'workspace-context-banner') continue;
    const isDashForm = el.tagName === 'FORM'
      && el.getAttribute('action') === '/dashboard.html';
    if (isDashForm) {
      el.hidden = false;
      el.removeAttribute('aria-hidden');
      const submit = el.querySelector('button[type="submit"]');
      if (submit) {
        submit.disabled = false;
        submit.hidden = false;
        submit.textContent = WORKSPACE_DASHBOARD_RETURN_LABEL;
      }
      continue;
    }
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    el.querySelectorAll('input, select, textarea, button').forEach((node) => {
      node.disabled = true;
      if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
        if (node.type !== 'hidden' && node.type !== 'file') node.value = '';
      }
      if (node.tagName === 'SELECT') {
        node.innerHTML = '';
        node.value = '';
      }
    });
  }

  return { message: WORKSPACE_ACCESS_DENIED_MESSAGE };
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
