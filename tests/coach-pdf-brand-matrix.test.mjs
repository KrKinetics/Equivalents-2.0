/**
 * Deterministic PDF brand matrix: UI selection must drive theme, not org slug alone.
 * Numeric values come from golden banque fixtures — never from screenshot PDFs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  suggestBanque,
  buildAutoRepartition,
} from '../src/lib/coach-calculator-engine.mjs';
import { buildPlanSnapshot } from '../src/coach/server/pdf/build-plan-snapshot.mjs';
import { buildPdfDocumentHtml } from '../src/coach/server/pdf/build-pdf-html.mjs';
import { buildPdfFilename } from '../src/coach/server/pdf/filename.mjs';
import { loadBrandLogoDataUri } from '../src/coach/server/pdf/resolve-logo.mjs';
import {
  resolvePdfBrand,
  getPdfTheme,
  allowedPdfBrandsForOrganization,
  PDF_THEMES,
} from '../src/coach/server/pdf/themes.mjs';
import { validatePdfRequestBody } from '../src/coach/server/validation/pdf-request.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'tmp', 'pdf-brand-control');
const golden = JSON.parse(
  fs.readFileSync(path.join(root, 'tests/fixtures/golden/portions-banque.cases.json'), 'utf8'),
);

function fixtureDay() {
  const suggest = golden.cases.find((c) => c.id === 'suggest-banque-2800');
  const auto = golden.cases.find((c) => c.id === 'auto-repartition-classique-from-suggest-2800');
  const banque = suggestBanque(suggest.input.targets);
  const built = buildAutoRepartition({ banque, mode: 'classique' });
  return {
    banque,
    repartition: built.repartition,
    targets: suggest.input.targets,
    eauAjout: 0,
    eauManuel: false,
    expectedRepartition: auto.expected.repartition,
  };
}

test('resolvePdfBrand: UI selection is not overwritten by organization brand', () => {
  const krOrgElevatePdf = resolvePdfBrand({
    selectedBrand: 'elevate',
    organizationSlug: 'kr-kinetics',
  });
  assert.equal(krOrgElevatePdf.ok, true);
  assert.equal(krOrgElevatePdf.brandId, 'elevate');
  assert.equal(krOrgElevatePdf.orgBrandId, 'kr');
  assert.equal(krOrgElevatePdf.theme.id, 'elevate');

  const elevOrgKrPdf = resolvePdfBrand({
    selectedBrand: 'kr',
    organizationSlug: 'elevate-fitness',
  });
  assert.equal(elevOrgKrPdf.ok, true);
  assert.equal(elevOrgKrPdf.brandId, 'kr');
  assert.equal(elevOrgKrPdf.orgBrandId, 'elevate');

  const defaultOrg = resolvePdfBrand({
    selectedBrand: null,
    organizationSlug: 'kr-kinetics',
  });
  assert.equal(defaultOrg.brandId, 'kr');

  const bad = resolvePdfBrand({
    selectedBrand: 'acme',
    organizationSlug: 'kr-kinetics',
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 400);

  const unknownOrg = resolvePdfBrand({
    selectedBrand: 'kr',
    organizationSlug: 'unknown-org',
  });
  assert.equal(unknownOrg.ok, false);
  assert.equal(unknownOrg.status, 403);
});

test('allowed brands: both PDF brands for either known organization', () => {
  assert.deepEqual(allowedPdfBrandsForOrganization('kr-kinetics'), ['kr', 'elevate']);
  assert.deepEqual(allowedPdfBrandsForOrganization('elevate-fitness'), ['kr', 'elevate']);
  assert.deepEqual(allowedPdfBrandsForOrganization('other'), []);
});

test('PDF themes are visually distinct (palette + banner + accent)', () => {
  const kr = getPdfTheme('kr');
  const elev = getPdfTheme('elevate');
  assert.notEqual(kr.banner, elev.banner);
  assert.notEqual(kr.accent, elev.accent);
  assert.equal(kr.accent, '#ED1136');
  assert.equal(elev.accent, '#D4A94F');
  assert.equal(kr.banner, '#071B41');
  assert.equal(elev.banner, '#050505');
  assert.equal(kr.logoFilter, 'none');
  assert.equal(elev.logoFilter, 'none');
});

test('brand matrix HTML: correct logo brand, filename, no cross-contamination', async () => {
  const day = fixtureDay();
  const snapshot = buildPlanSnapshot({
    day,
    targets: day.targets,
    locale: 'fr',
    jourKey: 'entrainement',
  });
  assert.deepEqual(day.repartition, day.expectedRepartition);

  const matrix = [
    { org: 'kr-kinetics', pdf: 'kr', other: 'Elevate Fitness', file: 'KR_Kinetics' },
    { org: 'kr-kinetics', pdf: 'elevate', other: 'KR Kinetics', file: 'Elevate_Fitness' },
    { org: 'elevate-fitness', pdf: 'kr', other: 'Elevate Fitness', file: 'KR_Kinetics' },
    { org: 'elevate-fitness', pdf: 'elevate', other: 'KR Kinetics', file: 'Elevate_Fitness' },
  ];

  fs.mkdirSync(outDir, { recursive: true });

  for (const c of matrix) {
    const resolved = resolvePdfBrand({
      selectedBrand: c.pdf,
      organizationSlug: c.org,
    });
    assert.equal(resolved.ok, true, `${c.org}+${c.pdf}`);
    assert.equal(resolved.brandId, c.pdf);

    const logo = await loadBrandLogoDataUri(c.pdf);
    assert.ok(logo.bytes > 1000, `${c.pdf} logo bytes`);
    assert.match(logo.dataUri, /^data:image\/(png|jpeg);base64,/);

    const html = buildPdfDocumentHtml({
      locale: 'fr',
      brandId: c.pdf,
      theme: resolved.theme,
      athleteName: 'Fixture Athlete',
      dateStr: '2026-08-05',
      goalLabel: 'Maintien',
      ratioLabel: '—',
      notes: 'Note de contrôle marque',
      trainingSnapshot: snapshot,
      logoDataUri: logo.dataUri,
    });

    assert.match(html, new RegExp(`data-pdf-brand="${c.pdf}"`));
    assert.match(html, new RegExp(`brand-${c.pdf}`));
    assert.match(html, new RegExp(PDF_THEMES[c.pdf].displayName));
    assert.match(html, /Préparé par/);
    assert.match(html, /data:image\/(png|jpeg);base64,/);
    assert.doesNotMatch(html, new RegExp(c.other));
    assert.doesNotMatch(html, /filter:brightness\(0\)\s*invert\(1\)/);
    assert.match(html, new RegExp(String(snapshot.plannedTotals.kcal)));

    const filename = buildPdfFilename({
      locale: 'fr',
      brandSlug: c.pdf,
      athleteName: 'Fixture Athlete',
      dateIso: '2026-08-05',
    });
    assert.match(filename, new RegExp(`^Plan_${c.file}_`));
    assert.doesNotMatch(
      filename,
      c.pdf === 'kr' ? /Elevate_Fitness/ : /KR_Kinetics/,
    );

    // Persist control HTML for visual QA (same fixture, brand varies).
    fs.writeFileSync(
      path.join(outDir, `control-${c.org}-${c.pdf}.html`),
      html,
      'utf8',
    );
  }
});

test('pdf_brand accepted by request validator and unknown rejected', () => {
  const day = fixtureDay();
  const banque = {
    pro: Number(day.banque.pro) || 0,
    fec: Number(day.banque.fec) || 0,
    leg: Number(day.banque.leg) || 0,
    fru: Number(day.banque.fru) || 0,
    lai: Number(day.banque.lai) || 0,
    lip: Number(day.banque.lip) || 0,
    whey: Number(day.banque.whey) || 0,
  };
  const base = {
    organization_slug: 'kr-kinetics',
    client_id: '00000000-0000-4000-8000-000000000001',
    locale: 'fr',
    athlete_name: 'Test',
    goal_label: 'Maintien',
    macro_ratio_label: '25/45/30',
    coach_notes: '',
    include_rest: false,
    training: {
      banque,
      repartition: day.repartition.map(Number),
      targets: {
        kcal: Number(day.targets.kcal),
        pro: Number(day.targets.pro),
        glu: Number(day.targets.glu),
        lip: Number(day.targets.lip),
      },
    },
    rest: null,
    pdf_brand: 'elevate',
  };

  const ok = validatePdfRequestBody(base);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.pdf_brand, 'elevate');

  const bad = validatePdfRequestBody({ ...base, pdf_brand: 'acme' });
  assert.equal(bad.ok, false);
});

test('bridge source sends pdf_brand from pdfCreator', () => {
  const bridge = fs.readFileSync(
    path.join(root, 'src/coach/client/server-nutrition-bridge.mjs'),
    'utf8',
  );
  assert.match(bridge, /pdf_brand:\s*pdfBrand/);
  assert.match(bridge, /pdfCreator === 'elevate'/);
  assert.doesNotMatch(bridge, /brandIdFromOrganizationSlug/);
});
