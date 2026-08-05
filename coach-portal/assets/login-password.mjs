/**
 * Email/password login helpers (Node-testable; never logs secrets).
 * Anti-enumeration: unknown account and wrong password share one public message.
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

/** Uniform failure copy — does not distinguish unknown vs wrong password. */
export const PASSWORD_AUTH_FAILURE_MESSAGE =
  'Connexion impossible. Vérifiez vos identifiants ou contactez l’administrateur.';

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
    // Same public copy as invalid credentials (anti-enumeration).
    return {
      kind: 'unconfirmed',
      message: PASSWORD_AUTH_FAILURE_MESSAGE,
    };
  }
  if (
    /invalid login credentials|invalid credentials|wrong password|invalid email or password/i.test(msg)
    || (status === 400 && /invalid|credentials|password/i.test(msg))
    || /signups? not allowed|user not found|unable to validate|not authorized|forbidden/i.test(msg)
  ) {
    return {
      kind: 'invalid',
      message: PASSWORD_AUTH_FAILURE_MESSAGE,
    };
  }
  // Never echo raw provider messages to the UI.
  return {
    kind: 'unexpected',
    message: PASSWORD_AUTH_FAILURE_MESSAGE,
  };
}

export const PASSWORD_SUCCESS_MESSAGE = 'Connexion réussie. Redirection…';
