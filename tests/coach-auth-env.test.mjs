/**
 * Deterministic coverage for live-env gating used by coach-auth CI.
 * Never prints secrets. Never creates .env.local.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  COACH_IGNORE_ENV_LOCAL,
  hasLiveSupabaseEnv,
  isValidPublishableKey,
  isValidSupabaseUrl,
  loadEnvLocal,
  mergeEnvLocalIntoProcess,
  resolveSupabasePublicEnv,
} from '../scripts/load-env-local.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('missing .env.local loads as empty object without throwing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-env-'));
  assert.deepEqual(loadEnvLocal(tmp), {});
  assert.equal(fs.existsSync(path.join(tmp, '.env.local')), false);
});

test('invalid Supabase vars do not satisfy hasLiveSupabaseEnv', () => {
  assert.equal(hasLiveSupabaseEnv({
    SUPABASE_URL: 'https://not-enough',
    SUPABASE_PUBLISHABLE_KEY: 'short',
  }), false);
  assert.equal(hasLiveSupabaseEnv({
    SUPABASE_URL: 'ftp://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
  }), false);
  assert.equal(isValidSupabaseUrl('https://proj.supabase.co'), true);
  assert.equal(isValidPublishableKey('sb_publishable_ci_fake'), true);
});

test('COACH_IGNORE_ENV_LOCAL prevents reading .env.local for resolve', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-env-ignore-'));
  fs.writeFileSync(
    path.join(tmp, '.env.local'),
    'SUPABASE_URL=https://example.supabase.co\nSUPABASE_PUBLISHABLE_KEY=sb_publishable_tmp_only\n',
    'utf8',
  );
  const prevIgnore = process.env[COACH_IGNORE_ENV_LOCAL];
  const prevUrl = process.env.SUPABASE_URL;
  const prevKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  try {
    process.env[COACH_IGNORE_ENV_LOCAL] = '1';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    assert.deepEqual(loadEnvLocal(tmp), {});
    assert.equal(resolveSupabasePublicEnv(tmp), null);
    assert.equal(hasLiveSupabaseEnv(), false);
  } finally {
    if (prevIgnore === undefined) delete process.env[COACH_IGNORE_ENV_LOCAL];
    else process.env[COACH_IGNORE_ENV_LOCAL] = prevIgnore;
    if (prevUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = prevKey;
  }
});

function spawnCoachAuthSubset(files) {
  const env = { ...process.env, [COACH_IGNORE_ENV_LOCAL]: '1' };
  delete env.SUPABASE_URL;
  delete env.SUPABASE_PUBLISHABLE_KEY;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  // Avoid inheriting the parent node:test IPC context (empty stdout).
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(
    process.execPath,
    ['--test', '--test-reporter=tap', ...files],
    { cwd: root, env, encoding: 'utf8' },
  );
}

test('deterministic coach-auth tests still run without live env', () => {
  const result = spawnCoachAuthSubset([
    'tests/coach-auth-migration.test.mjs',
    'tests/coach-portal-login-password.test.mjs',
  ]);
  const out = `${result.stdout || ''}\n${result.stderr || ''}`;
  assert.equal(result.status, 0, out);
  assert.match(out, /# fail 0/);
  assert.match(out, /# pass [1-9]/);
  assert.doesNotMatch(out, /# skipped [1-9]/);
});

test('live network tests skip cleanly without live env (exit 0)', () => {
  const result = spawnCoachAuthSubset([
    'tests/coach-auth-security.test.mjs',
    'tests/coach-auth-password-live.test.mjs',
    'tests/coach-dossier-persistence-live.test.mjs',
    'tests/coach-workspace-cross-org-live.test.mjs',
  ]);
  const out = `${result.stdout || ''}\n${result.stderr || ''}`;
  assert.equal(result.status, 0, out);
  assert.match(out, /# fail 0/);
  assert.match(out, /# skipped [1-9]/);
  assert.match(out, /live Supabase env unavailable/);
});

test('coach-auth-tests workflow runs npm run test:coach-auth without secrets', () => {
  const yml = fs.readFileSync(path.join(root, '.github/workflows/nutrition-data-tests.yml'), 'utf8');
  const jobMatch = yml.match(/coach-auth-tests:[\s\S]*?(?=\n  [a-z]|\njobs:|$)/);
  assert.ok(jobMatch, 'coach-auth-tests job missing');
  const job = jobMatch[0];
  assert.match(job, /npm run test:coach-auth/);
  assert.doesNotMatch(job, /secrets\.|SERVICE_ROLE|sb_publishable_|eyJ[A-Za-z0-9_-]+\./);
  assert.doesNotMatch(job, /SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|\.env\.local/);
});

test('mergeEnvLocalIntoProcess does not create .env.local', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'coach-env-merge-'));
  mergeEnvLocalIntoProcess(tmp);
  assert.equal(fs.existsSync(path.join(tmp, '.env.local')), false);
});
