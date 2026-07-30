/**
 * Regenerate reports/nutrition-pilot-6-foods.{json,html} from live data.
 * Never modifies food-equivalents.json.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { auditDataset } from '../src/lib/food-audit-core.mjs';
import { computeFoodsDataHash } from '../src/lib/data-hash.mjs';
import {
  buildPilotBaseline,
  summarizePilotOpenAlerts,
} from '../src/lib/nutrition-pilot-scope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const CONFIG_PATH = path.join(ROOT, 'src', 'data', 'nutrition-pilot-config.json');
const JSON_OUT = path.join(ROOT, 'reports', 'nutrition-pilot-6-foods.json');
const HTML_OUT = path.join(ROOT, 'reports', 'nutrition-pilot-6-foods.html');

const RESEARCH_PROMPTS = {
  'fruits-blueberries': {
    identityDecisions: ['frais', 'crus', 'cultivés/génériques', '175 ml / 110 g'],
  },
  'noix-graines-almonds': {
    identityDecisions: ['entières', 'crues', 'non salées', '7 unités / 8,5 g'],
  },
  'feculents-cooked-quinoa': {
    identityDecisions: ['quinoa cuit dans l’eau', 'sans huile', '100 ml / 75 g'],
  },
  'viandes-volaille-chicken-breast': {
    identityDecisions: ['viande seulement', 'sans peau', 'cuite/rôtie', '30 g'],
  },
  'autres-sources-proteinees-core-power-fairlife': {
    identityDecisions: ['Core Power Elite chocolat', '414 ml → 100 ml KR'],
  },
  'autres-sources-proteinees-core-power-fairlife-elite-vanilla-42g': {
    identityDecisions: ['Core Power Elite vanille', '414 ml → 100 ml KR', 'nouvel aliment'],
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
    source: food.source || null,
    classification: {
      current: food.classificationStatus ?? 'pending',
      proposed: null,
    },
    readiness: {
      state: openErrors.length ? 'blocked' : food.status === 'verified' ? 'verified' : 'ready',
      openErrorCount: openErrors.length,
      warningCount: warnings.length,
      canMarkVerified: openErrors.length === 0,
    },
    comparison: { before: null, after: null },
    finalStatus: food.status || 'unverified',
    researchChecklist: {
      identityDecisions: research.identityDecisions,
      fields: emptyResearchFields(),
      valuesResearched: Boolean(food.source?.type),
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
  return `
  <article class="food">
    <div class="food-head"><div><h2>${esc(food.names?.fr)} / ${esc(food.names?.en)}</h2><code>${esc(food.id)}</code></div><span class="status">${esc(String(food.finalStatus).toUpperCase())}</span></div>
    <p>Source : <code>${esc(food.source?.type || 'none')}</code> · record <code>${esc(food.source?.recordId || '—')}</code></p>
    <table><tr><th>kcal</th><th>Prot</th><th>Gluc</th><th>Fibres</th><th>Lip</th><th>Sat</th></tr>
    <tr><td>${fmtNum(n.declaredKcal)}</td><td>${fmtNum(n.proteinG)}</td><td>${fmtNum(n.carbsG)}</td><td>${fmtNum(n.fiberG)}</td><td>${fmtNum(n.fatG)}</td><td>${fmtNum(n.saturatedFatG)}</td></tr></table>
    <h3>Alertes</h3><ul>${alerts || '<li>Aucune</li>'}</ul>
    <h3>Identité</h3><ul>${decisions}</ul>
  </article>`;
}

function renderHtml(report) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Pilote 6 aliments</title>
<style>body{font:15px/1.45 system-ui;margin:24px;background:#f6f6f3;color:#222}.food{background:#fff;border:1px solid #ddd;border-radius:8px;padding:16px;margin:16px 0}.status{font-weight:700}.error{color:#9d2d27;font-weight:700}.warning{color:#835d12;font-weight:700}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:4px 8px;text-align:left}</style>
</head><body>
<h1>Lot pilote nutritionnel — 6 aliments</h1>
<p><strong>${esc(report.stats.totalOpenErrors)}</strong> ERROR ouvertes · <strong>${esc(report.dataset.foodCount)}</strong> aliments en banque · protégés <strong>${esc(report.scopeGuardBaseline.protectedFoodCount)}</strong></p>
<p>Hash banque : <code>${esc(report.dataset.dataHash)}</code></p>
<p>Hash protégés : <code>${esc(report.scopeGuardBaseline.protectedFoodsDataHash)}</code></p>
${report.foods.map(renderFoodHtml).join('\n')}
</body></html>`;
}

function main() {
  const payload = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const audit = auditDataset(payload.foods);
  const foods = (config.allowedFoodIds || []).map((id) => {
    const food = payload.foods.find((item) => item.id === id);
    if (!food) throw new Error(`Pilot food missing: ${id}`);
    return buildFoodReport(food, audit.byId[id]);
  });
  const baseline = buildPilotBaseline(payload.foods, config.allowedFoodIds);
  const stats = summarizePilotOpenAlerts(foods);
  const report = {
    reportType: 'nutrition-pilot-6-foods',
    generatedAt: new Date().toISOString(),
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
    foods,
  };
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(HTML_OUT, renderHtml(report), 'utf8');
  console.log(JSON.stringify({ ok: true, json: JSON_OUT, html: HTML_OUT, stats }, null, 2));
}

main();
