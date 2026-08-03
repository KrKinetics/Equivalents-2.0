import { getSupabase } from './supabase-client.js';

const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const statusEl = document.getElementById('status');
const submitBtn = document.getElementById('submit');

function setStatus(message, kind = '') {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
  statusEl.classList.toggle('hidden', !message);
}

async function boot() {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.replace('./dashboard.html');
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
      const redirectTo = new URL('./dashboard.html', window.location.href).href;
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
      setStatus(
        /signups? not allowed|user not found|unable to validate/i.test(msg)
          ? 'Connexion refusée : seuls les utilisateurs invités peuvent se connecter.'
          : `Échec : ${msg}`,
        'error',
      );
    } finally {
      submitBtn.disabled = false;
    }
  });
}

boot().catch((err) => setStatus(err.message || String(err), 'error'));
