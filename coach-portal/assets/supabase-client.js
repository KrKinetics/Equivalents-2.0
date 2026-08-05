/**
 * Browser Supabase client for the Coach portal.
 * Expects window.COACH_SUPABASE = { url, publishableKey } from /config.js
 * Uses a same-origin vendored bundle (no esm.sh) for enforced CSP.
 */
import { createClient } from './vendor/supabase-bundle.mjs';

function requireConfig() {
  const cfg = window.COACH_SUPABASE;
  if (!cfg?.url || !cfg?.publishableKey) {
    throw new Error('Missing COACH_SUPABASE config. Start the portal with npm run coach:portal');
  }
  if (cfg.url.startsWith('http://') && !cfg.url.includes('127.0.0.1') && !cfg.url.includes('localhost')) {
    throw new Error('SUPABASE_URL must use https://');
  }
  // Pass both values into createClient; never log them.
  return { url: cfg.url, publishableKey: cfg.publishableKey };
}

let clientSingleton = null;

/** One browser client per page — avoids duplicate onAuthStateChange / refresh loops. */
export function getSupabase() {
  if (clientSingleton) return clientSingleton;
  const cfg = requireConfig();
  clientSingleton = createClient(cfg.url, cfg.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });
  return clientSingleton;
}
