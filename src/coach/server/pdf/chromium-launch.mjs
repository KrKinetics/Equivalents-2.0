/**
 * Resolve Chromium for Vercel / serverless PDF rendering.
 * Prefer a bundled @sparticuz/chromium bin; otherwise download the pinned remote pack.
 * Never logs secrets. Never uses Windows local Chrome paths on Vercel.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** Pinned to the installed @sparticuz/chromium major (149). Override via env if needed. */
export const CHROMIUM_REMOTE_PACK_URL_DEFAULT =
  'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';

const require = createRequire(import.meta.url);

/**
 * Locate chromium.br from the installed package (works when NFT/includeFiles kept the bin).
 * @returns {string|null}
 */
export function resolveBundledChromiumBinDir() {
  const candidates = [];

  try {
    // Resolve the package entry, then walk to ../bin (exports block package.json).
    const entry = require.resolve('@sparticuz/chromium');
    candidates.push(path.join(path.dirname(entry), '..', 'bin'));
  } catch {
    // ignore
  }

  candidates.push(
    path.join(process.cwd(), 'node_modules', '@sparticuz', 'chromium', 'bin'),
    path.join(process.cwd(), '..', 'node_modules', '@sparticuz', 'chromium', 'bin'),
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../node_modules/@sparticuz/chromium/bin'),
  );

  for (const dir of candidates) {
    const resolved = path.resolve(dir);
    if (fs.existsSync(path.join(resolved, 'chromium.br'))) return resolved;
  }
  return null;
}

/**
 * @param {{ executablePath: (input?: string) => Promise<string> }} chromium
 * @param {{ remotePackUrl?: string, preferBundled?: boolean }} [opts]
 * @returns {Promise<{ executablePath: string, source: 'bundled'|'remote_pack', remoteHost: string|null, bundledBinPresent: boolean }>}
 */
export async function resolveChromiumExecutable(chromium, opts = {}) {
  const remotePackUrl = String(
    opts.remotePackUrl
    || process.env.CHROMIUM_REMOTE_PACK_URL
    || CHROMIUM_REMOTE_PACK_URL_DEFAULT,
  ).trim();
  const bundledBin = resolveBundledChromiumBinDir();
  const bundledBinPresent = Boolean(bundledBin);

  // On Vercel, prefer the pinned remote pack: NFT often drops .br binaries even with
  // includeFiles. Opt into bundled with COACH_PDF_CHROMIUM=bundled after verifying packaging.
  const preferBundled = opts.preferBundled === true
    || process.env.COACH_PDF_CHROMIUM === 'bundled'
    || (!process.env.VERCEL && process.env.COACH_PDF_CHROMIUM !== 'remote');

  if (preferBundled && bundledBin) {
    const executablePath = await chromium.executablePath(bundledBin);
    return {
      executablePath,
      source: 'bundled',
      remoteHost: null,
      bundledBinPresent,
    };
  }

  if (!/^https:\/\//i.test(remotePackUrl)) {
    const err = new Error('chromium_remote_pack_invalid');
    err.code = 'chromium_remote_pack_invalid';
    throw err;
  }

  let remoteHost = null;
  try {
    remoteHost = new URL(remotePackUrl).host;
  } catch {
    remoteHost = 'invalid';
  }

  const executablePath = await chromium.executablePath(remotePackUrl);
  return {
    executablePath,
    source: 'remote_pack',
    remoteHost,
    bundledBinPresent,
  };
}
