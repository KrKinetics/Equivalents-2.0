import test from 'node:test';
import assert from 'node:assert/strict';

import { computeSchemaHash, normalizeSchemaText } from '../scripts/schema-hash.mjs';

test('schema hashes are identical for LF and CRLF line endings', () => {
  const lf = '{\n  "type": "object"\n}\n';
  const crlf = lf.replace(/\n/g, '\r\n');

  assert.equal(normalizeSchemaText(crlf), lf);
  assert.equal(computeSchemaHash(crlf), computeSchemaHash(lf));
});
