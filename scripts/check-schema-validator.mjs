/**
 * Fail if generated schema validators are out of date vs schemas.
 *
 * Usage: npm run schema:check
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';
import { computeSchemaHash } from './schema-hash.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CHECKS = [
  {
    schemaRel: path.join('src', 'data', 'food-equivalents.schema.json'),
    validatorRel: path.join('src', 'generated', 'food-equivalents-validator.mjs'),
    hashExport: 'GENERATED_SCHEMA_HASH',
  },
  {
    schemaRel: path.join('src', 'data', 'approved-nutrition-batch.schema.json'),
    validatorRel: path.join('src', 'generated', 'approved-nutrition-batch-validator.mjs'),
    hashExport: 'GENERATED_BATCH_SCHEMA_HASH',
  },
];

let failed = false;
for (const check of CHECKS) {
  const schemaPath = path.join(root, check.schemaRel);
  const validatorPath = path.join(root, check.validatorRel);
  const schemaText = fs.readFileSync(schemaPath, 'utf8');
  const schemaHash = computeSchemaHash(schemaText);
  if (!fs.existsSync(validatorPath)) {
    console.error(`schema:check failed: missing ${check.validatorRel} — run npm run schema:generate`);
    failed = true;
    continue;
  }
  const mod = await import(pathToFileURL(validatorPath).href);
  const generated = mod[check.hashExport];
  if (!generated) {
    console.error(`schema:check failed: ${check.hashExport} missing — run npm run schema:generate`);
    failed = true;
  } else if (generated !== schemaHash) {
    console.error(`schema:check failed: ${check.validatorRel} is stale`);
    console.error(`  schema:    ${schemaHash}`);
    console.error(`  generated: ${generated}`);
    console.error('Run: npm run schema:generate');
    failed = true;
  } else {
    console.log(`schema:check ok ${check.hashExport}`, schemaHash.slice(0, 12));
  }
}

if (failed) process.exitCode = 1;
