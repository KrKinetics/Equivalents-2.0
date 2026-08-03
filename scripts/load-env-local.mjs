/**
 * Load KEY=VALUE pairs from .env.local (gitignored).
 * No dotenv dependency. Never logs secret values.
 */

import fs from 'node:fs';
import path from 'node:path';

export function loadEnvLocal(rootDir) {
  const filePath = path.join(rootDir, '.env.local');
  if (!fs.existsSync(filePath)) {
    throw new Error('.env.local missing — copy .env.example and fill SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY');
  }
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
