/**
 * Load KEY=VALUE pairs from gitignored local env files.
 * No dotenv dependency. Never logs secret values.
 */

import fs from 'node:fs';
import path from 'node:path';

/** When set to "1"/"true", .env.local is not read (CI / CI-simulation). */
export const COACH_IGNORE_ENV_LOCAL = 'COACH_IGNORE_ENV_LOCAL';

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

function shouldIgnoreEnvLocalFile() {
  const flag = process.env[COACH_IGNORE_ENV_LOCAL];
  return flag === '1' || flag === 'true';
}

/**
 * Read .env.local when present. Missing file → {}. Never creates the file.
 * Never considers or requires SUPABASE_SERVICE_ROLE_KEY.
 */
export function loadEnvLocal(rootDir) {
  if (shouldIgnoreEnvLocalFile()) return {};
  const filePath = path.join(rootDir, '.env.local');
  return parseEnvFile(filePath) || {};
}

/**
 * Merge .env.local into process.env for unset/empty keys only.
 */
export function mergeEnvLocalIntoProcess(rootDir) {
  const file = loadEnvLocal(rootDir);
  for (const [key, value] of Object.entries(file)) {
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
  return file;
}

export function isValidSupabaseUrl(url) {
  return typeof url === 'string' && /^https:\/\/\S+$/.test(url.trim());
}

export function isValidPublishableKey(key) {
  if (typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (!trimmed) return false;
  // Allow legacy anon JWT during transition; prefer sb_publishable_
  return trimmed.startsWith('sb_publishable_') || trimmed.startsWith('eyJ');
}

/**
 * Live network tests gate. Never uses SUPABASE_SERVICE_ROLE_KEY.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function hasLiveSupabaseEnv(env = process.env) {
  return isValidSupabaseUrl(env.SUPABASE_URL || '')
    && isValidPublishableKey(env.SUPABASE_PUBLISHABLE_KEY || '');
}

/**
 * Resolve public Supabase credentials from process.env + optional .env.local.
 * Returns null when live env is unavailable (no throw).
 */
export function resolveSupabasePublicEnv(rootDir) {
  const file = mergeEnvLocalIntoProcess(rootDir);
  if (Object.keys(file).some((k) => k.startsWith('NEXT_PUBLIC_SUPABASE_'))) {
    throw new Error('NEXT_PUBLIC_SUPABASE_* variables are not used in this project');
  }
  if (Object.keys(process.env).some((k) => k.startsWith('NEXT_PUBLIC_SUPABASE_'))) {
    throw new Error('NEXT_PUBLIC_SUPABASE_* variables are not used in this project');
  }
  if (!hasLiveSupabaseEnv()) return null;
  return {
    url: String(process.env.SUPABASE_URL).trim(),
    publishableKey: String(process.env.SUPABASE_PUBLISHABLE_KEY).trim(),
  };
}

/**
 * For preview/admin scripts that must have live credentials.
 */
export function requireSupabasePublicEnv(rootDir) {
  const resolved = resolveSupabasePublicEnv(rootDir);
  if (!resolved) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set (via .env.local or environment) with a valid https URL and publishable key',
    );
  }
  return resolved;
}

/**
 * Skip helper for tests that hit the real Supabase project.
 * @returns {boolean} true when the test was skipped
 */
export function skipWithoutLiveSupabase(t, rootDir) {
  mergeEnvLocalIntoProcess(rootDir);
  if (!hasLiveSupabaseEnv()) {
    t.skip('live Supabase env unavailable');
    return true;
  }
  return false;
}

/** Admin-only. Never pass this key into browser config. */
export function requireSupabaseServiceRoleEnv(rootDir) {
  const env = mergeEnvLocalIntoProcess(rootDir);
  const { url } = requireSupabasePublicEnv(rootDir);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
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
