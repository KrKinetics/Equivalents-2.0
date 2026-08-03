import { getSupabase } from './supabase-client.js';

const statusEl = document.getElementById('status');
const metaEl = document.getElementById('session-meta');
const clientsBody = document.getElementById('clients-body');
const createForm = document.getElementById('create-form');
const logoutBtn = document.getElementById('logout');

let supabase;
let membership = null;

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

async function requireSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.replace('./login.html');
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

async function loadClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('id, full_name, notes, organization_id, is_fictional, created_at')
    .eq('organization_id', membership.organizationId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!data?.length) {
    clientsBody.innerHTML = '<tr><td colspan="3" class="empty">Aucun client fictif pour cette organisation.</td></tr>';
    return;
  }
  clientsBody.innerHTML = data.map((row) => `
    <tr data-id="${escapeHtml(row.id)}">
      <td>${escapeHtml(row.full_name)}</td>
      <td>${escapeHtml(row.notes || '')}</td>
      <td class="row">
        <button type="button" class="secondary btn-edit">Modifier</button>
        <button type="button" class="danger btn-delete">Supprimer</button>
      </td>
    </tr>
  `).join('');
}

async function createClient(fullName, notes) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('clients').insert({
    organization_id: membership.organizationId,
    created_by: user.id,
    full_name: fullName,
    notes: notes || '',
    is_fictional: true,
  });
  if (error) throw error;
}

async function updateClient(id, fullName, notes) {
  const { error } = await supabase
    .from('clients')
    .update({ full_name: fullName, notes, updated_at: new Date().toISOString() })
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

async function boot() {
  supabase = getSupabase();
  const session = await requireSession();
  if (!session) return;

  membership = await loadMembership(session.user.id);
  renderMeta(session, membership);
  await loadClients();
  setStatus('Session active — isolation RLS par organisation.', 'ok');

  createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fullName = document.getElementById('full_name').value.trim();
    const notes = document.getElementById('notes').value.trim();
    if (!fullName) {
      setStatus('Le nom du client est requis.', 'error');
      return;
    }
    try {
      await createClient(fullName, notes);
      createForm.reset();
      await loadClients();
      setStatus('Client fictif créé dans votre organisation seulement.', 'ok');
    } catch (err) {
      setStatus(`Création refusée : ${err.message || err}`, 'error');
    }
  });

  clientsBody.addEventListener('click', async (event) => {
    const row = event.target.closest('tr[data-id]');
    if (!row) return;
    const id = row.getAttribute('data-id');
    if (event.target.classList.contains('btn-delete')) {
      if (!confirm('Supprimer ce client fictif ?')) return;
      try {
        await deleteClient(id);
        await loadClients();
        setStatus('Client fictif supprimé.', 'ok');
      } catch (err) {
        setStatus(`Suppression refusée : ${err.message || err}`, 'error');
      }
      return;
    }
    if (event.target.classList.contains('btn-edit')) {
      const currentName = row.children[0].textContent;
      const currentNotes = row.children[1].textContent;
      const fullName = prompt('Nom du client fictif :', currentName);
      if (fullName == null) return;
      const notes = prompt('Notes :', currentNotes);
      if (notes == null) return;
      try {
        await updateClient(id, fullName.trim(), notes.trim());
        await loadClients();
        setStatus('Client fictif mis à jour.', 'ok');
      } catch (err) {
        setStatus(`Modification refusée : ${err.message || err}`, 'error');
      }
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.replace('./login.html');
  });
}

boot().catch((err) => {
  setStatus(err.message || String(err), 'error');
  console.error(err);
});
