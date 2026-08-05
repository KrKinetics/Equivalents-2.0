import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMBEDDED_LOGOS } from './embedded-logos.mjs';

const LOGO_FILES = Object.freeze({
  kr: { file: 'logo-kr-kinetics-horizontal.png', mime: 'image/png', magic: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  elevate: { file: 'logo-elevate-fitness.jpg', mime: 'image/jpeg', magic: Buffer.from([0xff, 0xd8, 0xff]) },
});

function looksLikeLogo(bytes, magic) {
  if (!Buffer.isBuffer(bytes) || bytes.length < magic.length || bytes.length < 64) return false;
  return bytes.subarray(0, magic.length).equals(magic);
}

function fromEmbedded(brandId) {
  const embedded = EMBEDDED_LOGOS[brandId];
  if (!embedded?.base64) return null;
  const bytes = Buffer.from(embedded.base64, 'base64');
  const meta = LOGO_FILES[brandId];
  if (!looksLikeLogo(bytes, meta.magic)) return null;
  return {
    dataUri: `data:${embedded.mime};base64,${embedded.base64}`,
    pathUsed: `embedded:${brandId}`,
    bytes: bytes.length,
  };
}

/**
 * Resolve brand logo bytes from deploy/includeFiles layout (never trust client paths).
 * Falls back to embedded non-empty assets so Preview/serverless never render an empty slot.
 * @param {'kr'|'elevate'} brandId
 */
export async function loadBrandLogoDataUri(brandId) {
  const meta = LOGO_FILES[brandId];
  if (!meta) {
    const err = new Error('logo_brand_unknown');
    err.code = 'logo_brand_unknown';
    throw err;
  }
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), 'coach-calculator', 'assets', meta.file),
    path.join(process.cwd(), 'assets', meta.file),
    path.join(moduleDir, '../../../../coach-calculator/assets', meta.file),
    path.join(moduleDir, '../../../coach-calculator/assets', meta.file),
  ];
  let lastError;
  for (const abs of candidates) {
    try {
      const bytes = await fs.readFile(abs);
      if (!looksLikeLogo(bytes, meta.magic)) {
        lastError = new Error(`logo_invalid_bytes:${abs}`);
        continue;
      }
      return {
        dataUri: `data:${meta.mime};base64,${bytes.toString('base64')}`,
        pathUsed: abs,
        bytes: bytes.length,
      };
    } catch (error) {
      lastError = error;
    }
  }

  const embedded = fromEmbedded(brandId);
  if (embedded) return embedded;

  const err = new Error('logo_file_missing');
  err.code = 'logo_file_missing';
  err.cause = lastError;
  throw err;
}
