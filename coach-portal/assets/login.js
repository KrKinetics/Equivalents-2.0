import {
  getPortalSupabase,
  recoverSession,
  redirectClean,
} from './auth-session.js';

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
  // Drop any leftover UI message (e.g. previous "email rate limit exceeded").
  setStatus('');
}

async function boot() {
  clearStaleStatus();
  const supabase = getPortalSupabase();
  const session = await recoverSession(supabase);
  if (session) {
    redirectClean('./dashboard.html');
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    if (!email) {
      setStatus('Entrez votre courriel d’invitation.', 'error');
      return;
    }
    submitBtn.disabled = true;
    setStatus('Envoi du lien magique…');
    try {
      // Root URL keeps auth params; index.html recovers the session.
      const redirectTo = new URL('./', window.location.href).href;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectTo,
        },
      });
      if (error) throw error;
      setStatus('Lien envoyé. Vérifiez votre boîte de courriel (invitation seulement — aucun compte public).', 'ok');
    } catch (err) {
      const msg = err?.message || String(err);
      if (/rate limit/i.test(msg)) {
        setStatus('Limite d’envoi atteinte. Attendez avant de redemander un lien (aucun nouvel envoi automatique).', 'error');
      } else if (/signups? not allowed|user not found|unable to validate/i.test(msg)) {
        setStatus('Connexion refusée : seuls les utilisateurs invités peuvent se connecter.', 'error');
      } else {
        setStatus(`Échec : ${msg}`, 'error');
      }
    } finally {
      submitBtn.disabled = false;
    }
  });
}

boot().catch((err) => setStatus(err.message || String(err), 'error'));
