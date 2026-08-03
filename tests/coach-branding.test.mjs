/**
 * Characterization tests for KR Kinetics / Elevate Fitness brand metadata.
 * Expected values are locked from the pre-Lot-3 dual-brand runtime.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DUAL_BRAND_SRC = readFileSync(join(ROOT, 'scripts/coach-calculator-dual-brand.mjs'), 'utf8');

const EXPECTED_KR = Object.freeze({
  id: 'kr',
  displayName: 'KR Kinetics',
  slug: 'KR_Kinetics',
  logoAlt: 'KR Kinetics',
  guidePath: './guides/kr-kinetics-equivalents-client-fr.pdf',
  headerLogoPath: './assets/logo-kr-kinetics-horizontal.png',
  pdfLogoRuntimeExpr: 'window.KR_PDF_LOGO_HORIZONTAL_DATA_URI',
});

const EXPECTED_ELEVATE = Object.freeze({
  id: 'elevate',
  displayName: 'Elevate Fitness',
  slug: 'Elevate_Fitness',
  logoAlt: 'Elevate Fitness',
  guidePath: './guides/elevate-fitness-equivalents-client-fr.pdf',
  headerLogoPath: './assets/logo-elevate-fitness.jpg',
  pdfLogoRuntimeExpr: 'window.ELEVATE_PDF_LOGO_DATA_URI',
});

test('dual-brand runtime embeds KR Kinetics brand metadata', async () => {
  const { buildDualBrandRuntime } = await import('../scripts/coach-calculator-dual-brand.mjs');
  const runtime = buildDualBrandRuntime();
  assert.match(runtime, /key: 'kr', label: 'KR Kinetics', slug: 'KR_Kinetics'/);
  assert.match(runtime, /logo: window\.KR_PDF_LOGO_HORIZONTAL_DATA_URI/);
  assert.match(runtime, /logoAlt: 'KR Kinetics'/);
  assert.match(runtime, /guide: '\.\/guides\/kr-kinetics-equivalents-client-fr\.pdf'/);
  assert.match(DUAL_BRAND_SRC, /logo-kr-kinetics-horizontal\.png|BRANDS\.kr/);
});

test('dual-brand runtime embeds Elevate Fitness brand metadata', async () => {
  const { buildDualBrandRuntime } = await import('../scripts/coach-calculator-dual-brand.mjs');
  const runtime = buildDualBrandRuntime();
  assert.match(runtime, /key: 'elevate', label: 'Elevate Fitness', slug: 'Elevate_Fitness'/);
  assert.match(runtime, /logo: window\.ELEVATE_PDF_LOGO_DATA_URI/);
  assert.match(runtime, /logoAlt: 'Elevate Fitness'/);
  assert.match(runtime, /guide: '\.\/guides\/elevate-fitness-equivalents-client-fr\.pdf'/);
  assert.match(DUAL_BRAND_SRC, /logo-elevate-fitness\.jpg|BRANDS\.elevate/);
});

test('dual-brand filename pattern uses brand slug and Plan prefix', async () => {
  const { buildDualBrandRuntime } = await import('../scripts/coach-calculator-dual-brand.mjs');
  const runtime = buildDualBrandRuntime();
  assert.match(runtime, /l\.filenamePrefix/);
  assert.match(runtime, /brand\.slug/);
  assert.match(runtime, /pdfLang === 'en' \? '_EN' : ''/);
  // filenamePrefix value lives in base PDF_LABELS (index/golden), not dual-brand overrides.
  const indexHtml = readFileSync(join(ROOT, 'coach-calculator/index.html'), 'utf8');
  assert.match(indexHtml, /filenamePrefix: 'Plan'/);
  assert.match(runtime, /slug: 'KR_Kinetics'/);
  assert.match(runtime, /slug: 'Elevate_Fitness'/);
});

test('dual-brand defaults unknown creator to KR', async () => {
  const { buildDualBrandRuntime } = await import('../scripts/coach-calculator-dual-brand.mjs');
  const runtime = buildDualBrandRuntime();
  assert.match(
    runtime,
    /pdfCreator = creator === 'elevate' \? 'elevate' : 'kr'/,
  );
  assert.match(
    runtime,
    /return pdfCreator === 'elevate' \? PDF_BRANDS\.elevate : PDF_BRANDS\.kr/,
  );
});

test('central brand config matches characterized KR and Elevate metadata', async () => {
  const {
    BRANDS,
    DEFAULT_BRAND_ID,
    resolveBrandId,
    getBrand,
    buildPdfBrandsRuntimeObjectLiteral,
  } = await import('../src/coach/branding/brands.mjs');

  assert.equal(DEFAULT_BRAND_ID, 'kr');
  assert.deepEqual({ ...BRANDS.kr }, EXPECTED_KR);
  assert.deepEqual({ ...BRANDS.elevate }, EXPECTED_ELEVATE);

  assert.equal(resolveBrandId('elevate'), 'elevate');
  assert.equal(resolveBrandId('kr'), 'kr');
  assert.equal(resolveBrandId('unknown'), 'kr');
  assert.equal(resolveBrandId(null), 'kr');
  assert.equal(resolveBrandId(undefined), 'kr');
  assert.equal(getBrand('elevate').displayName, 'Elevate Fitness');
  assert.equal(getBrand('nope').displayName, 'KR Kinetics');

  assert.ok(Object.isFrozen(BRANDS));
  assert.ok(Object.isFrozen(BRANDS.kr));
  assert.ok(Object.isFrozen(BRANDS.elevate));
  assert.throws(() => {
    BRANDS.kr.displayName = 'mutated';
  });

  const literal = buildPdfBrandsRuntimeObjectLiteral();
  assert.match(literal, /key: 'kr', label: 'KR Kinetics', slug: 'KR_Kinetics'/);
  assert.match(literal, /key: 'elevate', label: 'Elevate Fitness', slug: 'Elevate_Fitness'/);
  assert.match(literal, /window\.KR_PDF_LOGO_HORIZONTAL_DATA_URI/);
  assert.match(literal, /window\.ELEVATE_PDF_LOGO_DATA_URI/);

  const { buildDualBrandRuntime } = await import('../scripts/coach-calculator-dual-brand.mjs');
  const runtime = buildDualBrandRuntime();
  assert.ok(runtime.includes(literal), 'dual-brand runtime must embed centralized PDF_BRANDS literal');
  assert.match(runtime, /PDF_BRANDS\.elevate/);
  assert.match(runtime, /PDF_BRANDS\.kr/);
});

test('brand asset paths referenced by config exist on disk', async () => {
  const { BRANDS } = await import('../src/coach/branding/brands.mjs');
  const { existsSync } = await import('node:fs');
  assert.ok(existsSync(join(ROOT, 'coach-calculator', BRANDS.kr.headerLogoPath.replace(/^\.\//, ''))));
  assert.ok(existsSync(join(ROOT, 'coach-calculator', BRANDS.elevate.headerLogoPath.replace(/^\.\//, ''))));
  assert.ok(existsSync(join(ROOT, 'coach-calculator', BRANDS.kr.guidePath.replace(/^\.\//, ''))));
  assert.ok(existsSync(join(ROOT, 'coach-calculator', BRANDS.elevate.guidePath.replace(/^\.\//, ''))));
});
