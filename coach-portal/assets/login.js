import {
  getPortalSupabase,
  recoverSession,
  redirectClean,
} from './auth-session.js';
import {
  DEFAULT_PORTAL_ORIGIN,
  formatLoginFailure,
  readPublicSupabaseConfig,
  requestMagicLink,
  resolveEmailRedirectTo,
} from './login-otp.mjs';

const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submit');

function setStatus(message, kind = '') {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
  statusEl.classList.toggle('hidden', !message);
}

function clearStaleStatus() {
  setStatus('');
}

function markFormReady() {
  form.dataset.authReady = 'true';
  submitBtn.disabled = false;
}

async function onSubmit(event) {
  event.preventDefault();
  const email = emailInput.value.trim();
  if (!email) {
    setStatus('Entrez votre courriel d’invitation.', 'error');
    return;
  }

  const cfg = readPublicSupabaseConfig(window);
  if (!cfg.ok) {
    setStatus(
      'Configuration locale absente. Démarrez le portail avec npm run coach:portal (config.js).',
      'error',
    );
    return;
  }

  submitBtn.disabled = true;
  setStatus('Envoi du lien magique…');
  try {
    const supabase = getPortalSupabase();
    const redirectTo = resolveEmailRedirectTo(window.location.href) || DEFAULT_PORTAL_ORIGIN;
    await requestMagicLink(supabase, email, redirectTo);
    setStatus(
      'Demande envoyée. Vérifiez votre boîte de courriel (invitation seulement — aucun compte public).',
      'ok',
    );
  } catch (err) {
    const formatted = formatLoginFailure(err);
    if (formatted.kind === 'config') {
      setStatus(formatted.message, 'error');
    } else if (err?.name === 'TypeError' || /Failed to fetch|NetworkError|import/i.test(err?.message || '')) {
      setStatus(`Erreur JavaScript : ${err?.message || String(err)}`, 'error');
    } else {
      setStatus(formatted.message, 'error');
    }
  } finally {
    submitBtn.disabled = false;
  }
}

async function boot() {
  clearStaleStatus();

  const cfg = readPublicSupabaseConfig(window);
  if (!cfg.ok) {
    setStatus(
      'Configuration locale absente. Démarrez le portail avec npm run coach:portal (config.js).',
      'error',
    );
    form.addEventListener('submit', onSubmit);
    markFormReady();
    return;
  }

  // Attach submit before session recovery so OTP never depends on recoverSession.
  form.addEventListener('submit', onSubmit);
  markFormReady();

  try {
    const supabase = getPortalSupabase();
    const session = await recoverSession(supabase);
    if (session) {
      redirectClean('./dashboard.html');
    }
  } catch (err) {
    setStatus(`Erreur JavaScript : ${err?.message || String(err)}`, 'error');
  }
}

boot().catch((err) => {
  setStatus(`Erreur JavaScript : ${err?.message || String(err)}`, 'error');
  try {
    form.addEventListener('submit', onSubmit);
    markFormReady();
  } catch {
    // ignore
  }
});
