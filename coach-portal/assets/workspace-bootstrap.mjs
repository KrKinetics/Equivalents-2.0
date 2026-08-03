/**
 * Authenticated Coach workspace bootstrap (same-origin with portal).
 * Supabase client_dossiers is the SoT for the selected fictional client.
 * Offline calculator localStorage remains unchanged outside this bootstrap.
 * Publishable Supabase key only — never service_role.
 */
import { getPortalSupabase, recoverSession, redirectClean } from './auth-session.js';
import { brandIdFromOrganizationSlug } from '/src/coach/workspace/org-brand.mjs';
import {
  assertWorkspaceClientAccess,
  parseClientIdParam,
} from '/src/coach/workspace/workspace-access.mjs';
import {
  resolveWorkspaceOpenState,
  selectWorkspaceDossierInMenu,
  waitForWorkspaceCalculatorReady,
  workspaceDossierOptionValue,
  WORKSPACE_DOSSIER_OPTION_PREFIX,
} from '/src/coach/workspace/workspace-dossier-ui.mjs';
import { attachWorkspaceMeta } from '/src/coach/services/storage/dossier-schema.mjs';
import { createSupabaseClientDossierStore } from '/src/coach/services/storage/supabase-client-dossier-store.mjs';

function clientIdFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return parseClientIdParam(params.get('client_id'));
}

function ensureBanner() {
  let el = document.getElementById('workspace-context-banner');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'workspace-context-banner';
  el.setAttribute('role', 'status');
  el.style.cssText = [
    'position:sticky',
    'top:0',
    'z-index:9999',
    'padding:10px 16px',
    'background:#0f172a',
    'color:#e2e8f0',
    'font:600 14px/1.4 system-ui,sans-serif',
    'border-bottom:3px solid #ED1136',
    'display:flex',
    'gap:16px',
    'flex-wrap:wrap',
    'align-items:center',
    'justify-content:space-between',
  ].join(';');
  document.body.prepend(el);
  return el;
}

function ensureStatusSlot(banner) {
  let status = document.getElementById('workspace-persist-status');
  if (status) return status;
  status = document.createElement('div');
  status.id = 'workspace-persist-status';
  status.style.cssText = 'flex:1 0 100%;font:500 13px/1.35 system-ui,sans-serif;color:#94a3b8;';
  banner.appendChild(status);
  return status;
}

function setPersistStatus(message, kind = 'ok') {
  const banner = ensureBanner();
  const status = ensureStatusSlot(banner);
  status.textContent = message || '';
  status.style.color = kind === 'error' ? '#fecaca' : kind === 'busy' ? '#fde68a' : '#86efac';
}

function portalReturnLinkHtml() {
  return `<a href="/dashboard.html" id="workspace-return-portal" style="color:#93c5fd;font-weight:700;white-space:nowrap;">← Retour au portail</a>`;
}

function renderBanner(ctx, message, kind = 'ok') {
  const el = ensureBanner();
  const color = kind === 'error' ? '#fecaca' : '#e2e8f0';
  const border = kind === 'error' ? '#dc2626' : '#ED1136';
  el.style.borderBottomColor = border;
  el.style.color = color;
  if (!ctx) {
    el.innerHTML = `<span>${escapeHtml(message)}</span>${portalReturnLinkHtml()}`;
    return;
  }
  el.innerHTML = `
    <span>
      Dossier : <strong>${escapeHtml(ctx.fullName)}</strong>
      · Org : <strong>${escapeHtml(ctx.organizationName)}</strong> (${escapeHtml(ctx.organizationSlug)})
      · Marque PDF : <strong>${escapeHtml(ctx.brandId === 'elevate' ? 'Elevate Fitness' : 'KR Kinetics')}</strong>
      · Rôle : ${escapeHtml(ctx.role)}
    </span>
    ${portalReturnLinkHtml()}
  `;
  ensureStatusSlot(el);
  if (message) setPersistStatus(message, kind === 'error' ? 'error' : kind === 'busy' ? 'busy' : 'ok');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadMembership(supabase, userId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('role, organization_id, organizations(id, slug, name)')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.organizations) throw new Error('Aucun membership organisation trouvé.');
  return {
    role: data.role,
    organizationId: data.organization_id,
    organization: data.organizations,
  };
}

async function fetchClient(supabase, clientId) {
  const { data, error } = await supabase
    .from('clients')
    .select('id, full_name, notes, organization_id, is_fictional')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function applyWorkspacePayload(payload, ctx) {
  const prepared = attachWorkspaceMeta(payload, {
    clientId: ctx.clientId,
    organizationSlug: ctx.organizationSlug,
    fullName: ctx.fullName,
  });
  const displayName = String(prepared.nom || ctx.fullName).trim() || ctx.fullName;
  window.appliquerProfilData(prepared, displayName);
  selectWorkspaceDossierInMenu(document.getElementById('liste_profils'), {
    clientId: ctx.clientId,
    label: displayName,
  });
  return displayName;
}

/**
 * Workspace persistence: Supabase SoT for save/load; JSON import/export stay UI-only until Save.
 */
function installWorkspacePersistence(supabase, ctx, userId) {
  const dossierStore = createSupabaseClientDossierStore(supabase);
  const localStore = window.CoachClientProfileStore;

  // Block ambiguous localStorage writes while workspace SoT is active.
  if (localStore && typeof localStore.saveProfile === 'function') {
    localStore.saveProfile = function workspaceBlockLocalSave() {
      throw new Error(
        'En mode workspace, utilisez « Sauvegarder » (Supabase). La sauvegarde localStorage est désactivée.',
      );
    };
  }

  window.sauvegarderProfil = async function workspaceSauvegarderProfil() {
    try {
      setPersistStatus('Sauvegarde en cours…', 'busy');
      const nom = (document.getElementById('nom_athlete')?.value || '').trim() || ctx.fullName;
      if (document.getElementById('nom_athlete')) {
        document.getElementById('nom_athlete').value = nom;
      }
      const raw = window.getProfilData(nom);
      const payload = attachWorkspaceMeta(raw, {
        clientId: ctx.clientId,
        organizationSlug: ctx.organizationSlug,
        fullName: ctx.fullName,
      });
      await dossierStore.saveClientDossier(ctx.clientId, payload, {
        organizationId: ctx.organizationId,
        userId,
      });
      selectWorkspaceDossierInMenu(document.getElementById('liste_profils'), {
        clientId: ctx.clientId,
        label: nom,
      });
      setPersistStatus('Dossier sauvegardé', 'ok');
    } catch (err) {
      const msg = err?.message || String(err);
      setPersistStatus(`Erreur de sauvegarde : ${msg}`, 'error');
      window.alert(`Impossible de sauvegarder le dossier : ${msg}`);
    }
  };

  // Prefer explicit listener so onclick cannot keep a stale localStorage save path.
  const saveBtn = document.querySelector('button[onclick*="sauvegarderProfil"]');
  if (saveBtn) {
    saveBtn.setAttribute('onclick', 'sauvegarderProfil()');
  }

  window.chargerProfil = async function workspaceChargerProfil() {
    const select = document.getElementById('liste_profils');
    const key = select?.value || '';
    if (!key) return;
    if (key.startsWith(WORKSPACE_DOSSIER_OPTION_PREFIX)) {
      try {
        setPersistStatus('Chargement du dossier…', 'busy');
        const existing = await dossierStore.loadClientDossier(ctx.clientId);
        const resolved = resolveWorkspaceOpenState(existing, ctx.stub);
        applyWorkspacePayload(resolved.payload, ctx);
        setPersistStatus(resolved.status, resolved.statusKind);
      } catch (err) {
        setPersistStatus(`Erreur de chargement : ${err.message || err}`, 'error');
      }
      return;
    }
    // Do not silently hydrate this Supabase client from unrelated localStorage athletes.
    setPersistStatus(
      'En workspace, seul le dossier Supabase de ce client est la source de vérité. Utilisez Importer JSON puis Sauvegarder si besoin.',
      'error',
    );
    selectWorkspaceDossierInMenu(select, { clientId: ctx.clientId, label: ctx.fullName });
  };

  // Import JSON: hydrate UI only; persist requires explicit Sauvegarder (Supabase SoT).
  const fileInput = document.getElementById('import-profil');
  if (fileInput) {
    fileInput.onchange = async (event) => {
      try {
        const file = event.target.files?.[0];
        if (!file) return;
        setPersistStatus('Import JSON…', 'busy');
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.sexe || (!data.banque && !data.jours)) {
          throw new Error('JSON invalide (sexe + jours/banque requis).');
        }
        const nom = (document.getElementById('nom_athlete')?.value || '').trim()
          || data.nom
          || ctx.fullName;
        applyWorkspacePayload(
          attachWorkspaceMeta(data, {
            clientId: ctx.clientId,
            organizationSlug: ctx.organizationSlug,
            fullName: nom,
          }),
          { ...ctx, fullName: nom },
        );
        setPersistStatus('JSON importé dans l’UI — cliquez Sauvegarder pour persister dans Supabase.', 'ok');
      } catch (err) {
        const msg = err?.message || String(err);
        setPersistStatus(`Import refusé : ${msg}`, 'error');
        window.alert(msg);
      } finally {
        event.target.value = '';
      }
    };
  }

  return dossierStore;
}

async function bootWorkspace() {
  const clientId = clientIdFromLocation();
  if (!clientId) {
    renderBanner(null, 'Ouvrez un client fictif depuis le portail (bouton « Ouvrir le dossier »).', 'error');
    return;
  }

  renderBanner(null, 'Chargement du dossier…', 'ok');
  setPersistStatus('Chargement du dossier…', 'busy');

  const supabase = getPortalSupabase();
  const session = await recoverSession(supabase);
  if (!session) {
    redirectClean(`/login.html?next=${encodeURIComponent(`/workspace/?client_id=${clientId}`)}`);
    return;
  }

  const membership = await loadMembership(supabase, session.user.id);
  const brandProbe = brandIdFromOrganizationSlug(membership.organization.slug);
  if (!brandProbe) {
    renderBanner(null, `Organisation non prise en charge : ${membership.organization.slug}`, 'error');
    return;
  }

  const client = await fetchClient(supabase, clientId);
  let ctx;
  try {
    ctx = assertWorkspaceClientAccess({ client, membership });
  } catch (err) {
    renderBanner(null, err.message || String(err), 'error');
    return;
  }

  // Wait until calculator init (including DOMContentLoaded defaults) has settled.
  await waitForWorkspaceCalculatorReady(() => window);
  window.choisirPdfCreator(ctx.brandId);

  const dossierStore = installWorkspacePersistence(supabase, ctx, session.user.id);
  window.__COACH_WORKSPACE_CONTEXT__ = Object.freeze({
    userId: session.user.id,
    organizationId: ctx.organizationId,
    organizationSlug: ctx.organizationSlug,
    organizationName: ctx.organizationName,
    role: ctx.role,
    clientId: ctx.clientId,
    brandId: ctx.brandId,
    fullName: ctx.fullName,
    persistence: 'supabase',
    dossierOptionValue: workspaceDossierOptionValue(ctx.clientId),
  });

  renderBanner(ctx, 'Chargement du dossier…', 'busy');
  setPersistStatus('Chargement du dossier…', 'busy');

  try {
    const existing = await dossierStore.loadClientDossier(ctx.clientId);
    const resolved = resolveWorkspaceOpenState(existing, ctx.stub);
    applyWorkspacePayload(resolved.payload, ctx);
    setPersistStatus(resolved.status, resolved.statusKind);
  } catch (err) {
    applyWorkspacePayload(ctx.stub, ctx);
    setPersistStatus(`Erreur de chargement : ${err.message || err}`, 'error');
  }
}

bootWorkspace().catch((err) => {
  console.error(err);
  renderBanner(null, err.message || String(err), 'error');
  setPersistStatus(`Erreur de chargement : ${err.message || err}`, 'error');
});
