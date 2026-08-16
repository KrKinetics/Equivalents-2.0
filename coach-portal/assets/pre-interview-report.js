import {
  bindServerSessionCookieSync,
  getPortalSupabase,
  recoverSession,
  redirectPreservingAuthParams,
} from './auth-session.js';
import { clearLoginAutoRedirectGuard } from './login-redirect.mjs';
import { parseClientIdParam } from '/src/coach/workspace/workspace-access.mjs';
import { buildIntakeReportViewModel } from '/src/coach/intake-report/intake-report-view-model.mjs';
import { buildIntakeReportMarkup } from '/src/coach/intake-report/build-intake-report-html.mjs';

const KR_LOGO_SRC = './assets/logo-kr-kinetics-horizontal.png';

const statusEl = document.getElementById('status');
const reportRoot = document.getElementById('report-root');
const downloadBtn = document.getElementById('download-pdf');

let supabase;
let membership = null;
let clientId = null;

function setStatus(message, kind = '') {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
  statusEl.classList.toggle('hidden', !message);
}

function clientIdFromLocation(search = window.location.search) {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return parseClientIdParam(params.get('client_id'));
}

async function requireSession() {
  const session = await recoverSession(supabase);
  if (!session) {
    redirectPreservingAuthParams('./login.html');
    return null;
  }
  return session;
}

async function loadMembership(userId) {
  const { data, error } = await supabase
    .from('memberships')
    .select('role, organization_id, organizations(id, slug, name)')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.organizations) {
    throw new Error('Aucun membership organisation trouvé pour cet utilisateur invité.');
  }
  return {
    role: data.role,
    organizationId: data.organization_id,
    organization: data.organizations,
  };
}

async function loadSubmittedReport(id) {
  const [{ data: client, error: clientError }, { data: response, error: responseError }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, full_name, organization_id, is_fictional, service_type')
      .eq('id', id)
      .eq('organization_id', membership.organizationId)
      .maybeSingle(),
    supabase
      .from('client_intake_responses')
      .select('answers, submitted_at, status')
      .eq('organization_id', membership.organizationId)
      .eq('client_id', id)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (clientError) throw clientError;
  if (responseError) throw responseError;
  if (!client || client.is_fictional !== true) {
    throw new Error('Client introuvable ou hors de votre organisation.');
  }
  if (!response) {
    throw new Error('Aucune réponse soumise pour ce client.');
  }
  return { client, response };
}

function renderReport({ client, response }) {
  const viewModel = buildIntakeReportViewModel({
    clientName: client.full_name,
    submittedAt: response.submitted_at,
    answers: response.answers,
  });
  reportRoot.innerHTML = buildIntakeReportMarkup(viewModel, { logoSrc: KR_LOGO_SRC });
  document.title = `${viewModel.title} — ${viewModel.clientName}`;
}

async function downloadPdf() {
  if (!clientId || !membership) return;
  downloadBtn.disabled = true;
  setStatus('Préparation du PDF…');
  try {
    const res = await fetch('/api/coach-generate-intake-report-pdf', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/pdf, application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        organization_id: membership.organizationId,
        organization_slug: membership.organization?.slug || null,
      }),
    });
    if (!res.ok) {
      setStatus('Téléchargement du PDF refusé.', 'error');
      return;
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    const filename = match ? decodeURIComponent(match[1].replace(/"/g, '')) : 'KR-Kinetics_Pre-entrevue.pdf';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus('');
  } catch {
    setStatus('Téléchargement du PDF impossible.', 'error');
  } finally {
    downloadBtn.disabled = false;
  }
}

async function boot() {
  setStatus('');
  clientId = clientIdFromLocation();
  if (!clientId) {
    setStatus('Identifiant client manquant ou invalide.', 'error');
    downloadBtn.disabled = true;
    return;
  }

  supabase = getPortalSupabase();
  bindServerSessionCookieSync(supabase);
  const session = await requireSession();
  if (!session) return;
  clearLoginAutoRedirectGuard(sessionStorage);

  membership = await loadMembership(session.user.id);
  const loaded = await loadSubmittedReport(clientId);
  renderReport(loaded);
  downloadBtn.addEventListener('click', () => {
    void downloadPdf();
  });
}

boot().catch((err) => {
  setStatus(`Lecture impossible : ${err.message || err}`, 'error');
  downloadBtn.disabled = true;
});
