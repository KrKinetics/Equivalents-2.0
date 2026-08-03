/**
 * Email/password login helpers (Node-testable; never logs secrets).
 */

export function buildSignInWithPasswordPayload(email, password) {
  return { email, password };
}

/**
 * Call signInWithPassword once. Safe with a mocked client (no network).
 */
export async function signInWithPassword(supabase, email, password) {
  if (!supabase?.auth?.signInWithPassword) {
    throw new Error('Client Supabase invalide : signInWithPassword indisponible');
  }
  const payload = buildSignInWithPasswordPayload(email, password);
  const { data, error } = await supabase.auth.signInWithPassword(payload);
  if (error) throw error;
  return data?.session ?? null;
}

export function formatPasswordLoginFailure(err) {
  const msg = err?.message || String(err);
  const status = err?.status ?? err?.statusCode;

  if (/Missing COACH_SUPABASE|missing_config|Start the portal/i.test(msg)) {
    return {
      kind: 'config',
      message: 'Configuration locale absente. Démarrez le portail avec npm run coach:portal (config.js).',
    };
  }
  if (/email not confirmed|not confirmed/i.test(msg)) {
    return {
      kind: 'unconfirmed',
      message: 'Compte non confirmé. Utilisez d’abord le lien d’invitation ou un Magic Link, puis réessayez.',
    };
  }
  if (
    /invalid login credentials|invalid credentials|wrong password|invalid email or password/i.test(msg)
    || (status === 400 && /invalid|credentials|password/i.test(msg))
  ) {
    return {
      kind: 'invalid',
      message: 'Identifiants invalides. Vérifiez le courriel et le mot de passe.',
    };
  }
  if (/signups? not allowed|user not found|unable to validate|not authorized|forbidden/i.test(msg)) {
    return {
      kind: 'unauthorized',
      message: 'Compte non autorisé. Seuls les utilisateurs invités peuvent se connecter.',
    };
  }
  return {
    kind: 'unexpected',
    message: `Erreur inattendue : ${msg}`,
  };
}

export const PASSWORD_SUCCESS_MESSAGE = 'Connexion réussie. Redirection…';
