import {
  bindServerSessionCookieSync,
  getPortalSupabase,
  recoverSession,
  redirectPreservingAuthParams,
} from './auth-session.js';

const banner = document.getElementById('qa-banner');
const metaEl = document.getElementById('session-meta');
const blockedCard = document.getElementById('blocked-card');
const app = document.getElementById('qa-app');
const clientSelect = document.getElementById('client-select');
const inviteButton = document.getElementById('invite-button');
const openFormButton = document.getElementById('open-form-button');
const refreshButton = document.getElementById('refresh-button');
const analyzeButton = document.getElementById('analyze-button');
const inviteUrlEl = document.getElementById('invite-url');
const statusJson = document.getElementById('status-json');
const reportJson = document.getElementById('report-json');

let supabase;
let membership = null;
let lastInviteUrl = '';

function previewToolsEnabled() {
  return window.COACH_FEATURES?.previewTools === true;
}

function setBanner(message, kind = '') {
  banner.textContent = message;
  banner.className = `status ${kind}`.trim();
}

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'request_failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

async function loadClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('id, full_name, email, is_fictional')
    .eq('organization_id', membership.organizationId)
    .eq('is_fictional', true)
    .order('full_name', { ascending: true });
  if (error) throw error;
  clientSelect.innerHTML = (data || []).map((client) => (
    `<option value="${client.id}">${client.full_name || client.id}</option>`
  )).join('');
  if (!data?.length) setBanner('Aucun client fictif dans cette organisation.', 'error');
}

async function loadStatus() {
  const clientId = clientSelect.value;
  if (!clientId) return;
  const { data: invites } = await supabase
    .from('client_motivation_invites')
    .select('id, status, expires_at, submitted_at, questionnaire_version, report_model_version, content_hash, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(5);
  const { data: responses } = await supabase
    .from('client_motivation_responses')
    .select('id, status, submitted_at, consent_given')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
    .limit(5);
  const { data: analyses } = await supabase
    .from('client_motivation_analysis_versions')
    .select('analysis_version, report_model_version, created_at')
    .eq('client_id', clientId)
    .order('analysis_version', { ascending: false })
    .limit(5);
  statusJson.textContent = JSON.stringify({ invites, responses, analyses }, null, 2);
  analyzeButton.disabled = !responses?.some((row) => row.status === 'submitted');
}

async function boot() {
  if (!previewToolsEnabled()) {
    blockedCard.classList.remove('hidden');
    setBanner('Outil désactivé en Production.', 'error');
    return;
  }
  supabase = getPortalSupabase();
  bindServerSessionCookieSync(supabase);
  const session = await recoverSession(supabase);
  if (!session) {
    redirectPreservingAuthParams('./login.html?next=/motivation-qa.html');
    return;
  }
  const { data, error } = await supabase
    .from('memberships')
    .select('role, organization_id, organizations(id, slug, name)')
    .eq('user_id', session.user.id)
    .limit(1)
    .maybeSingle();
  if (error || !data?.organizations) {
    setBanner('Membership introuvable.', 'error');
    return;
  }
  membership = {
    role: data.role,
    organizationId: data.organization_id,
    organization: data.organizations,
  };
  metaEl.textContent = `${membership.organization.name} — ${session.user.email}`;
  app.classList.remove('hidden');
  await loadClients();
  await loadStatus();
}

inviteButton.addEventListener('click', async () => {
  try {
    const result = await api('/api/coach-send-motivation-invite', {
      client_id: clientSelect.value,
      organization_id: membership.organizationId,
      organization_slug: membership.organization.slug,
    });
    lastInviteUrl = result.invite_url || '';
    inviteUrlEl.textContent = lastInviteUrl || 'Invitation créée. Le courriel a peut-être été envoyé.';
    openFormButton.disabled = !lastInviteUrl;
    setBanner(result.email_sent ? 'Invitation créée et courriel envoyé.' : 'Invitation créée. Courriel non envoyé (fail-closed).', 'ok');
    await loadStatus();
  } catch (error) {
    setBanner(error.message || 'Invitation refusée.', 'error');
  }
});

openFormButton.addEventListener('click', () => {
  if (lastInviteUrl) window.open(lastInviteUrl, '_blank', 'noopener');
});

refreshButton.addEventListener('click', () => loadStatus().catch((error) => {
  setBanner(error.message || 'Statut indisponible.', 'error');
}));

analyzeButton.addEventListener('click', async () => {
  try {
    const result = await api('/api/coach-process-motivation-assessment', {
      client_id: clientSelect.value,
      organization_id: membership.organizationId,
      organization_slug: membership.organization.slug,
    });
    reportJson.textContent = JSON.stringify(result, null, 2);
    setBanner(result.idempotent ? 'Analyse déjà présente (idempotente).' : 'Analyse officielle v4.2 créée.', 'ok');
    await loadStatus();
  } catch (error) {
    setBanner(error.message || 'Analyse refusée.', 'error');
  }
});

clientSelect.addEventListener('change', () => {
  lastInviteUrl = '';
  openFormButton.disabled = true;
  inviteUrlEl.textContent = '';
  reportJson.textContent = '';
  loadStatus().catch(() => {});
});

boot();
