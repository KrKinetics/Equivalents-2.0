import {
  bindServerSessionCookieSync,
  getPortalSupabase,
  recoverSession,
  redirectClean,
} from './auth-session.js';
import {
  DEFAULT_PORTAL_ORIGIN,
  MAGIC_LINK_UNIFORM_MESSAGE,
  readPublicSupabaseConfig,
  requestMagicLink,
  resolveEmailRedirectTo,
} from './login-otp.mjs';
import {
  PASSWORD_SUCCESS_MESSAGE,
  formatPasswordLoginFailure,
  signInWithPassword,
} from './login-password.mjs';
import { syncServerSessionCookie } from './session-cookie.mjs';
import {
  beginLoginAutoRedirect,
  clearLoginAutoRedirectGuard,
  resolveSafeNextPath,
  shouldAutoRedirectAfterSessionRecover,
} from './login-redirect.mjs';

const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const passwordBlock = document.getElementById('password-block');
const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submit');
const modePasswordBtn = document.getElementById('mode-password');
const modeMagicBtn = document.getElementById('mode-magic');

let authMode = 'password';

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

function applyMode(mode) {
  authMode = mode === 'magic' ? 'magic' : 'password';
  form.dataset.mode = authMode;

  const isPassword = authMode === 'password';
  modePasswordBtn.classList.toggle('is-active', isPassword);
  modeMagicBtn.classList.toggle('is-active', !isPassword);
  modePasswordBtn.setAttribute('aria-selected', isPassword ? 'true' : 'false');
  modeMagicBtn.setAttribute('aria-selected', isPassword ? 'false' : 'true');

  passwordBlock.classList.toggle('hidden', !isPassword);
  passwordInput.required = isPassword;
  if (!isPassword) {
    passwordInput.value = '';
  }

  submitBtn.textContent = isPassword ? 'Se connecter' : 'Recevoir un lien magique';
  clearStaleStatus();
}

function missingConfigMessage() {
  return 'Configuration locale absente. Démarrez le portail avec npm run coach:portal (config.js).';
}

function safeNextPath() {
  return resolveSafeNextPath(window.location.search);
}

/**
 * Navigate away from login only when the HttpOnly cookie sync succeeded and
 * we are not already bouncing login ↔ protected page.
 * Auth events (INITIAL_SESSION / TOKEN_REFRESHED / SIGNED_OUT) never navigate.
 */
async function redirectAfterAuthenticatedSession(session, { clearGuardFirst = false } = {}) {
  if (!session?.access_token) return false;
  const cookieSynced = await syncServerSessionCookie(session);
  if (clearGuardFirst) clearLoginAutoRedirectGuard(sessionStorage);
  const allowRedirect = beginLoginAutoRedirect(sessionStorage);
  if (!shouldAutoRedirectAfterSessionRecover({
    hasSession: true,
    cookieSynced,
    allowRedirect,
  })) {
    if (!cookieSynced) {
      setStatus(
        'Session navigateur détectée, mais le cookie serveur est indisponible. Reconnectez-vous.',
        'error',
      );
    } else if (!allowRedirect) {
      setStatus(
        'Redirection interrompue pour éviter une boucle. Reconnectez-vous ou rechargez la page.',
        'error',
      );
    }
    return false;
  }
  redirectClean(safeNextPath());
  return true;
}

function showCaughtError(err, formatter) {
  const formatted = formatter(err);
  if (formatted.kind === 'config') {
    setStatus(formatted.message, 'error');
    return;
  }
  if (err?.name === 'TypeError' || /Failed to fetch|NetworkError|import/i.test(err?.message || '')) {
    setStatus(`Erreur JavaScript : ${err?.message || String(err)}`, 'error');
    return;
  }
  setStatus(formatted.message, 'error');
}

async function handlePasswordLogin(supabase, email) {
  const password = passwordInput.value;
  if (!password) {
    setStatus('Entrez votre mot de passe.', 'error');
    return;
  }
  setStatus('Connexion…');
  const session = await signInWithPassword(supabase, email, password);
  if (!session) {
    setStatus('Identifiants invalides. Vérifiez le courriel et le mot de passe.', 'error');
    return;
  }
  setStatus(PASSWORD_SUCCESS_MESSAGE, 'ok');
  // On failure, redirectAfterAuthenticatedSession sets a stable error (no reload).
  await redirectAfterAuthenticatedSession(session, { clearGuardFirst: true });
}

async function handleMagicLink(supabase, email) {
  // Anti-enumeration: always show the same success copy (invited, unknown, rate-limit, provider errors).
  setStatus('Envoi du lien magique…');
  const redirectTo = resolveEmailRedirectTo(window.location.href) || DEFAULT_PORTAL_ORIGIN;
  try {
    await requestMagicLink(supabase, email, redirectTo);
  } catch {
    // Swallow all provider outcomes for Magic Link UX uniformity.
  }
  setStatus(MAGIC_LINK_UNIFORM_MESSAGE, 'ok');
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
    setStatus(missingConfigMessage(), 'error');
    return;
  }

  submitBtn.disabled = true;
  try {
    const supabase = getPortalSupabase();
    if (authMode === 'password') {
      await handlePasswordLogin(supabase, email);
    } else {
      await handleMagicLink(supabase, email);
    }
  } catch (err) {
    if (authMode === 'magic') {
      // Defense in depth: Magic Link never surfaces distinct provider outcomes.
      setStatus(MAGIC_LINK_UNIFORM_MESSAGE, 'ok');
    } else {
      showCaughtError(err, formatPasswordLoginFailure);
    }
  } finally {
    submitBtn.disabled = false;
  }
}

async function boot() {
  clearStaleStatus();
  applyMode('password');

  modePasswordBtn.addEventListener('click', () => applyMode('password'));
  modeMagicBtn.addEventListener('click', () => applyMode('magic'));

  const cfg = readPublicSupabaseConfig(window);
  if (!cfg.ok) {
    setStatus(missingConfigMessage(), 'error');
    form.addEventListener('submit', onSubmit);
    markFormReady();
    return;
  }

  form.addEventListener('submit', onSubmit);
  markFormReady();

  try {
    const supabase = getPortalSupabase();
    bindServerSessionCookieSync(supabase);
    // recoverSession may sync the cookie; redirect still re-checks sync + loop guard.
    const session = await recoverSession(supabase);
    if (session) {
      await redirectAfterAuthenticatedSession(session);
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
