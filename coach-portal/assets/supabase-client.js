/**
 * Browser Supabase client for the Coach portal.
 * Expects window.COACH_SUPABASE = { url, publishableKey } from /config.js
 * (injected by npm run coach:portal — never read .env.local in the browser).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

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
