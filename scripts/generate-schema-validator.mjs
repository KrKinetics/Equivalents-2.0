/**
 * Generate browser/Node standalone Ajv validators from JSON Schemas.
 *
 * Usage: node scripts/generate-schema-validator.mjs
 * Also: npm run schema:generate
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { computeSchemaHash, normalizeSchemaText } from './schema-hash.mjs';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020.js');
const addFormats = require('ajv-formats');
const standaloneCode = require('ajv/dist/standalone').default;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'src', 'generated');

const TARGETS = [
  {
    schemaRel: path.join('src', 'data', 'food-equivalents.schema.json'),
    outRel: path.join('src', 'generated', 'food-equivalents-validator.mjs'),
    hashExport: 'GENERATED_SCHEMA_HASH',
    cjs: false,
  },
  {
    schemaRel: path.join('src', 'data', 'approved-nutrition-batch.schema.json'),
    outRel: path.join('src', 'generated', 'approved-nutrition-batch-validator.mjs'),
    hashExport: 'GENERATED_BATCH_SCHEMA_HASH',
    cjs: true,
    cjsOutRel: path.join('src', 'generated', 'approved-nutrition-batch-validator.cjs'),
  },
];

const ucs2Inline = `function ucs2length(str){const len=str.length;let length=0;let i=0;let c;while(i<len){c=str.charCodeAt(i++);if(c>=0xd800&&c<=0xdbff&&i<len){c=str.charCodeAt(i);if((c&0xfc00)===0xdc00)i++;}length++;}return length;}`;

function makeBrowserSafe(code) {
  let next = code.replace(
    /const func2 = require\(["']ajv\/dist\/runtime\/ucs2length["']\)\.default;/,
    `${ucs2Inline}\nconst func2 = ucs2length;`
  );
  if (next.includes('require(')) {
    throw new Error('Generated validator still contains require() — not browser-safe');
  }
  return next;
}

fs.mkdirSync(outDir, { recursive: true });

for (const target of TARGETS) {
  const schemaPath = path.join(root, target.schemaRel);
  const outPath = path.join(root, target.outRel);
  const schemaRaw = fs.readFileSync(schemaPath, 'utf8');
  const schemaText = normalizeSchemaText(schemaRaw);
  const schemaHash = computeSchemaHash(schemaText);
  const schema = JSON.parse(schemaText);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
    code: { source: true, esm: true },
  });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  let code = standaloneCode(ajv, validate);
  code = makeBrowserSafe(code);
  const banner = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Regenerate with: npm run schema:generate
 * Source: ${target.schemaRel.replaceAll('\\\\', '/')}
 */
export const ${target.hashExport} = ${JSON.stringify(schemaHash)};
`;
  fs.writeFileSync(outPath, `${banner}${code}\n`, 'utf8');
  console.log('Wrote', outPath);
  console.log(target.hashExport, schemaHash);

  if (target.cjs) {
    const ajvCjs = new Ajv2020({
      allErrors: true,
      strict: false,
      allowUnionTypes: true,
      code: { source: true },
    });
    addFormats(ajvCjs);
    const validateCjs = ajvCjs.compile(schema);
    let cjsCode = standaloneCode(ajvCjs, validateCjs);
    const cjsOut = path.join(root, target.cjsOutRel);
    fs.writeFileSync(
      cjsOut,
      `/** AUTO-GENERATED — npm run schema:generate */\nmodule.exports = ${cjsCode};\nmodule.exports.${target.hashExport} = ${JSON.stringify(schemaHash)};\n`,
      'utf8'
    );
    console.log('Wrote', cjsOut);
  }
}
