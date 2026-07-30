/**
 * Regenerate reports/nutrition-pilot-5-foods.{json,html} from live data.
 * Never modifies food-equivalents.json.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { auditDataset } from '../src/lib/food-audit-core.mjs';
import { computeFoodsDataHash } from '../src/lib/data-hash.mjs';
import {
  DEFAULT_ALLOWED_FOOD_IDS,
  buildPilotBaseline,
  summarizePilotOpenAlerts,
} from '../src/lib/nutrition-pilot-scope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const CONFIG_PATH = path.join(ROOT, 'src', 'data', 'nutrition-pilot-config.json');
const JSON_OUT = path.join(ROOT, 'reports', 'nutrition-pilot-5-foods.json');
const HTML_OUT = path.join(ROOT, 'reports', 'nutrition-pilot-5-foods.html');

const RESEARCH_PROMPTS = {
  'fruits-blueberries': {
    identityDecisions: [
      'frais ou congelés',
      'crus',
      'cultivés ou sauvages',
      'portion conservée ou à revoir',
    ],
  },
  'noix-graines-almonds': {
    identityDecisions: [
      'crues ou rôties',
      'salées ou non salées',
      'entières',
      'confirmation du poids réel de 7 amandes',
    ],
  },
  'feculents-cooked-quinoa': {
    identityDecisions: [
      'variété',
      'cuit dans l’eau',
      'avec ou sans sel',
      'portion égouttée/cuite de 75 g',
    ],
  },
  'viandes-volaille-chicken-breast': {
    identityDecisions: [
      'sans peau',
      'désossée',
      'poids cru ou cuit',
      'méthode de cuisson',
      'sans huile ajoutée',
    ],
  },
  'autres-sources-proteinees-core-power-fairlife': {
    identityDecisions: [
      'nom complet du produit',
      'format exact de bouteille',
      'pays de l’étiquette',
      'quantité exacte de protéines par bouteille',
      'photo ou référence précise de l’étiquette',
    ],
  },
};

function emptyResearchFields() {
  return {
    sourceType: null,
    sourceName: null,
    sourceRecordId: null,
    sourceUrl: null,
    sourceAccessedAt: null,
    sourceServingDescription: null,
    sourceNutrientsBasis: null,
    valuePer100gOr100ml: null,
    calculationToKrPortion: null,
    roundingRules: null,
    beforeAfterComparison: null,
  };
}

function buildFoodReport(food, auditItem) {
  const openErrors = (auditItem.alerts || []).filter(
    (alert) =>
      alert.severity === 'ERROR' && alert.resolutionStatus !== 'resolved_documented'
  );
  const warnings = (auditItem.alerts || []).filter((alert) => alert.severity === 'WARNING');
  const research = RESEARCH_PROMPTS[food.id] || { identityDecisions: [] };
  return {
    id: food.id,
    names: food.names,
    displayCategory: food.displayCategory,
    calculationGroup: food.calculationGroup,
    exchangeProfileId: food.exchangeProfileId ?? null,
    portion: {
      labelFr: food.portion?.labelFr ?? null,
      labelEn: food.portion?.labelEn ?? null,
      amount: food.portion?.amount ?? null,
      unit: food.portion?.unit ?? null,
      grams: food.portion?.grams ?? null,
      preparationState: food.portion?.preparationState ?? null,
      brandSpecific: food.portion?.brandSpecific ?? false,
      brand: food.portion?.brand ?? null,
    },
    nutrients: { ...food.nutrients },
    atwaterControl: {
      calculatedKcal:
        auditItem.calculatedKcal == null
          ? null
          : Math.round(auditItem.calculatedKcal * 10) / 10,
      absoluteDifference:
        auditItem.absDiff == null ? null : Math.round(auditItem.absDiff * 10) / 10,
      percentDifference:
        auditItem.pctDiff == null ? null : Math.round(auditItem.pctDiff * 10) / 10,
      reason:
        auditItem.calculatedKcal == null && food.nutrients?.fatG == null
          ? 'fatG est absent'
          : null,
    },
    alerts: auditItem.alerts,
    legacySource: {
      reference: food.legacySource?.reference ?? null,
      referenceId: food.legacySource?.referenceId ?? null,
    },
    proposedAuthoritativeSource: null,
    missingApprovalsOrFields: [
      'identité précise',
      'état de préparation',
      'portion canonique',
      'poids en grammes',
      'source authoritative complète',
      'nutriments',
      'classification',
    ],
    classification: {
      current: food.classificationStatus ?? 'pending',
      proposed: null,
    },
    readiness: {
      state: openErrors.length ? 'blocked' : 'awaiting_explicit_approval',
      openErrorCount: openErrors.length,
      warningCount: warnings.length,
      canMarkVerified: false,
    },
    comparison: { before: 'current_database_values', after: null },
    finalStatus: food.status || 'unverified',
    researchChecklist: {
      identityDecisions: research.identityDecisions,
      fields: emptyResearchFields(),
      valuesResearched: false,
    },
  };
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function fmtNum(value) {
  if (value == null) return '—';
  return String(value).replace('.', ',');
}

function renderFoodHtml(food) {
  const alerts = (food.alerts || [])
    .map((alert) => {
      const cls = alert.severity === 'ERROR' ? 'error' : 'warning';
      const open =
        alert.severity === 'ERROR' && alert.resolutionStatus === 'open' ? ' — ouverte' : '';
      return `<li><span class="${cls}">${esc(alert.severity)}</span> ${esc(alert.code)}${esc(open)}</li>`;
    })
    .join('');
  const decisions = (food.researchChecklist?.identityDecisions || [])
    .map((item) => `<li>${esc(item)}</li>`)
    .join('');
  const n = food.nutrients || {};
  const atwater =
    food.atwaterControl.calculatedKcal == null
      ? `Impossible : ${esc(food.atwaterControl.reason || 'contrôle indisponible')}. ${fmtNum(n.declaredKcal)} kcal déclarées.`
      : `${fmtNum(food.atwaterControl.calculatedKcal)} kcal calculées; ${fmtNum(n.declaredKcal)} kcal déclarées; écart ${fmtNum(food.atwaterControl.absoluteDifference)} kcal (${fmtNum(food.atwaterControl.percentDifference)} %).`;
  return `
  <article class="food">
    <div class="food-head"><div><h2>${esc(food.names.fr)} / ${esc(food.names.en)}</h2><code>${esc(food.id)}</code></div><span class="status">${esc(String(food.finalStatus).toUpperCase())}</span></div>
    <div class="grid">
      <section><h3>Identification</h3><dl><dt>Catégorie</dt><dd>${esc(food.displayCategory)}</dd><dt>Groupe</dt><dd>${esc(food.calculationGroup)}</dd><dt>Profil</dt><dd>${esc(food.exchangeProfileId ?? 'Non défini')}</dd><dt>Classification</dt><dd>${esc(food.classification.current)}</dd><dt>Préparation</dt><dd>${esc(food.portion.preparationState ?? 'Non définie')}</dd></dl></section>
      <section><h3>Portion actuelle</h3><p>${esc(food.portion.labelFr)}</p><p class="muted">EN : ${esc(food.portion.labelEn)}</p><h3>Contrôle 4-4-9</h3><p>${atwater}</p></section>
    </div>
    <h3>Nutriments actuels</h3>
    <table><tr><th>Protéines</th><th>Glucides</th><th>Fibres</th><th>Lipides</th><th>Saturés</th><th>Poly</th><th>Mono</th></tr>
    <tr><td>${fmtNum(n.proteinG)} g</td><td>${fmtNum(n.carbsG)} g</td><td>${fmtNum(n.fiberG)} g</td><td>${fmtNum(n.fatG)} g</td><td>${fmtNum(n.saturatedFatG)} g</td><td>${fmtNum(n.polyunsaturatedFatG)} g</td><td>${fmtNum(n.monounsaturatedFatG)} g</td></tr></table>
    <h3>Alertes actuelles</h3><ul>${alerts}</ul>
    <h3>Source</h3><p>Legacy : <code>${esc(food.legacySource.referenceId)}</code>. Source authoritative proposée : <strong>non fournie</strong>.</p>
    <div class="pending"><strong>À approuver :</strong> ${(food.missingApprovalsOrFields || []).map(esc).join(', ')}. Comparaison après : non disponible.</div>
    <h3>Recherche à remplir</h3>
    <ul>${decisions}</ul>
    <p class="muted">Champs source/valeur/arrondi encore vides — aucune recherche effectuée.</p>
  </article>`;
}

function renderHtml(report) {
  const foodsHtml = report.foods.map(renderFoodHtml).join('\n');
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Lot pilote nutritionnel — 5 aliments</title>
  <style>
    :root { color-scheme: light dark; --bg:#f5f5f2; --panel:#fff; --ink:#20201d; --muted:#66665f; --line:#d8d8d0; --accent:#215d4f; --warn:#835d12; --error:#9d2d27; }
    @media (prefers-color-scheme: dark) { :root { --bg:#181916; --panel:#22231f; --ink:#eeeeea; --muted:#aaa9a0; --line:#3c3d37; --accent:#80c9b5; --warn:#e6bc62; --error:#ff8e86; } }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif; }
    main { max-width:1120px; margin:auto; padding:36px 22px 64px; }
    h1 { font-size:26px; margin:0 0 6px; }
    h2 { font-size:19px; margin:0; }
    h3 { font-size:15px; margin:18px 0 6px; }
    p { margin:6px 0; }
    code { overflow-wrap:anywhere; }
    .muted { color:var(--muted); }
    .summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px; margin:24px 0; }
    .metric,.food { background:var(--panel); border:1px solid var(--line); border-radius:8px; }
    .metric { padding:14px; }
    .metric strong { display:block; font-size:20px; color:var(--accent); }
    .notice { border-left:4px solid var(--warn); padding:10px 14px; margin:20px 0 28px; background:var(--panel); }
    .food { margin:18px 0; padding:20px; }
    .food-head { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; border-bottom:1px solid var(--line); padding-bottom:12px; }
    .status { font-weight:700; color:var(--warn); white-space:nowrap; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px 24px; }
    dl { display:grid; grid-template-columns:minmax(110px,auto) 1fr; gap:4px 12px; margin:8px 0; }
    dt { color:var(--muted); }
    dd { margin:0; }
    table { width:100%; border-collapse:collapse; }
    th,td { text-align:left; padding:5px 8px; border-bottom:1px solid var(--line); }
    th { color:var(--muted); font-weight:600; }
    ul { margin:6px 0; padding-left:20px; }
    .error { color:var(--error); font-weight:700; }
    .warning { color:var(--warn); font-weight:700; }
    .pending { background:var(--bg); border:1px dashed var(--line); padding:10px; border-radius:6px; }
  </style>
</head>
<body>
<main>
  <h1>Lot pilote nutritionnel — état initial</h1>
  <p class="muted">Rapport préparatoire pour cinq aliments existants. Aucune donnée nutritionnelle n’a été modifiée et aucune source n’a été recherchée.</p>

  <section class="summary">
    <div class="metric"><strong>5</strong>aliments dans le pilote</div>
    <div class="metric"><strong>${esc(report.scopeGuardBaseline.protectedFoodCount)}</strong>aliments protégés</div>
    <div class="metric"><strong>${esc(report.stats.totalOpenErrors)}</strong>ERROR ouvertes au total</div>
    <div class="metric"><strong>${esc(report.stats.foodsWithOpenErrors)}</strong>aliments avec ERROR ouverte</div>
    <div class="metric"><strong>${esc(report.stats.foodsWithoutOpenErrors)}</strong>aliments sans ERROR ouverte</div>
    <div class="metric"><strong>${esc(report.stats.totalWarnings)}</strong>avertissements</div>
    <div class="metric"><strong>0</strong>aliment prêt à être marqué verified</div>
  </section>

  <div class="notice">
    <strong>Baseline du garde-fou</strong>
    <p>Hash alimentaire global : <code>${esc(report.dataset.dataHash)}</code></p>
    <p>Hash complet des ${esc(report.scopeGuardBaseline.protectedFoodCount)} aliments protégés : <code>${esc(report.scopeGuardBaseline.protectedFoodsDataHash)}</code></p>
    <p>Hash nutritionnel des ${esc(report.scopeGuardBaseline.protectedFoodCount)} aliments protégés : <code>${esc(report.scopeGuardBaseline.protectedFoodsNutritionHash)}</code></p>
  </div>

${foodsHtml}

  <p class="muted">Statut final des cinq fiches : unverified. Les champs de recherche sont préparés mais vides. Aucune transaction verify n’a été créée.</p>
</main>
</body>
</html>
`;
}

function main() {
  const payload = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const audit = auditDataset(payload.foods);
  const foods = DEFAULT_ALLOWED_FOOD_IDS.map((id) => {
    const food = payload.foods.find((item) => item.id === id);
    if (!food) throw new Error(`Pilot food missing: ${id}`);
    return buildFoodReport(food, audit.byId[id]);
  });
  const baseline = buildPilotBaseline(payload.foods, config.allowedFoodIds);
  const stats = summarizePilotOpenAlerts(foods);
  const report = {
    reportType: 'nutrition-pilot-initial',
    generatedAt: new Date().toISOString(),
    dataModified: false,
    dataset: {
      foodCount: payload.foods.length,
      dataHash: computeFoodsDataHash(payload.foods),
    },
    stats,
    scopeGuardBaseline: {
      allowedFoodIds: [...config.allowedFoodIds],
      protectedFoodCount: baseline.protectedFoodCount,
      protectedFoodsDataHash: baseline.protectedFoodsDataHash,
      protectedFoodsNutritionHash: baseline.protectedFoodsNutritionHash,
    },
    approvalPolicy: {
      authoritativeValuesResearched: false,
      authoritativeValuesProposed: false,
      verificationAllowed: false,
      nextAction:
        'Obtenir l’approbation explicite de l’identité, de l’état de préparation, de la portion, du poids, de la source, des nutriments et de la classification.',
    },
    foods,
  };

  fs.writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(HTML_OUT, renderHtml(report), 'utf8');
  console.log(
    JSON.stringify(
      {
        ok: true,
        json: JSON_OUT,
        html: HTML_OUT,
        stats,
        dataHash: report.dataset.dataHash,
      },
      null,
      2
    )
  );
}

main();
