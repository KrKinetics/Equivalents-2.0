/**
 * Coach-facing static checks for the motivation persistence migration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260816140000_client_motivation_assessment.sql'),
  'utf8',
);

test('motivation invite creation is contained to fictional clients in the coach org', () => {
  assert.match(sql, /and c\.is_fictional = true/i);
  assert.match(sql, /m\.organization_id = c\.organization_id/i);
  assert.match(sql, /client_motivation_invites_one_active_per_client_idx/i);
});

test('motivation persistence never stores a raw token column', () => {
  assert.match(sql, /token_hash text not null unique/i);
  assert.doesNotMatch(sql, /\btoken\s+text\s+not null/i);
  assert.match(sql, /revoke all on function private\.client_motivation_token_hash\(text\)/i);
});

test('motivation analysis cannot be written by anon and cannot overwrite', () => {
  assert.doesNotMatch(sql, /grant execute on function public\.persist_client_motivation_analysis\([^)]+\) to anon/i);
  assert.match(sql, /motivation analysis versions are immutable/i);
  assert.doesNotMatch(sql, /update public\.client_motivation_analysis_versions/i);
});
