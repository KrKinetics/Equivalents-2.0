/**
 * Load KEY=VALUE pairs from gitignored local env files.
 * No dotenv dependency. Never logs secret values.
 */

import fs from 'node:fs';
import path from 'node:path';

export function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadEnvLocal(rootDir) {
  const filePath = path.join(rootDir, '.env.local');
  const out = parseEnvFile(filePath);
  if (!out) {
    throw new Error('.env.local missing — copy .env.example and fill SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY');
  }
  return out;
}

export function requireSupabasePublicEnv(rootDir) {
  const env = loadEnvLocal(rootDir);
  const url = env.SUPABASE_URL || '';
  const key = env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!url.startsWith('https://')) {
    throw new Error('SUPABASE_URL must be set in .env.local and start with https://');
  }
  if (!key.startsWith('sb_publishable_') && !key.startsWith('eyJ')) {
    // Allow legacy anon JWT during transition; prefer sb_publishable_
    throw new Error('SUPABASE_PUBLISHABLE_KEY must be set in .env.local (sb_publishable_…)');
  }
  if (Object.keys(env).some((k) => k.startsWith('NEXT_PUBLIC_SUPABASE_'))) {
    throw new Error('NEXT_PUBLIC_SUPABASE_* variables are not used in this project');
  }
  return { url, publishableKey: key };
}

/** Admin-only. Never pass this key into browser config. */
export function requireSupabaseServiceRoleEnv(rootDir) {
  const env = loadEnvLocal(rootDir);
  const { url } = requireSupabasePublicEnv(rootDir);
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing in .env.local (admin scripts only)');
  }
  if (serviceRoleKey.startsWith('sb_publishable_')) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY looks like a publishable key — refuse to continue');
  }
  return { url, serviceRoleKey };
}

export function coachPasswordsLocalPath(rootDir) {
  return path.join(rootDir, '.coach-passwords.local');
}

/**
 * Local password assignment file (gitignored). Never log values.
 * Expected keys: KR_EMAIL, KR_PASSWORD, ELEVATE_EMAIL, ELEVATE_PASSWORD
 */
export function loadCoachPasswordsLocal(rootDir) {
  const filePath = coachPasswordsLocalPath(rootDir);
  const env = parseEnvFile(filePath);
  if (!env) {
    throw new Error(
      '.coach-passwords.local missing — copy .coach-passwords.example and fill values locally',
    );
  }
  const entries = [
    { org: 'kr-kinetics', email: env.KR_EMAIL || '', password: env.KR_PASSWORD || '' },
    { org: 'elevate-fitness', email: env.ELEVATE_EMAIL || '', password: env.ELEVATE_PASSWORD || '' },
  ];
  for (const row of entries) {
    if (!row.email || !row.password) {
      throw new Error(`.coach-passwords.local incomplete for ${row.org} (email/password required)`);
    }
  }
  return entries;
}
