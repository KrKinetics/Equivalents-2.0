/**
 * Admin-only: set initial passwords for invited coach users via updateUserById.
 *
 * - Runs locally (Node), never in the browser
 * - Reads SUPABASE_SERVICE_ROLE_KEY from gitignored .env.local
 * - Reads emails/passwords from gitignored .coach-passwords.local
 * - Never prints passwords, tokens, or service_role
 *
 * Usage:
 *   node scripts/coach-set-user-passwords.mjs           # dry-run (default)
 *   node scripts/coach-set-user-passwords.mjs --apply   # perform updates
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  coachPasswordsLocalPath,
  loadCoachPasswordsLocal,
  requireSupabaseServiceRoleEnv,
} from './load-env-local.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');

function maskEmail(email) {
  const [user, domain] = String(email).split('@');
  if (!domain) return '(invalid-email)';
  const head = user.slice(0, 2);
  return `${head}…@${domain}`;
}

async function findUserIdByEmail(admin, email) {
  // Prefer getUserByEmail when available; fall back to paginated listUsers.
  if (typeof admin.auth.admin.getUserByEmail === 'function') {
    const { data, error } = await admin.auth.admin.getUserByEmail(email);
    if (error) throw error;
    return data?.user?.id ?? null;
  }

  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (users.length < perPage) return null;
    page += 1;
    if (page > 50) return null;
  }
}

async function main() {
  const { url, serviceRoleKey } = requireSupabaseServiceRoleEnv(root);
  const entries = loadCoachPasswordsLocal(root);

  console.log('Coach password assignment (admin local script)');
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN (no changes)'}`);
  console.log(`Passwords file: ${path.basename(coachPasswordsLocalPath(root))} (values not printed)`);
  console.log(`Supabase URL host present: ${Boolean(url)}`);
  console.log(`Service role key loaded: ${Boolean(serviceRoleKey)} (value not printed)`);
  console.log(`Users to process: ${entries.length}`);

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const row of entries) {
    const label = `${row.org} <${maskEmail(row.email)}>`;
    const userId = await findUserIdByEmail(admin, row.email);
    if (!userId) {
      console.error(`FAIL: no invited user found for ${label}`);
      process.exitCode = 1;
      continue;
    }
    if (!apply) {
      console.log(`DRY-RUN: would updateUserById for ${label}`);
      continue;
    }
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: row.password,
    });
    if (error) {
      console.error(`FAIL: updateUserById for ${label}: ${error.message}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`OK: password set for ${label}`);
  }

  if (!apply) {
    console.log('No passwords were changed. Re-run with --apply when ready.');
  }
}

main().catch((err) => {
  console.error(`Admin script failed: ${err.message || err}`);
  process.exit(1);
});
