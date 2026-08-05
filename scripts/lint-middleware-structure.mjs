/**
 * package.json is commonjs, but Vercel Edge Middleware must be ESM.
 * Validate structure without parsing as CJS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'middleware.js'), 'utf8');

if (!src.includes("from '@vercel/edge'")) {
  throw new Error('middleware.js must import next() from @vercel/edge');
}
if (!/export\s+default\s+async\s+function\s+middleware/.test(src)) {
  throw new Error('middleware.js must default-export async function middleware');
}
if (!src.includes('coach_access_token') && !src.includes('COACH_ACCESS_COOKIE')) {
  throw new Error('middleware.js must check the coach access cookie');
}
if (/unsafe-eval/.test(src)) {
  throw new Error('middleware.js must not mention unsafe-eval');
}
console.log('middleware.js structure ok (ESM for Vercel Edge)');
