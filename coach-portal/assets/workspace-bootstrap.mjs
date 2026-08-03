/**
 * Authenticated Coach workspace bootstrap (same-origin with portal).
 * Loads fictional client under RLS and applies brand from organization slug.
 * Publishable Supabase key only — never service_role.
 */
import { getPortalSupabase, recoverSession, redirectClean } from './auth-session.js';
import { brandIdFromOrganizationSlug } from '/src/coach/workspace/org-brand.mjs';
import {
  assertWorkspaceClientAccess,
  parseClientIdParam,
} from '/src/coach/workspace/workspace-access.mjs';

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
  window.appliquerProfilData(ctx.stub, ctx.fullName);
  window.__COACH_WORKSPACE_CONTEXT__ = Object.freeze({
    userId: session.user.id,
    organizationId: ctx.organizationId,
    organizationSlug: ctx.organizationSlug,
    organizationName: ctx.organizationName,
    role: ctx.role,
    clientId: ctx.clientId,
    brandId: ctx.brandId,
    fullName: ctx.fullName,
  });
  renderBanner(ctx, 'Dossier ouvert', 'ok');
}

bootWorkspace().catch((err) => {
  console.error(err);
  renderBanner(null, err.message || String(err), 'error');
});
