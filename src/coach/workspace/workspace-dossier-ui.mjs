/**
 * Pure helpers for authenticated workspace dossier open/apply UX.
 * No DOM side effects except optional select helpers that accept elements.
 */

export const WORKSPACE_DOSSIER_OPTION_PREFIX = 'workspace-dossier:';

/**
 * @param {string} clientId
 */
export function workspaceDossierOptionValue(clientId) {
  return `${WORKSPACE_DOSSIER_OPTION_PREFIX}${clientId}`;
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
 * Ensure the workspace dossier appears selected without writing localStorage.
 * @param {HTMLSelectElement|null|undefined} select
 * @param {{ clientId: string, label: string }} args
 */
export function selectWorkspaceDossierInMenu(select, { clientId, label }) {
  if (!select || !clientId) return null;
  const value = workspaceDossierOptionValue(clientId);
  let opt = Array.from(select.options).find((o) => o.value === value);
  if (!opt) {
    opt = document.createElement('option');
    opt.value = value;
    // Keep first placeholder option; insert workspace entry next.
    if (select.options.length > 0) {
      select.add(opt, select.options[1] || null);
    } else {
      select.add(opt);
    }
  }
  opt.textContent = `${label} (Supabase)`;
  select.value = value;
  return value;
}

/**
 * Wait until DOMContentLoaded handlers have run and calculator data is ready.
 * Prevents apply-then-wipe races with initJoursData/applyJourData defaults.
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
        // Let queued DOMContentLoaded listeners finish before resolve.
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
