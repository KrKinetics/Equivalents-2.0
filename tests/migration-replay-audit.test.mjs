import test from 'node:test';
import assert from 'node:assert/strict';
import { auditMigrationReplay, auditFromFile } from '../scripts/ci/migration-replay-audit.mjs';

const observed = Object.freeze({"recorded":22,"tracked":10,"missingStoredSql":2,"nonSqlPlaceholder":0,"recordedWithoutSource":14,"sourceWithoutRecordedVersion":2});
test('known Supabase snapshot is blocked, never represented as ready', () => {
  const r = auditFromFile('docs/security/replay-audit/portal-ledger-2026-11-01.json', 'supabase/migrations');
  assert.equal(r.status, 'BLOCKED');
  for (const [k, value] of Object.entries(observed)) assert.equal(r[k], value, k);
  assert.equal(r.duplicateGitVersions, 0);
  assert.equal(r.sourceSnapshotOutdated, false);
});

test('complete fixture is a preflight candidate but never an authorization', () => {
  const fixture = {
    schema_version: 1,
    recorded: [{ version: '20260101120000', name: 'safe_fixture', state: 'recorded_sql' }],
    source_files: [{ version: '20260101120000', name: '20260101120000_safe_fixture.sql' }],
  };
  const r = auditMigrationReplay(fixture, ['20260101120000_safe_fixture.sql']);
  assert.equal(r.status, 'REPLAY_PREFLIGHT_CANDIDATE');
  assert.match(r.note, /never authorizes/);
});

test('missing or non-SQL remote statements fail closed', () => {
  const fixture = {
    schema_version: 1,
    recorded: [{ version: '20260101120000', name: 'safe_fixture', state: 'missing_sql' }],
    source_files: [{ version: '20260101120000', name: '20260101120000_safe_fixture.sql' }],
  };
  assert.equal(auditMigrationReplay(fixture, ['20260101120000_safe_fixture.sql']).status, 'BLOCKED');
  fixture.recorded[0].state = 'non_sql_placeholder';
  assert.equal(auditMigrationReplay(fixture, ['20260101120000_safe_fixture.sql']).nonSqlPlaceholder, 1);
});

test('Git drift and duplicate migration versions fail closed', () => {
  const fixture = {
    schema_version: 1,
    recorded: [{ version: '20260101120000', name: 'safe_fixture', state: 'recorded_sql' }],
    source_files: [{ version: '20260101120000', name: '20260101120000_safe_fixture.sql' }],
  };
  const r = auditMigrationReplay(fixture, [
    '20260101120000_safe_fixture.sql','20260101120000_second.sql','20260101130000_extra.sql'
  ]);
  assert.equal(r.status, 'BLOCKED');
  assert.equal(r.duplicateGitVersions, 1);
  assert.equal(r.sourceSnapshotOutdated, true);
  assert.equal(r.sourceWithoutRecordedVersion, 1);
});

test('missing or malformed evidence cannot pass', () => {
  assert.throws(() => auditMigrationReplay({}, []), /Invalid/);
  assert.throws(() => auditMigrationReplay({ schema_version: 1 }, []), /Incomplete/);
});
