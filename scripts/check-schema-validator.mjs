/**
 * Fail if src/generated/food-equivalents-validator.mjs is out of date vs schema.
 *
 * Usage: npm run schema:check
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(root, 'src', 'data', 'food-equivalents.schema.json');
const validatorPath = path.join(root, 'src', 'generated', 'food-equivalents-validator.mjs');

const schemaHash = crypto
  .createHash('sha256')
  .update(fs.readFileSync(schemaPath))
  .digest('hex');

const mod = await import(pathToFileURL(validatorPath).href);
const generated = mod.GENERATED_SCHEMA_HASH;

if (!generated) {
  console.error('schema:check failed: GENERATED_SCHEMA_HASH missing — run npm run schema:generate');
  process.exitCode = 1;
} else if (generated !== schemaHash) {
  console.error('schema:check failed: generated validator is stale');
  console.error(`  schema:    ${schemaHash}`);
  console.error(`  generated: ${generated}`);
  console.error('Run: npm run schema:generate');
  process.exitCode = 1;
} else {
  console.log('schema:check ok', schemaHash.slice(0, 12));
}
