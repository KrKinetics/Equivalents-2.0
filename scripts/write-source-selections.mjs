/**
 * Persist deterministic CNF record selections for the six-food pilot batch.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { selectCnfRecord } from '../src/lib/cnf-selection.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATCH_PATH = path.join(
  ROOT,
  'src',
  'data',
  'approved-batches',
  'pilot-nutrition-validation-6-foods.json'
);
const CNF_PATH = path.join(ROOT, 'src', 'sources', 'normalized', 'cnf-2026-foods.json');
const OUT_PATH = path.join(
  ROOT,
  'src',
  'data',
  'source-selections',
  'pilot-nutrition-validation-6-foods.json'
);

const batch = JSON.parse(fs.readFileSync(BATCH_PATH, 'utf8'));
const cnf = JSON.parse(fs.readFileSync(CNF_PATH, 'utf8')).foods || [];
const selections = [];

for (const entry of batch.foods) {
  if (entry.sourcePlan?.adapter !== 'cnf_2026') {
    selections.push({
      foodId: entry.id,
      adapter: 'manufacturer',
      recordId: entry.manufacturerLabel?.url || null,
      justification: 'Official manufacturer label values from approved batch specification',
    });
    continue;
  }
  const result = selectCnfRecord(cnf, entry.sourcePlan);
  if (!result.ok) {
    console.error(`Selection failed for ${entry.id}: ${result.message}`);
    process.exitCode = 1;
    process.exit(1);
  }
  selections.push({
    foodId: entry.id,
    adapter: 'cnf_2026',
    recordId: String(result.selected.recordId),
    descriptionEn: result.selected.descriptionEn,
    descriptionFr: result.selected.descriptionFr,
    score: result.selected.score,
    per100g: result.selected.per100g,
    justification: entry.sourcePlan.ambiguityRule,
    topCandidates: (result.candidates || []).slice(0, 5).map((c) => ({
      recordId: c.recordId,
      descriptionEn: c.descriptionEn,
      score: c.score,
    })),
  });
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
const payload = {
  batchId: batch.batchId,
  generatedAt: new Date().toISOString(),
  dataset: 'Canadian Nutrient File 2026',
  selections,
};
fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, outPath: OUT_PATH, selections }, null, 2));
