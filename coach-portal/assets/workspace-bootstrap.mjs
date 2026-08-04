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
  workspaceOpenPath,
} from '/src/coach/workspace/workspace-access.mjs';
import {
  resolveWorkspaceOpenState,
  renderWorkspaceClientMenu,
  shouldProceedWorkspaceClientSwitch,
  waitForWorkspaceCalculatorReady,
  canonicalizePersistedDossierPayload,
  isPersistedDossierDirty,
  lockWorkspaceAccessDenied,
  WORKSPACE_ACCESS_DENIED_MESSAGE,
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

function renderBanner(ctx, message, kind = 'ok') {
  const el = ensureBanner();
  const color = kind === 'error' ? '#fecaca' : '#e2e8f0';
  const border = kind === 'error' ? '#dc2626' : '#ED1136';
  el.style.borderBottomColor = border;
  el.style.color = color;
  // Portal return control is server-injected HTML; banner innerHTML must not own it.
  if (!ctx) {
    el.innerHTML = `<span>${escapeHtml(message)}</span>`;
    return;
  }
  el.innerHTML = `
    <span>
      Dossier : <strong>${escapeHtml(ctx.fullName)}</strong>
      · Org : <strong>${escapeHtml(ctx.organizationName)}</strong> (${escapeHtml(ctx.organizationSlug)})
      · Marque PDF : <strong>${escapeHtml(ctx.brandId === 'elevate' ? 'Elevate Fitness' : 'KR Kinetics')}</strong>
      · Rôle : ${escapeHtml(ctx.role)}
    </span>
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

/** Clients visible to the current session via RLS (same org only). */
async function fetchOrganizationClients(supabase, organizationId) {
  const { data, error } = await supabase
    .from('clients')
    .select('id, full_name, organization_id, is_fictional')
    .eq('organization_id', organizationId)
    .eq('is_fictional', true)
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data || [];
}

function ensureCurrentClientListed(clients, ctx) {
  if (clients.some((row) => row.id === ctx.clientId)) return clients;
  return [
    ...clients,
    { id: ctx.clientId, full_name: ctx.fullName, organization_id: ctx.organizationId, is_fictional: true },
  ];
}

function applyWorkspacePayload(payload, ctx) {
  const prepared = attachWorkspaceMeta(payload, {
    clientId: ctx.clientId,
    organizationSlug: ctx.organizationSlug,
    fullName: ctx.fullName,
  });
  const displayName = String(prepared.nom || ctx.fullName).trim() || ctx.fullName;
  window.appliquerProfilData(prepared, displayName);
  const select = document.getElementById('liste_profils');
  if (select) select.value = ctx.clientId;
  return displayName;
}

/**
 * Workspace persistence + org client selector (replaces offline profile picker).
 */
function installWorkspacePersistence(supabase, ctx, userId, orgClients) {
  const dossierStore = createSupabaseClientDossierStore(supabase);
  const localStore = window.CoachClientProfileStore;
  /** @type {object|null} last successfully loaded/saved canonical dossier payload */
  let cleanPayload = null;
  const clients = ensureCurrentClientListed(orgClients, ctx);

  /** Same payload shape written to Supabase — excludes client selector / chrome. */
  function getPersistedDossierPayload() {
    const nom = (document.getElementById('nom_athlete')?.value || '').trim() || ctx.fullName;
    const raw = window.getProfilData(nom);
    return attachWorkspaceMeta(raw, {
      clientId: ctx.clientId,
      organizationSlug: ctx.organizationSlug,
      fullName: ctx.fullName,
    });
  }

  function refreshClientMenu() {
    const select = document.getElementById('liste_profils');
    renderWorkspaceClientMenu(select, {
      clients,
      selectedClientId: ctx.clientId,
    });
    if (select) select.onchange = () => window.chargerProfil();
  }

  function markCleanFromCurrent() {
    cleanPayload = canonicalizePersistedDossierPayload(getPersistedDossierPayload());
  }

  function isDirty() {
    return isPersistedDossierDirty(cleanPayload, getPersistedDossierPayload());
  }

  // Block ambiguous localStorage writes while workspace SoT is active.
  if (localStore && typeof localStore.saveProfile === 'function') {
    localStore.saveProfile = function workspaceBlockLocalSave() {
      throw new Error(
        'En mode workspace, utilisez « Sauvegarder » pour persister dans Supabase. La sauvegarde localStorage est désactivée.',
      );
    };
  }

  // Never re-list offline calculator profiles into the workspace menu.
  window.initProfils = function workspaceInitProfils() {
    refreshClientMenu();
  };
  refreshClientMenu();

  window.sauvegarderProfil = async function workspaceSauvegarderProfil() {
    try {
      setPersistStatus('Sauvegarde en cours…', 'busy');
      const nom = (document.getElementById('nom_athlete')?.value || '').trim() || ctx.fullName;
      if (document.getElementById('nom_athlete')) {
        document.getElementById('nom_athlete').value = nom;
      }
      const payload = getPersistedDossierPayload();
      await dossierStore.saveClientDossier(ctx.clientId, payload, {
        organizationId: ctx.organizationId,
        userId,
      });
      // Only after Supabase success: rebuild menu, then freeze canonical clean snapshot.
      refreshClientMenu();
      markCleanFromCurrent();
      setPersistStatus('Dossier sauvegardé', 'ok');
    } catch (err) {
      // Keep previous cleanPayload — failed save must remain dirty if form differs.
      const msg = err?.message || String(err);
      setPersistStatus(`Erreur de sauvegarde : ${msg}`, 'error');
      window.alert(`Impossible de sauvegarder le dossier : ${msg}`);
    }
  };

  const saveBtn = document.querySelector('button[onclick*="sauvegarderProfil"]');
  if (saveBtn) {
    saveBtn.setAttribute('onclick', 'sauvegarderProfil()');
  }

  // Select change = switch active client (full navigation loads the other dossier).
  window.chargerProfil = function workspaceChargerProfil() {
    const select = document.getElementById('liste_profils');
    const nextId = parseClientIdParam(select?.value || '');
    const decision = shouldProceedWorkspaceClientSwitch({
      currentClientId: ctx.clientId,
      nextClientId: nextId || '',
      isDirty: isDirty(),
      confirm: (msg) => window.confirm(msg),
    });
    if (!decision.proceed) {
      if (select) select.value = ctx.clientId;
      return;
    }
    // Full navigation clears previous client UI and reloads the target dossier.
    window.location.assign(workspaceOpenPath(nextId));
  };

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
        // Import is UI-only until Save — leave dirty.
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

  return { dossierStore, markCleanFromCurrent, refreshClientMenu, getPersistedDossierPayload, isDirty };
}

/**
 * Full lock after denied/missing access — generic copy only, no client/org disclosure.
 */
async function enterAccessDeniedState() {
  renderBanner(null, WORKSPACE_ACCESS_DENIED_MESSAGE, 'error');
  setPersistStatus(WORKSPACE_ACCESS_DENIED_MESSAGE, 'error');
  try {
    await waitForWorkspaceCalculatorReady(() => window, 8000);
  } catch {
    // Calculator may be incomplete; still lock whatever is in the DOM.
  }
  lockWorkspaceAccessDenied(document);
  // Neutralize historical calculator entry points that might rehydrate local profiles.
  window.initProfils = function workspaceDeniedInitProfils() {};
  window.sauvegarderProfil = function workspaceDeniedSave() {};
  window.chargerProfil = function workspaceDeniedLoad() {};
  window.supprimerProfil = function workspaceDeniedDelete() {};
  window.appliquerProfilData = function workspaceDeniedApply() {};
  window.importerProfilJSON = function workspaceDeniedImport() {};
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
    // No dossier apply before redirect — session recovery path unchanged.
    redirectClean(`/login.html?next=${encodeURIComponent(`/workspace/?client_id=${clientId}`)}`);
    return;
  }

  const membership = await loadMembership(supabase, session.user.id);
  const brandProbe = brandIdFromOrganizationSlug(membership.organization.slug);
  if (!brandProbe) {
    await enterAccessDeniedState();
    return;
  }

  const client = await fetchClient(supabase, clientId);
  let ctx;
  try {
    ctx = assertWorkspaceClientAccess({ client, membership });
  } catch {
    await enterAccessDeniedState();
    return;
  }

  await waitForWorkspaceCalculatorReady(() => window);
  window.choisirPdfCreator(ctx.brandId);

  const orgClients = await fetchOrganizationClients(supabase, ctx.organizationId);
  const workspace = installWorkspacePersistence(supabase, ctx, session.user.id, orgClients);
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
  });

  renderBanner(ctx, 'Chargement du dossier…', 'busy');
  setPersistStatus('Chargement du dossier…', 'busy');

  try {
    const existing = await workspace.dossierStore.loadClientDossier(ctx.clientId);
    const resolved = resolveWorkspaceOpenState(existing, ctx.stub);
    applyWorkspacePayload(resolved.payload, ctx);
    workspace.refreshClientMenu();
    workspace.markCleanFromCurrent();
    setPersistStatus(resolved.status, resolved.statusKind);
  } catch (err) {
    applyWorkspacePayload(ctx.stub, ctx);
    workspace.refreshClientMenu();
    workspace.markCleanFromCurrent();
    setPersistStatus(`Erreur de chargement : ${err.message || err}`, 'error');
  }
}

bootWorkspace().catch(async (err) => {
  console.error(err);
  await enterAccessDeniedState();
});
