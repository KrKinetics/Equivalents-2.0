import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOGO_FILES = Object.freeze({
  kr: { file: 'logo-kr-kinetics-horizontal.png', mime: 'image/png' },
  elevate: { file: 'logo-elevate-fitness.jpg', mime: 'image/jpeg' },
});

/**
 * Resolve brand logo bytes from deploy/includeFiles layout (never trust client paths).
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
  ];
  let lastError;
  for (const abs of candidates) {
    try {
      const bytes = await fs.readFile(abs);
      return {
        dataUri: `data:${meta.mime};base64,${bytes.toString('base64')}`,
        pathUsed: abs,
        bytes: bytes.length,
      };
    } catch (error) {
      lastError = error;
    }
  }
  const err = new Error('logo_file_missing');
  err.code = 'logo_file_missing';
  err.cause = lastError;
  throw err;
}
