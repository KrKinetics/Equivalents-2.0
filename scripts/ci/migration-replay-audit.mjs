// Read-only migration replay preflight. No Supabase credentials or SQL execution.
// Historic ledgers must not be edited to make this report green.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIGRATION_RE = /^(\d{14})_[A-Za-z0-9_.-]+\.sql$/;

export function auditMigrationReplay(snapshot, filenames) {
  if (!snapshot || snapshot.schema_version !== 1 || !Array.isArray(filenames)) {
    throw new TypeError('Invalid sanitized migration evidence');
  }
  const sql = filenames.filter((name) => MIGRATION_RE.test(name));
  const versions = sql.map((name) => name.slice(0, 14));
  const unique = new Set(versions);
  const duplicates = versions.filter((v, i) => versions.indexOf(v) !== i);
  let missingGit = [];
  let unrecordedGit = [];
  let missingBodies = 0;
  let placeholders = 0;
  let metadataMismatch = false;

  if (Array.isArray(snapshot.recorded) && Array.isArray(snapshot.source_files)) {
    const recorded = snapshot.recorded;
    const rv = new Set(recorded.map((m) => m.version));
    missingGit = recorded.filter((m) => !unique.has(m.version)).map((m) => m.version);
    unrecordedGit = versions.filter((v) => !rv.has(v));
    missingBodies = recorded.filter((m) => m.state === 'missing_sql').length;
    placeholders = recorded.filter((m) => m.state === 'non_sql_placeholder').length;
    const expectedNames = snapshot.source_files.map((m) => m.name).sort();
    metadataMismatch = expectedNames.join('\n') !== sql.slice().sort().join('\n');
  } else {
    if (!Number.isSafeInteger(snapshot.recorded_total) ||
        !Number.isSafeInteger(snapshot.git_migration_file_count) ||
        !Number.isSafeInteger(snapshot.recorded_versions_missing_from_git) ||
        !Number.isSafeInteger(snapshot.git_versions_not_in_recorded_history) ||
        !Number.isSafeInteger(snapshot.recorded_empty_sql_count) ||
        !Number.isSafeInteger(snapshot.recorded_non_sql_placeholder_count)) {
      throw new TypeError('Incomplete aggregate migration evidence');
    }
    missingGit = Array(snapshot.recorded_versions_missing_from_git).fill('redacted');
    unrecordedGit = Array(snapshot.git_versions_not_in_recorded_history).fill('redacted');
    missingBodies = snapshot.recorded_empty_sql_count;
    placeholders = snapshot.recorded_non_sql_placeholder_count;
    metadataMismatch = sql.length !== snapshot.git_migration_file_count;
  }

  const blocked = Boolean(
    duplicates.length || metadataMismatch || missingGit.length ||
    unrecordedGit.length || missingBodies || placeholders
  );
  return Object.freeze({
    status: blocked ? 'BLOCKED' : 'REPLAY_PREFLIGHT_CANDIDATE',
    recorded: Array.isArray(snapshot.recorded) ? snapshot.recorded.length : snapshot.recorded_total,
    tracked: sql.length,
    missingStoredSql: missingBodies,
    nonSqlPlaceholder: placeholders,
    recordedWithoutSource: missingGit.length,
    sourceWithoutRecordedVersion: unrecordedGit.length,
    duplicateGitVersions: duplicates.length,
    sourceSnapshotOutdated: metadataMismatch,
    note: 'Historical read-only evidence. Passing this audit alone never authorizes a remote branch, SQL migration, or Production change.'
  });
}

export function auditFromFile(manifestPath, migrationDirectory) {
  const manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'));
  return auditMigrationReplay(manifest, readdirSync(resolve(migrationDirectory)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const index = process.argv.indexOf('--manifest');
  const dirIndex = process.argv.indexOf('--dir');
  if (index < 0 || !process.argv[index + 1] || dirIndex < 0 || !process.argv[dirIndex + 1]) {
    console.error('Usage: node scripts/ci/migration-replay-audit.mjs --manifest FILE --dir MIGRATIONS [--strict]');
    process.exitCode = 2;
  } else {
    const outcome = auditFromFile(process.argv[index + 1], process.argv[dirIndex + 1]);
    console.log(JSON.stringify(outcome, null, 2));
    if (outcome.status === 'BLOCKED' && process.argv.includes('--strict')) process.exitCode = 2;
  }
}
