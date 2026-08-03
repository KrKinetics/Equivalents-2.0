/**
 * Authenticated Coach workspace bootstrap (same-origin with portal).
 * Loads fictional client under RLS, restores Supabase dossier SoT when present,
 * and routes Sauvegarder to Supabase (localStorage left unchanged for offline calculator).
 * Publishable Supabase key only — never service_role.
 */
import { getPortalSupabase, recoverSession, redirectClean } from './auth-session.js';
import { brandIdFromOrganizationSlug } from '/src/coach/workspace/org-brand.mjs';
import {
  assertWorkspaceClientAccess,
  parseClientIdParam,
} from '/src/coach/workspace/workspace-access.mjs';
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
  status.style.cssText = 'width:100%;font:500 13px/1.35 system-ui,sans-serif;color:#94a3b8;';
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
  if (!ctx) {
    el.innerHTML = `<span>${escapeHtml(message)}</span><a href="/dashboard.html" style="color:#93c5fd;">Retour au portail</a>`;
    return;
  }
  el.innerHTML = `
    <span>
      Dossier : <strong>${escapeHtml(ctx.fullName)}</strong>
      · Org : <strong>${escapeHtml(ctx.organizationName)}</strong> (${escapeHtml(ctx.organizationSlug)})
      · Marque PDF : <strong>${escapeHtml(ctx.brandId === 'elevate' ? 'Elevate Fitness' : 'KR Kinetics')}</strong>
      · Rôle : ${escapeHtml(ctx.role)}
    </span>
    <a href="/dashboard.html" style="color:#93c5fd;font-weight:700;">← Portail</a>
  `;
  ensureStatusSlot(el);
  if (message) setPersistStatus(message, kind === 'error' ? 'error' : 'ok');
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

function waitForCalculatorReady() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (typeof window.appliquerProfilData === 'function'
        && typeof window.getProfilData === 'function'
        && typeof window.sauvegarderProfil === 'function'
        && typeof window.choisirPdfCreator === 'function'
        && window.COACH_DATA?.totalFoods === 287) {
        resolve();
        return;
      }
      if (Date.now() - started > 30000) {
        reject(new Error('Calculateur Coach non prêt (timeout).'));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
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
      setPersistStatus(`Dossier sauvegardé (${new Date().toLocaleTimeString()})`, 'ok');
    } catch (err) {
      const msg = err?.message || String(err);
      setPersistStatus(`Erreur de sauvegarde : ${msg}`, 'error');
      window.alert(`Impossible de sauvegarder le dossier : ${msg}`);
    }
  };

  // Import JSON: hydrate UI only; persist requires explicit Sauvegarder (Supabase SoT).
  if (typeof window.importerProfilJSON === 'function') {
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
          const payload = attachWorkspaceMeta(data, {
            clientId: ctx.clientId,
            organizationSlug: ctx.organizationSlug,
            fullName: nom,
          });
          window.appliquerProfilData(payload, nom);
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
  }

  return dossierStore;
}

async function bootWorkspace() {
  const clientId = clientIdFromLocation();
  if (!clientId) {
    renderBanner(null, 'Ouvrez un client fictif depuis le portail (bouton « Ouvrir le dossier »).', 'error');
    return;
  }

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

  await waitForCalculatorReady();
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
  });

  renderBanner(ctx, 'Chargement du dossier…', 'ok');
  setPersistStatus('Chargement du dossier…', 'busy');

  try {
    const existing = await dossierStore.loadClientDossier(ctx.clientId);
    if (existing) {
      const payload = attachWorkspaceMeta(existing.payload, {
        clientId: ctx.clientId,
        organizationSlug: ctx.organizationSlug,
        fullName: ctx.fullName,
      });
      window.appliquerProfilData(payload, ctx.fullName);
      setPersistStatus('Dossier chargé depuis Supabase (source de vérité).', 'ok');
    } else {
      window.appliquerProfilData(ctx.stub, ctx.fullName);
      setPersistStatus('Nouveau dossier workspace — cliquez Sauvegarder pour créer la fiche Supabase.', 'ok');
    }
  } catch (err) {
    window.appliquerProfilData(ctx.stub, ctx.fullName);
    setPersistStatus(`Chargement impossible : ${err.message || err}`, 'error');
  }
}

bootWorkspace().catch((err) => {
  console.error(err);
  renderBanner(null, err.message || String(err), 'error');
});
