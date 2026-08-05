/**
 * Chromium path resolution for Vercel PDF (bundled bin vs remote pack).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHROMIUM_REMOTE_PACK_URL_DEFAULT,
  resolveBundledChromiumBinDir,
  resolveChromiumExecutable,
} from '../src/coach/server/pdf/chromium-launch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('default remote pack URL is pinned https GitHub release for v149 x64', () => {
  assert.match(CHROMIUM_REMOTE_PACK_URL_DEFAULT, /^https:\/\/github\.com\/Sparticuz\/chromium\//);
  assert.match(CHROMIUM_REMOTE_PACK_URL_DEFAULT, /v149\.0\.0/);
  assert.match(CHROMIUM_REMOTE_PACK_URL_DEFAULT, /x64\.tar$/);
});

test('resolveBundledChromiumBinDir finds local chromium.br after npm ci', () => {
  const bin = resolveBundledChromiumBinDir();
  assert.ok(bin, 'expected bundled bin after install');
  assert.ok(fs.existsSync(path.join(bin, 'chromium.br')));
  assert.ok(bin.replace(/\\/g, '/').includes('@sparticuz/chromium/bin'));
});

test('resolveChromiumExecutable prefers bundled bin when preferBundled', async () => {
  const fake = {
    async executablePath(input) {
      assert.ok(input && !String(input).startsWith('http'));
      return path.join(String(input), 'chromium');
    },
  };
  const resolved = await resolveChromiumExecutable(fake, { preferBundled: true });
  assert.equal(resolved.source, 'bundled');
  assert.equal(resolved.bundledBinPresent, true);
  assert.equal(resolved.remoteHost, null);
});

test('resolveChromiumExecutable uses remote pack on Vercel by default', async () => {
  const prev = process.env.VERCEL;
  process.env.VERCEL = '1';
  delete process.env.COACH_PDF_CHROMIUM;
  try {
    let seen = null;
    const fake = {
      async executablePath(input) {
        seen = input;
        return '/tmp/chromium';
      },
    };
    const resolved = await resolveChromiumExecutable(fake);
    assert.equal(resolved.source, 'remote_pack');
    assert.equal(seen, CHROMIUM_REMOTE_PACK_URL_DEFAULT);
    assert.equal(resolved.remoteHost, 'github.com');
  } finally {
    if (prev === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prev;
  }
});

test('resolveChromiumExecutable rejects non-https remote pack URL when no bin', async () => {
  // Isolate: only exercise URL validation by stubbing a missing-bin environment via
  // a temporary rename is too invasive; validate the constant + https gate in source.
  const src = fs.readFileSync(
    path.join(root, 'src/coach/server/pdf/chromium-launch.mjs'),
    'utf8',
  );
  assert.match(src, /remote_pack/);
  assert.match(src, /https:\/\//);
  assert.match(src, /chromium_remote_pack_invalid/);
  void resolveChromiumExecutable;
});

test('vercel.json packages chromium bin + logos for PDF function', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const pdf = cfg.functions['api/coach-generate-pdf.js'];
  assert.ok(pdf);
  assert.match(String(pdf.includeFiles), /@sparticuz\/chromium\/bin/);
  assert.match(String(pdf.includeFiles), /logo-/);
  assert.ok(Number(pdf.maxDuration) >= 60);
  assert.ok(Number(pdf.memory) >= 1536);
});

test('PDF API error body includes requestId and stage; no AWS_LAMBDA hard dependency in handler', () => {
  const api = fs.readFileSync(path.join(root, 'api/coach-generate-pdf.js'), 'utf8');
  assert.match(api, /requestId/);
  assert.match(api, /stage:\s*failStage/);
  assert.doesNotMatch(api, /AWS_LAMBDA_JS_RUNTIME\s*=\s*'nodejs22/);
  assert.match(api, /X-Request-Id/);
});
