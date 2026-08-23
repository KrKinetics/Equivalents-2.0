import {
  bindServerSessionCookieSync,
  getPortalSupabase,
  recoverSession,
  redirectPreservingAuthParams,
  redirectClean,
} from './auth-session.js';
import { clearLoginAutoRedirectGuard } from './login-redirect.mjs';
import { workspaceOpenPath } from '/src/coach/workspace/workspace-access.mjs';
import { intakeReportOpenPath } from '/src/coach/intake-report/intake-report-path.mjs';
import { motivationReportOpenPath } from '/src/coach/motivation/report/motivation-report-path.mjs';
import {
  MOTIVATION_RESEND_OPENED_CONFIRMATION,
  MOTIVATION_RESEND_SUBMITTED_CONFIRMATION,
  latestMotivationInviteByClient,
  motivationActionLabel,
  motivationClientsWithSubmittedHistory,
  resolveMotivationInviteStatus,
} from '/src/coach/client/motivation-dashboard.mjs';
import {
  NUTRITION_WORKSPACE_CTA_LABEL,
  SERVICE_CHANGE_CONFIRMATION,
  SERVICE_GROUP_HEADINGS_FR,
  SERVICE_GROUP_ORDER,
  clientHasNutritionAccess,
  groupClientsByService,
  parseServiceType,
  serviceLabelFr,
} from '/src/coach/domain/client-service-entitlements.mjs';
import { runIntakeInviteButtonAction } from '/src/coach/client/intake-invite-gesture.mjs';

const statusEl = document.getElementById('status');
const metaEl = document.getElementById('session-meta');
const clientsGroups = document.getElementById('clients-groups');
const createForm = document.getElementById('create-form');
const logoutBtn = document.getElementById('logout');
const editDialog = document.getElementById('edit-client-dialog');
const editForm = document.getElementById('edit-client-form');
const editDialogClose = document.getElementById('edit-client-dialog-close');
const editCancel = document.getElementById('edit-client-cancel');
const editServiceConfirm = document.getElementById('edit-service-confirm');
const editServiceConfirmCheck = document.getElementById('edit_service_confirm_check');
const editServiceType = document.getElementById('edit_service_type');

let supabase;
let membership = null;
let clientRows = new Map();
let motivationInviteRows = new Map();

function setStatus(message, kind = '') {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
  statusEl.classList.toggle('hidden', !message);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

/** Display-only North American phone formatting. Does not alter stored values. */
function formatPhoneDisplay(value) {
  if (value == null || value === '') return '';
  const raw = String(value).trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

function clientCountLabel(count) {
  return count === 1 ? '1 client' : `${count} clients`;
}

function syncServiceChangeConfirm() {
  const original = parseServiceType(document.getElementById('edit_original_service').value);
  const next = parseServiceType(editServiceType.value);
  const changed = Boolean(original && next && original !== next);
  editServiceConfirm.classList.toggle('hidden', !changed);
  if (!changed) editServiceConfirmCheck.checked = false;
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    window.prompt('Copiez ce lien sécurisé :', value);
    return false;
  }
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

function renderMeta(session, mem) {
  metaEl.innerHTML = `
    <dt>Courriel</dt><dd>${escapeHtml(session.user.email || '—')}</dd>
    <dt>Organisation</dt><dd>${escapeHtml(mem.organization.name)} (${escapeHtml(mem.organization.slug)})</dd>
    <dt>Rôle</dt><dd>${escapeHtml(mem.role)}</dd>
    <dt>User id</dt><dd><code>${escapeHtml(session.user.id)}</code></dd>
  `;
}

function intakeStatusMarkup(invite) {
  if (!invite) {
    return `
      <div class="intake-status-block">
        <span class="status-chip">Aucun lien</span>
      </div>
    `;
  }
  const isExpired = invite.expires_at && new Date(invite.expires_at) <= new Date();
  if (isExpired && invite.status !== 'submitted') {
    return `
      <div class="intake-status-block">
        <span class="status-chip">Expiré</span>
        <span class="intake-status-meta">Expiré ${escapeHtml(formatDate(invite.expires_at))}</span>
      </div>
    `;
  }
  const labels = {
    pending: 'Lien non ouvert',
    opened: 'En cours',
    submitted: 'Soumis',
    revoked: 'Remplacé',
  };
  const metaDate = invite.status === 'submitted'
    ? invite.submitted_at || invite.updated_at || invite.created_at
    : invite.opened_at || invite.created_at;
  const metaPrefix = invite.status === 'submitted' ? 'Soumis' : invite.status === 'opened' ? 'Ouvert' : 'Créé';
  return `
    <div class="intake-status-block">
      <span class="status-chip ${escapeHtml(invite.status)}">${escapeHtml(labels[invite.status] || invite.status)}</span>
      <span class="intake-status-meta">${escapeHtml(metaPrefix)} ${escapeHtml(formatDate(metaDate))}</span>
    </div>
  `;
}

function looksLikeClientEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return Boolean(email) && email.length <= 160 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function intakeActionLabel(row, invite) {
  if (looksLikeClientEmail(row?.email)) {
    return invite ? 'Renvoyer un nouveau lien' : 'Envoyer le lien';
  }
  return invite ? 'Nouveau lien' : 'Créer le lien';
}

function motivationStatusMarkup(invite) {
  const status = resolveMotivationInviteStatus(invite);
  if (!invite) {
    return `
      <div class="intake-status-block">
        <span class="status-chip">Aucun lien</span>
      </div>
    `;
  }
  const meta = status.metaPrefix && status.metaDate
    ? `<span class="intake-status-meta">${escapeHtml(status.metaPrefix)} ${escapeHtml(formatDate(status.metaDate))}</span>`
    : '';
  return `
    <div class="intake-status-block">
      <span class="status-chip ${escapeHtml(status.key)}">${escapeHtml(status.label)}</span>
      ${meta}
    </div>
  `;
}

function clientRowMarkup(row, invite, motivationInvite, hasMotivationReportHistory = false) {
  const submitted = invite?.status === 'submitted';
  const primaryLabel = intakeActionLabel(row, invite);
  const motivationStatus = resolveMotivationInviteStatus(motivationInvite);
  const motivationLabel = motivationActionLabel(row, motivationStatus);
  // Keep the report reachable when the latest invite is no longer submitted
  // (e.g. a new link was resent) but a submitted assessment still exists.
  const showMotivationReport = motivationStatus.showReport || Boolean(hasMotivationReportHistory);
  const nutritionCta = clientHasNutritionAccess(row.service_type)
    ? `<a class="btn-compact btn-secondary btn-open" href="${escapeHtml(workspaceOpenPath(row.id))}">${escapeHtml(NUTRITION_WORKSPACE_CTA_LABEL)}</a>`
    : '';
  return `
    <tr data-id="${escapeHtml(row.id)}" data-service="${escapeHtml(parseServiceType(row.service_type) || '')}">
      <td class="client-name-cell">
        <strong>${escapeHtml(row.full_name)}</strong>
        <span class="service-badge">${escapeHtml(serviceLabelFr(row.service_type))}</span>
      </td>
      <td class="dashboard-contact">
        <strong>${escapeHtml(row.email || 'Courriel à confirmer')}</strong>
        ${row.phone ? `<span>${escapeHtml(formatPhoneDisplay(row.phone))}</span>` : ''}
      </td>
      <td class="client-notes-cell">${escapeHtml(row.notes || '—')}</td>
      <td>${intakeStatusMarkup(invite)}</td>
      <td class="client-actions-cell">
        <div class="client-action-groups">
          <section class="client-action-group" data-group="intake">
            <h4 class="client-action-group-title">Questionnaire d’entrevue</h4>
            <div class="client-action-group-controls">
              <button type="button" class="btn-compact btn-primary btn-intake">${primaryLabel}</button>
              ${submitted ? `<a class="btn-compact btn-secondary btn-intake-report" href="${escapeHtml(intakeReportOpenPath(row.id))}" target="_blank" rel="noopener">Ouvrir le rapport</a>` : ''}
            </div>
          </section>
          ${nutritionCta ? `
          <section class="client-action-group" data-group="nutrition">
            <h4 class="client-action-group-title">Structure alimentaire</h4>
            <div class="client-action-group-controls">${nutritionCta}</div>
          </section>` : ''}
          <section class="client-action-group" data-group="motivation">
            <h4 class="client-action-group-title">Profil motivationnel</h4>
            ${motivationStatusMarkup(motivationInvite)}
            <div class="client-action-group-controls">
              ${motivationLabel ? `<button type="button" class="btn-compact btn-primary btn-motivation">${escapeHtml(motivationLabel)}</button>` : ''}
              ${showMotivationReport ? `<a class="btn-compact btn-secondary btn-motivation-report" href="${escapeHtml(motivationReportOpenPath(row.id))}" target="_blank" rel="noopener">Ouvrir le rapport</a>` : ''}
            </div>
          </section>
          <div class="client-management-actions">
            <button type="button" class="btn-compact btn-ghost btn-edit">Modifier</button>
            <button type="button" class="btn-compact btn-danger-ghost btn-delete">Supprimer</button>
          </div>
        </div>
      </td>
    </tr>
  `;
}
function renderClientGroup(serviceType, clients, latestInviteByClient, latestMotivationByClient, submittedMotivationHistory) {
  const rows = clients.length
    ? clients.map((row) => clientRowMarkup(
      row,
      latestInviteByClient.get(row.id),
      latestMotivationByClient.get(row.id),
      submittedMotivationHistory?.has(row.id) || false,
    )).join('')
    : '<tr><td colspan="5" class="empty">Aucun client</td></tr>';
  return `
    <section class="client-service-group" data-service="${escapeHtml(serviceType)}" aria-labelledby="service-heading-${escapeHtml(serviceType)}">
      <div class="client-service-group-header">
        <h3 id="service-heading-${escapeHtml(serviceType)}">${escapeHtml(SERVICE_GROUP_HEADINGS_FR[serviceType])}</h3>
        <span class="client-count">${escapeHtml(clientCountLabel(clients.length))}</span>
      </div>
      <div class="table-scroll">
        <table class="clients-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Coordonnées</th>
              <th>Notes</th>
              <th>Pré-entrevue</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

async function loadClients() {
  const [
    { data: clients, error: clientsError },
    { data: invites, error: invitesError },
    { data: motivationInvites, error: motivationError },
  ] = await Promise.all([
    supabase
      .from('clients')
      .select('id, full_name, email, phone, notes, organization_id, is_fictional, service_type, created_at')
      .eq('organization_id', membership.organizationId)
      .eq('is_fictional', false),
    supabase
      .from('client_intake_invites')
      .select('id, client_id, status, expires_at, opened_at, submitted_at, created_at')
      .eq('organization_id', membership.organizationId)
      .order('created_at', { ascending: false }),
    supabase
      .from('client_motivation_invites')
      .select('id, client_id, status, expires_at, opened_at, submitted_at, created_at, updated_at')
      .eq('organization_id', membership.organizationId)
      .order('created_at', { ascending: false }),
  ]);
  if (clientsError) throw clientsError;
  if (invitesError) throw invitesError;
  if (motivationError) throw motivationError;

  const latestInviteByClient = new Map();
  for (const invite of invites || []) {
    if (!latestInviteByClient.has(invite.client_id)) latestInviteByClient.set(invite.client_id, invite);
  }
  const latestMotivationByClient = latestMotivationInviteByClient(motivationInvites || []);
  // Derived from the invites already loaded above — no extra DB query.
  const submittedMotivationHistory = motivationClientsWithSubmittedHistory(motivationInvites || []);

  clientRows = new Map((clients || []).map((client) => [client.id, client]));
  motivationInviteRows = latestMotivationByClient;
  const grouped = groupClientsByService(clients || []);
  clientsGroups.innerHTML = SERVICE_GROUP_ORDER
    .map((serviceType) => renderClientGroup(
      serviceType,
      grouped[serviceType],
      latestInviteByClient,
      latestMotivationByClient,
      submittedMotivationHistory,
    ))
    .join('');
}

async function createClient(fullName, email, notes, serviceType) {
  const code = parseServiceType(serviceType);
  if (!code) throw new Error('Le service du client est requis.');
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('clients').insert({
    organization_id: membership.organizationId,
    created_by: user.id,
    full_name: fullName,
    email: email || null,
    notes: notes || '',
    service_type: code,
    is_fictional: false,
  });
  if (error) throw error;
}

async function updateClient(id, fullName, email, notes, serviceType) {
  const code = parseServiceType(serviceType);
  if (!code) throw new Error('Le service du client est requis.');
  const { error } = await supabase
    .from('clients')
    .update({
      full_name: fullName,
      email: email || null,
      notes,
      service_type: code,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', membership.organizationId);
  if (error) throw error;
}

async function deleteClient(id) {
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id)
    .eq('organization_id', membership.organizationId);
  if (error) throw error;
}

async function sendMotivationInvite(clientId) {
  const res = await fetch('/api/coach-send-motivation-invite', {
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
    const err = new Error('Création du lien refusée.');
    err.status = res.status;
    err.publicError = data?.error || '';
    throw err;
  }
  return data;
}

async function sendIntakeInvite(clientId) {
  const res = await fetch('/api/coach-send-intake-invite', {
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
    const err = new Error('Création du lien refusée.');
    err.status = res.status;
    err.publicError = data?.error || '';
    throw err;
  }
  return data;
}

function motivationInviteDeliveryHint(result) {
  const bits = [];
  if (result?.invite_url_path) bits.push(result.invite_url_path);
  if (result?.invite_url_has_token === true) bits.push('jeton présent');
  if (typeof result?.invite_token_fingerprint === 'string' && result.invite_token_fingerprint) {
    bits.push(`empreinte ${result.invite_token_fingerprint}`);
  }
  return bits.join(' · ');
}

async function applyInviteResult(result) {
  if (result?.email_sent === true) {
    const to = typeof result.recipient_email === 'string' ? result.recipient_email : '';
    const hint = motivationInviteDeliveryHint(result);
    setStatus(
      [to ? `Invitation envoyée à ${to}.` : 'Invitation envoyée.', hint].filter(Boolean).join(' '),
      'ok',
    );
    if (result.invite_url) await copyText(result.invite_url);
    return;
  }
  if (result?.invite_url) {
    await copyText(result.invite_url);
  }
  if (
    result?.email_delivery === 'skipped_missing_email'
    || result?.email_delivery === 'skipped_invalid_email'
  ) {
    setStatus(
      'Aucun courriel valide n’est enregistré pour ce client. Le lien a été créé — copiez-le manuellement.',
      'error',
    );
    return;
  }
  setStatus(
    'Le lien a été créé, mais le courriel n’a pas pu être envoyé.',
    'error',
  );
}

function openEditDialog(client) {
  document.getElementById('edit_client_id').value = client.id;
  document.getElementById('edit_original_service').value = parseServiceType(client.service_type) || '';
  document.getElementById('edit_full_name').value = client.full_name || '';
  document.getElementById('edit_email').value = client.email || '';
  document.getElementById('edit_notes').value = client.notes || '';
  editServiceType.value = parseServiceType(client.service_type) || '';
  editServiceConfirmCheck.checked = false;
  syncServiceChangeConfirm();
  editDialog.showModal();
  document.getElementById('edit_full_name').focus();
}

function closeEditDialog() {
  if (editDialog.open) editDialog.close();
}

async function boot() {
  setStatus('');
  supabase = getPortalSupabase();
  bindServerSessionCookieSync(supabase);
  const session = await requireSession();
  if (!session) return;
  clearLoginAutoRedirectGuard(sessionStorage);

  membership = await loadMembership(session.user.id);
  renderMeta(session, membership);
  await loadClients();
  setStatus('Session active — accès sécurisé à votre organisation.', 'ok');

  createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fullName = document.getElementById('full_name').value.trim();
    const email = document.getElementById('email').value.trim();
    const notes = document.getElementById('notes').value.trim();
    const serviceType = document.getElementById('service_type').value;
    if (!fullName) {
      setStatus('Le nom du client est requis.', 'error');
      return;
    }
    if (!parseServiceType(serviceType)) {
      setStatus('Choisissez le service du client.', 'error');
      return;
    }
    try {
      await createClient(fullName, email, notes, serviceType);
      createForm.reset();
      await loadClients();
      setStatus('Client créé dans votre organisation seulement.', 'ok');
    } catch (err) {
      setStatus(`Création refusée : ${err.message || err}`, 'error');
    }
  });

  const intakeInFlight = new Set();
  const motivationInFlight = new Set();
  clientsGroups.addEventListener('click', async (event) => {
    const row = event.target.closest('tr[data-id]');
    if (!row) return;
    const id = row.getAttribute('data-id');

    if (event.target.classList.contains('btn-intake')) {
      if (intakeInFlight.has(id)) return;
      const button = event.target;
      const originalLabel = button.textContent;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Envoi…';
      try {
        await runIntakeInviteButtonAction({
          clientId: id,
          inFlight: intakeInFlight,
          send: () => sendIntakeInvite(id),
          applyResult: applyInviteResult,
          refresh: loadClients,
          setStatus,
          getStatus: () => statusEl.textContent || '',
        });
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
          button.textContent = originalLabel;
        }
      }
      return;
    }

    if (event.target.closest('.btn-intake-report') || event.target.closest('.btn-motivation-report')) {
      return;
    }

    if (event.target.classList.contains('btn-motivation')) {
      if (motivationInFlight.has(id)) return;
      const current = resolveMotivationInviteStatus(motivationInviteRows.get(id));
      let motivationConfirm = '';
      if (current.confirmKind === 'newEvaluation') motivationConfirm = MOTIVATION_RESEND_SUBMITTED_CONFIRMATION;
      else if (current.confirmKind === 'replace') motivationConfirm = MOTIVATION_RESEND_OPENED_CONFIRMATION;
      if (motivationConfirm && !window.confirm(motivationConfirm)) {
        return;
      }
      const button = event.target;
      const originalLabel = button.textContent;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Envoi…';
      try {
        await runIntakeInviteButtonAction({
          clientId: id,
          inFlight: motivationInFlight,
          send: () => sendMotivationInvite(id),
          applyResult: applyInviteResult,
          refresh: loadClients,
          setStatus,
          getStatus: () => statusEl.textContent || '',
        });
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
          button.textContent = originalLabel;
        }
      }
      return;
    }

    if (event.target.classList.contains('btn-delete')) {
      if (!confirm('Supprimer ce client ?')) return;
      try {
        await deleteClient(id);
        await loadClients();
        setStatus('Client supprimé.', 'ok');
      } catch (err) {
        setStatus(`Suppression refusée : ${err.message || err}`, 'error');
      }
      return;
    }

    if (event.target.classList.contains('btn-edit')) {
      const current = clientRows.get(id);
      if (!current) {
        setStatus('Client introuvable. Rechargez le tableau de bord.', 'error');
        return;
      }
      openEditDialog(current);
    }
  });

  editServiceType.addEventListener('change', syncServiceChangeConfirm);

  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.getElementById('edit_client_id').value;
    const fullName = document.getElementById('edit_full_name').value.trim();
    const email = document.getElementById('edit_email').value.trim();
    const notes = document.getElementById('edit_notes').value.trim();
    const originalService = parseServiceType(document.getElementById('edit_original_service').value);
    const nextService = parseServiceType(editServiceType.value);
    if (!fullName) {
      setStatus('Le nom du client est requis.', 'error');
      return;
    }
    if (!nextService) {
      setStatus('Choisissez le service du client.', 'error');
      return;
    }
    if (originalService && originalService !== nextService) {
      if (!editServiceConfirmCheck.checked) {
        editServiceConfirm.classList.remove('hidden');
        setStatus(SERVICE_CHANGE_CONFIRMATION, 'error');
        editServiceConfirmCheck.focus();
        return;
      }
    }
    try {
      await updateClient(id, fullName, email, notes, nextService);
      closeEditDialog();
      await loadClients();
      setStatus('Client mis à jour.', 'ok');
    } catch (err) {
      setStatus(`Modification refusée : ${err.message || err}`, 'error');
    }
  });

  editDialogClose.addEventListener('click', closeEditDialog);
  editCancel.addEventListener('click', closeEditDialog);
  editDialog.addEventListener('click', (event) => {
    if (event.target === editDialog) closeEditDialog();
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      const { clearServerSessionCookie } = await import('./session-cookie.mjs');
      await clearServerSessionCookie();
    } catch {
      // Ignore cookie clear failures and complete the client sign-out.
    }
    clearLoginAutoRedirectGuard(sessionStorage);
    await supabase.auth.signOut();
    redirectClean('./login.html');
  });
}

boot().catch((err) => {
  setStatus(err.message || String(err), 'error');
  console.error(err);
});