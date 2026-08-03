/**
 * Magic-link OTP helpers (Node-testable; never logs keys/tokens).
 */

export const DEFAULT_PORTAL_ORIGIN = 'http://127.0.0.1:4190/';

export function resolveEmailRedirectTo(locationHref) {
  return new URL('./', locationHref).href;
}

export function buildSignInWithOtpPayload(email, emailRedirectTo = DEFAULT_PORTAL_ORIGIN) {
  return {
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo,
    },
  };
}

export function readPublicSupabaseConfig(globalObj) {
  const cfg = globalObj?.COACH_SUPABASE;
  const url = cfg?.url || '';
  const publishableKey = cfg?.publishableKey || '';
  if (!url || !publishableKey) {
    return { ok: false, reason: 'missing_config' };
  }
  return { ok: true, url, publishableKey };
}

export function formatLoginFailure(err) {
  const msg = err?.message || String(err);
  if (/Missing COACH_SUPABASE|missing_config|Start the portal/i.test(msg)) {
    return {
      kind: 'config',
      message: 'Configuration locale absente. Démarrez le portail avec npm run coach:portal (config.js).',
    };
  }
  if (/rate limit/i.test(msg)) {
    return {
      kind: 'supabase',
      message: 'Limite d’envoi atteinte. Attendez avant de redemander un lien (aucun nouvel envoi automatique).',
    };
  }
  if (/signups? not allowed|user not found|unable to validate/i.test(msg)) {
    return {
      kind: 'supabase',
      message: 'Connexion refusée : seuls les utilisateurs invités peuvent se connecter.',
    };
  }
  return { kind: 'supabase', message: `Erreur Supabase : ${msg}` };
}

/**
 * Call signInWithOtp once. Does not send email when supabase is mocked.
 */
export async function requestMagicLink(supabase, email, emailRedirectTo = DEFAULT_PORTAL_ORIGIN) {
  if (!supabase?.auth?.signInWithOtp) {
    throw new Error('Client Supabase invalide : signInWithOtp indisponible');
  }
  const payload = buildSignInWithOtpPayload(email, emailRedirectTo);
  const { data, error } = await supabase.auth.signInWithOtp(payload);
  if (error) throw error;
  return data ?? null;
}
