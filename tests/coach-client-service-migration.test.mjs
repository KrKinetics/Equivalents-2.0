/**
 * Static schema checks for the client service_type staged rollout.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20260814190000_client_service_type.sql',
);
const followupPath = path.join(
  root,
  'supabase/followups/20260814200000_client_service_type_drop_default.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');
const followup = fs.readFileSync(followupPath, 'utf8');
const historical = [
  '20260803120000_coach_auth_organizations.sql',
  '20260803200000_coach_client_dossiers.sql',
  '20260804180000_clients_organization_immutable.sql',
  '20260806111500_client_pre_interview_intake.sql',
  '20260806113000_fix_client_intake_touch_trigger.sql',
];

function policySegment(source, name) {
  const dropRe = new RegExp(`drop policy if exists ${name}\\s+on public\\.client_dossiers;`, 'i');
  const createRe = new RegExp(`create policy ${name}\\s+on public\\.client_dossiers`, 'i');
  const dropMatch = dropRe.exec(source);
  const createMatch = createRe.exec(source);
  return {
    dropIndex: dropMatch ? dropMatch.index : -1,
    createIndex: createMatch ? createMatch.index : -1,
    dropCount: source.match(new RegExp(`drop policy if exists ${name}\\b`, 'gi'))?.length || 0,
    createCount: source.match(new RegExp(`create policy ${name}\\b`, 'gi'))?.length || 0,
  };
}

function policyBody(source, name) {
  const re = new RegExp(
    `create policy ${name}\\s+on public\\.client_dossiers([\\s\\S]*?)(?=drop policy|create policy|$)`,
    'i',
  );
  return re.exec(source)?.[1] || '';
}

test('Stage A backfills nutrition, CHECKs, NOT NULL, and keeps a temporary default', () => {
  assert.match(sql, /add column if not exists service_type text/i);
  assert.match(sql, /update public\.clients\s+set service_type = 'nutrition'\s+where service_type is null/i);
  assert.match(
    sql,
    /clients_service_type_check[\s\S]*check \(service_type in \('nutrition', 'programming', 'complete'\)\)/i,
  );
  assert.match(sql, /alter column service_type set not null/i);
  assert.match(sql, /alter column service_type set default 'nutrition'/i);
  assert.doesNotMatch(sql, /alter column service_type drop default/i);
  assert.doesNotMatch(sql, /create type public\.client_service/i);
});

test('Stage B drop-default is outside migrations/ so automation cannot apply it early', () => {
  assert.match(followup, /alter column service_type drop default/i);
  assert.doesNotMatch(followup, /drop policy/i);
  assert.doesNotMatch(followup, /create policy/i);
  const autoMigrations = fs.readdirSync(path.join(root, 'supabase/migrations'));
  assert.equal(
    autoMigrations.some((name) => /drop_default|service_type_drop/i.test(name)),
    false,
  );
  const executable = sql.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(executable, /alter column service_type drop default/i);
});

test('SELECT/INSERT/UPDATE replace the same policy names; DELETE is untouched', () => {
  const original = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260803200000_coach_client_dossiers.sql'),
    'utf8',
  );
  const intake = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260806111500_client_pre_interview_intake.sql'),
    'utf8',
  );
  assert.match(original, /create policy client_dossiers_select_org/);
  assert.match(original, /create policy client_dossiers_insert_org/);
  assert.match(original, /create policy client_dossiers_update_org/);
  assert.match(original, /create policy client_dossiers_delete_org/);
  assert.match(
    original,
    /create policy client_dossiers_select_org[\s\S]*using \(public\.is_member_of\(organization_id\)\);/,
  );
  assert.match(intake, /drop policy if exists client_dossiers_insert_org/);
  assert.match(intake, /drop policy if exists client_dossiers_update_org/);
  assert.doesNotMatch(intake, /drop policy if exists client_dossiers_select_org/);
  assert.doesNotMatch(intake, /drop policy if exists client_dossiers_delete_org/);

  for (const name of [
    'client_dossiers_select_org',
    'client_dossiers_insert_org',
    'client_dossiers_update_org',
  ]) {
    const segment = policySegment(sql, name);
    assert.equal(segment.dropCount, 1, `${name} must be dropped once`);
    assert.equal(segment.createCount, 1, `${name} must be recreated once`);
    assert.ok(segment.dropIndex >= 0, `${name} drop missing`);
    assert.ok(segment.createIndex > segment.dropIndex, `${name} must drop before create`);
    const body = policyBody(sql, name);
    assert.match(body, /service_type in \('nutrition', 'complete'\)/);
    assert.match(body, /is_member_of\(client_dossiers\.organization_id\)/);
    assert.match(body, /c\.is_fictional = true/);
    assert.doesNotMatch(body, /using \(\s*public\.is_member_of\(organization_id\)\s*\)\s*;/);
    assert.doesNotMatch(
      body,
      /exists \(\s*select 1\s*from public\.clients c\s*where c\.id = client_dossiers\.client_id[\s\S]*c\.is_fictional = true\s*\)\s*\)\s*;/,
    );
  }

  const selectBody = policyBody(sql, 'client_dossiers_select_org');
  assert.match(selectBody, /for select/);
  assert.match(selectBody, /using \(/);
  assert.doesNotMatch(selectBody, /with check/);

  const insertBody = policyBody(sql, 'client_dossiers_insert_org');
  assert.match(insertBody, /for insert/);
  assert.match(insertBody, /with check \(/);

  const updateBody = policyBody(sql, 'client_dossiers_update_org');
  assert.match(updateBody, /for update/);
  assert.match(updateBody, /using \(/);
  assert.match(updateBody, /with check \(/);

  assert.doesNotMatch(sql, /drop policy if exists client_dossiers_delete_org/i);
  assert.doesNotMatch(sql, /create policy client_dossiers_delete_org/i);
  const extraPolicies = sql.match(/create policy client_dossiers_\w+/gi) || [];
  assert.deepEqual(
    extraPolicies.map((row) => row.toLowerCase()),
    [
      'create policy client_dossiers_select_org',
      'create policy client_dossiers_insert_org',
      'create policy client_dossiers_update_org',
    ],
  );
});

test('historical migrations are not rewritten by this feature', () => {
  for (const file of historical) {
    const previous = fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8');
    assert.doesNotMatch(previous, /\bservice_type\b/);
  }
});
