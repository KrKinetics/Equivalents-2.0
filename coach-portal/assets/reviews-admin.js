import {
  bindServerSessionCookieSync,
  getPortalSupabase,
  recoverSession,
  redirectClean,
  redirectPreservingAuthParams,
} from './auth-session.js';
import { clearLoginAutoRedirectGuard } from './login-redirect.mjs';

const MASTER_USER_ID = '14376851-b293-49a3-b0cb-d97117b2a27f';
const listEl = document.getElementById('reviews-list');
const statusEl = document.getElementById('status');
const logoutBtn = document.getElementById('logout');
let reviews = [];
let filter = 'pending';
let supabase;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function setStatus(message, kind = '') {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
  statusEl.classList.toggle('hidden', !message);
}
function render() {
  const rows = filter === 'all' ? reviews : reviews.filter((row) => row.status === filter);
  if (!rows.length) {
    listEl.innerHTML = '<section class="card"><p class="empty">Aucun avis dans cette catégorie.</p></section>';
    return;
  }
  listEl.innerHTML = rows.map((row) => `
    <article class="card review-admin-card" data-id="${escapeHtml(row.id)}">
      <div class="row dash-header">
        <div>
          <h2 class="card-title">${escapeHtml(row.first_name)} ${escapeHtml(row.last_initial)}. — ${Number(row.rating)}/5</h2>
          <p>${escapeHtml(row.service)} · ${escapeHtml(row.locale.toUpperCase())} · ${escapeHtml(new Date(row.created_at).toLocaleString('fr-CA'))}</p>
        </div>
        <strong>${escapeHtml(row.status)}</strong>
      </div>
      <p><strong>Courriel privé :</strong> ${escapeHtml(row.email || '—')}</p>
      <label>Prénom<input name="firstName" maxlength="60" value="${escapeHtml(row.first_name)}"></label>
      <label>Initiale<input name="lastInitial" maxlength="2" value="${escapeHtml(row.last_initial)}"></label>
      <label>Objectif<input name="goal" maxlength="80" value="${escapeHtml(row.goal || '')}"></label>
      <label>Note<select name="rating">${[1,2,3,4,5].map((n) => `<option value="${n}"${n === Number(row.rating) ? ' selected' : ''}>${n}/5</option>`).join('')}</select></label>
      <label>Commentaire<textarea name="comment" rows="7" maxlength="1000">${escapeHtml(row.comment)}</textarea></label>
      <label>Note interne<textarea name="moderationNote" rows="2" maxlength="1000">${escapeHtml(row.moderation_note || '')}</textarea></label>
      <label class="row"><input type="checkbox" name="featured" ${row.featured ? 'checked' : ''}> Mettre en vedette</label>
      <div class="row">
        <button type="button" data-action="approved">Approuver / enregistrer</button>
        <button type="button" class="danger" data-action="rejected">Refuser</button>
        ${row.status !== 'pending' ? '<button type="button" class="secondary" data-action="pending">Remettre en attente</button>' : ''}
      </div>
    </article>
  `).join('');
}
async function loadReviews() {
  const response = await fetch('/api/coach-reviews', { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (response.status === 401) {
    redirectPreservingAuthParams('./login.html?next=/reviews.html');
    return;
  }
  if (response.status === 403) throw new Error('Accès réservé au compte maître KR Kinetics.');
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload.reviews)) throw new Error('Impossible de charger les avis.');
  reviews = payload.reviews;
  render();
}
async function updateReview(card, nextStatus) {
  const id = card.dataset.id;
  const body = {
    id,
    status: nextStatus,
    firstName: card.querySelector('[name="firstName"]').value,
    lastInitial: card.querySelector('[name="lastInitial"]').value,
    goal: card.querySelector('[name="goal"]').value,
    rating: Number(card.querySelector('[name="rating"]').value),
    comment: card.querySelector('[name="comment"]').value,
    moderationNote: card.querySelector('[name="moderationNote"]').value,
    featured: card.querySelector('[name="featured"]').checked,
  };
  const response = await fetch('/api/coach-reviews', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error('La mise à jour a été refusée.');
  setStatus(nextStatus === 'approved' ? 'Avis publié sur le site.' : 'Décision enregistrée.', 'ok');
  await loadReviews();
}
async function boot() {
  supabase = getPortalSupabase();
  bindServerSessionCookieSync(supabase);
  const session = await recoverSession(supabase);
  if (!session) {
    redirectPreservingAuthParams('./login.html?next=/reviews.html');
    return;
  }
  clearLoginAutoRedirectGuard(sessionStorage);
  if (session.user.id !== MASTER_USER_ID) throw new Error('Accès réservé au compte maître KR Kinetics.');
  await loadReviews();

  document.addEventListener('click', async (event) => {
    const filterButton = event.target.closest('[data-filter]');
    if (filterButton) {
      filter = filterButton.dataset.filter;
      render();
      return;
    }
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const card = actionButton.closest('[data-id]');
    actionButton.disabled = true;
    try {
      await updateReview(card, actionButton.dataset.action);
    } catch (error) {
      setStatus(error.message || String(error), 'error');
    } finally {
      actionButton.disabled = false;
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      const { clearServerSessionCookie } = await import('./session-cookie.mjs');
      await clearServerSessionCookie();
    } catch {}
    clearLoginAutoRedirectGuard(sessionStorage);
    await supabase.auth.signOut();
    redirectClean('./login.html');
  });
}

boot().catch((error) => {
  listEl.innerHTML = '';
  setStatus(error.message || String(error), 'error');
});
