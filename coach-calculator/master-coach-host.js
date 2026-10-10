/**
 * Master Coach host for the existing nutrition calculator.
 * Saves and publishes through Master Coach. Does not open another coach login.
 */
(function masterCoachNutritionHost() {
  const host = window.__MAITRE_COACH_NUTRITION__;
  const UNSAVED = 'Des modifications ne sont pas sauvegardées. Sauvegardez le dossier avant de publier.';
  if (!host || !/^[0-9a-f-]{36}$/i.test(host.masterClientId || '')) return;

  const style = document.createElement('style');
  style.textContent = '.app-header, form[action="/dashboard.html"] { display: none !important; } #mc-nutrition-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 16px; } #mc-nutrition-bar a { color: #071B41; font-weight: 700; }';
  document.head.appendChild(style);

  const masterClientId = host.masterClientId;
  let cleanSnapshot = null;
  let pending = false;
  let attemptId = null;

  function status(message, kind) {
    let el = document.getElementById('workspace-persist-status') || document.getElementById('mc-nutrition-status');
    if (!el) {
      el = document.createElement('p');
      el.id = 'mc-nutrition-status';
      el.style.cssText = 'margin:0 0 12px;font:600 14px/1.4 Inter,system-ui,sans-serif;color:#071B41;';
      const bar = document.getElementById('mc-nutrition-bar');
      if (bar) bar.insertAdjacentElement('afterend', el);
      else document.body.prepend(el);
    }
    el.textContent = message;
    el.dataset.kind = kind || 'ok';
  }

  function bearer() {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || '';
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || '');
        if (parsed?.access_token) return parsed.access_token;
      } catch {
        // Ignore unrelated storage entries.
      }
    }
    return null;
  }

  function currentPayload() {
    const name = (document.getElementById('nom_athlete')?.value || '').trim();
    if (typeof window.getProfilData !== 'function') return null;
    const next = window.getProfilData(name);
    return { ...(host.loadedPayload || {}), ...next };
  }

  function isDirty() {
    if (!cleanSnapshot) return false;
    return JSON.stringify(currentPayload()) !== cleanSnapshot;
  }

  async function load() {
    const token = bearer();
    if (!token) {
      status('Session Master Coach requise.', 'error');
      return;
    }
    const response = await fetch(`/api/coach/clients/${masterClientId}/nutrition-dossier`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      status('Le dossier n’a pas pu être chargé.', 'error');
      return;
    }
    if (body.payload && typeof window.appliquerProfilData === 'function') {
      host.loadedPayload = body.payload;
      const name = String(body.payload.nom || '').trim();
      window.appliquerProfilData(body.payload, name);
    }
    cleanSnapshot = JSON.stringify(currentPayload());
    status(body.exists ? 'Dossier chargé' : 'Aucun dossier enregistré', 'ok');
  }

  window.sauvegarderProfil = async function masterCoachSave() {
    const token = bearer();
    const payload = currentPayload();
    if (!token || !payload) {
      status('Session Master Coach requise.', 'error');
      return;
    }
    status('Sauvegarde en cours…', 'busy');
    const response = await fetch(`/api/coach/clients/${masterClientId}/nutrition-dossier`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payload }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      status('Le dossier n’a pas pu être enregistré.', 'error');
      return;
    }
    host.loadedPayload = payload;
    cleanSnapshot = JSON.stringify(currentPayload());
    status('Dossier sauvegardé', 'ok');
  };

  async function publish() {
    if (isDirty()) {
      status(UNSAVED, 'error');
      return;
    }
    if (pending) return;
    const token = bearer();
    if (!token) {
      status('Session Master Coach requise.', 'error');
      return;
    }
    if (!attemptId) attemptId = crypto.randomUUID();
    pending = true;
    try {
      const response = await fetch(`/api/coach/clients/${masterClientId}/nutrition-publications/canonical`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publicationAttemptId: attemptId, dirty: false }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok || typeof body.revisionNumber !== 'number') {
        status(body?.message || 'Publication refusée. Le dossier n’a pas été modifié.', 'error');
        return;
      }
      attemptId = null;
      status(`Publié dans l’app · révision ${body.revisionNumber}`, 'ok');
    } finally {
      pending = false;
    }
  }

  function installButtons() {
    const saveBtn = document.querySelector('button[onclick*="sauvegarderProfil"]');
    if (saveBtn) saveBtn.setAttribute('onclick', 'sauvegarderProfil()');
    if (saveBtn && !document.getElementById('kr-publish-nutrition')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'kr-publish-nutrition';
      button.textContent = 'Publier dans l’app';
      button.className = saveBtn.className;
      button.addEventListener('click', () => { void publish(); });
      saveBtn.insertAdjacentElement('afterend', button);
    }
  }

  function boot() {
    installButtons();
    if (typeof window.appliquerProfilData === 'function' && typeof window.getProfilData === 'function') {
      void load();
      return;
    }
    window.setTimeout(boot, 200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
