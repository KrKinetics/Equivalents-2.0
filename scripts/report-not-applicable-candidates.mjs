/**
 * Suggest preparationState = not_applicable candidates.
 * Does NOT apply changes automatically.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'src', 'data', 'food-equivalents.json');
const OUT = path.join(ROOT, 'reports', 'preparation-not-applicable-candidates.json');

function main() {
  const foods = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')).foods || [];
  const candidates = [];
  for (const f of foods) {
    if (f.portion?.preparationState) continue;
    const hay = `${f.portion?.labelFr} ${f.portion?.labelEn} ${f.names?.fr} ${f.names?.en}`.toLowerCase();
    let reason = null;
    if (/huile|oil|vinaigrette|mayonnaise|margarine|mct/.test(hay)) reason = 'oil_or_fat_condiment';
    else if (/scoop|poudre|powder|whey|cas[eé]ine|isolat|collagène|collagen|pb2/.test(hay)) reason = 'powder_or_supplement';
    else if (/rtd|core power|fairlife|egglife|embouteille|ready-to-drink/.test(hay)) reason = 'ready_to_consume_packaged';
    else if (/chocolat|chocolate|olives/.test(hay)) reason = 'packaged_ready_food';
    if (reason) {
      candidates.push({
        id: f.id,
        nameFr: f.names?.fr,
        labelFr: f.portion?.labelFr,
        suggestedPreparationState: 'not_applicable',
        reason,
        note: 'Suggestion seulement — approbation manuelle requise',
      });
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    missingPrepStateTotal: foods.filter((f) => !f.portion?.preparationState).length,
    candidateCount: candidates.length,
    note: 'Ne pas supprimer automatiquement les WARNING existants. Chaque changement doit être approuvé manuellement.',
    candidates,
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log('Wrote', OUT, `(${candidates.length} candidates / ${report.missingPrepStateTotal} missing)`);
}

main();
