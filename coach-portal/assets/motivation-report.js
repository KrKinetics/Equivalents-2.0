import {
  bindServerSessionCookieSync,
  getPortalSupabase,
  recoverSession,
  redirectPreservingAuthParams,
} from './auth-session.js';
import { clearLoginAutoRedirectGuard } from './login-redirect.mjs';
import { parseClientIdParam } from '/src/coach/workspace/workspace-access.mjs';
import { buildMotivationReportViewModel, publicMotivationReportMessage } from '/src/coach/motivation/report/motivation-report-view-model.mjs';
import { buildMotivationReportMarkup } from '/src/coach/motivation/report/build-motivation-report-html.mjs';

const KR_LOGO_SRC = './assets/logo-kr-kinetics-horizontal.png';

const statusEl = document.getElementById('status');
const reportRoot = document.getElementById('report-root');
const reportError = document.getElementById('report-error');
const retryBtn = document.getElementById('retry-report');
const downloadBtn = document.getElementById('download-pdf');

let supabase;
let membership = null;
let clientId = null;
let client = null;
let reportReady = false;
let pdfBound = false;

function setStatus(message, kind = '') {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
  statusEl.classList.toggle('hidden', !message);
}

function setPdfAvailable(available) {
  reportReady = available === true;
  downloadBtn.hidden = !reportReady;
  downloadBtn.disabled = !reportReady;
}

function showReportError() {
  reportRoot.innerHTML = '';
  reportError.classList.remove('hidden');
  setStatus('');
  setPdfAvailable(false);
}

function hideReportError() {
  reportError.classList.add('hidden');
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
  if (error) throw new Error(publicMotivationReportMessage('unavailable'));
  if (!data?.organizations) {
    throw new Error(publicMotivationReportMessage('forbidden'));
  }
  return {
    role: data.role,
    organizationId: data.organization_id,
    organization: data.organizations,
  };
}

async function loadAuthorizedClient(id) {
  const { data: row, error } = await supabase
    .from('clients')
    .select('id, full_name, organization_id, is_fictional')
    .eq('id', id)
    .eq('organization_id', membership.organizationId)
    .maybeSingle();
  if (error) throw new Error(publicMotivationReportMessage('unavailable'));
  if (!row || row.organization_id !== membership.organizationId) {
    throw new Error(publicMotivationReportMessage('not_found'));
  }
  return row;
}

async function processOfficialReport() {
  const res = await fetch('/api/coach-process-motivation-assessment', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      organization_id: membership.organizationId,
      organization_slug: membership.organization?.slug || null,
    }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const error = new Error(publicMotivationReportMessage(data?.error));
    error.code = data?.error || 'unavailable';
    throw error;
  }
  return data;
}

function renderOfficialReport(currentClient, processed) {
  const viewModel = buildMotivationReportViewModel({
    report: processed.report,
    clientName: currentClient.full_name,
    submittedAt: processed.submitted_at || processed.report?.metadata?.completedAt || null,
    analyzedAt: processed.analyzed_at || processed.provenance?.analyzedAt || null,
    analysisVersion: processed.analysis_version,
    provenance: processed.provenance,
  });
  reportRoot.innerHTML = buildMotivationReportMarkup(viewModel, { logoSrc: KR_LOGO_SRC });
  document.title = `${viewModel.title} — ${viewModel.clientName}`;
}

async function downloadPdf() {
  if (!clientId || !membership || !reportReady) return;
  downloadBtn.disabled = true;
  setStatus('Préparation du PDF…');
  try {
    const res = await fetch('/api/coach-motivation-pdf', {
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
    const contentType = String(res.headers.get('Content-Type') || '');
    if (!res.ok || !contentType.includes('application/pdf')) {
      let error = 'unavailable';
      try {
        const body = await res.json();
        error = body?.error || error;
      } catch {
        // keep generic
      }
      setStatus(publicMotivationReportMessage(error), 'error');
      return;
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    const filename = match ? decodeURIComponent(match[1].replace(/"/g, '')) : 'KR-Kinetics_Profil-motivationnel.pdf';
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
    setStatus(publicMotivationReportMessage('unavailable'), 'error');
  } finally {
    downloadBtn.disabled = !reportReady;
  }
}

async function loadOfficialReport() {
  hideReportError();
  setPdfAvailable(false);
  setStatus('Préparation de l’analyse...');
  try {
    const processed = await processOfficialReport();
    renderOfficialReport(client, processed);
    hideReportError();
    setStatus('');
    setPdfAvailable(true);
  } catch (error) {
    if (error?.code === 'not_found') {
      hideReportError();
      reportRoot.innerHTML = '';
      setPdfAvailable(false);
      setStatus(publicMotivationReportMessage('not_found'), 'error');
      return;
    }
    if (error?.code === 'not_submitted') {
      hideReportError();
      reportRoot.innerHTML = '';
      setPdfAvailable(false);
      setStatus(publicMotivationReportMessage('not_submitted'), 'error');
      return;
    }
    if (error?.code === 'forbidden') {
      hideReportError();
      reportRoot.innerHTML = '';
      setPdfAvailable(false);
      setStatus(publicMotivationReportMessage('forbidden'), 'error');
      return;
    }
    showReportError();
  }
}

async function boot() {
  setStatus('');
  setPdfAvailable(false);
  clientId = clientIdFromLocation();
  if (!clientId) {
    setStatus(publicMotivationReportMessage('invalid_client'), 'error');
    return;
  }

  supabase = getPortalSupabase();
  bindServerSessionCookieSync(supabase);
  const session = await requireSession();
  if (!session) return;
  clearLoginAutoRedirectGuard(sessionStorage);

  membership = await loadMembership(session.user.id);
  client = await loadAuthorizedClient(clientId);
  if (!pdfBound) {
    downloadBtn.addEventListener('click', () => {
      void downloadPdf();
    });
    retryBtn.addEventListener('click', () => {
      void loadOfficialReport();
    });
    pdfBound = true;
  }
  await loadOfficialReport();
}

boot().catch((err) => {
  if (err?.message === publicMotivationReportMessage('not_found')) {
    setStatus(err.message, 'error');
    setPdfAvailable(false);
    return;
  }
  showReportError();
});
