/**
 * Audit food-equivalents.json — NEVER modifies nutrient values.
 * Produces HTML / CSV / JSON reports and refreshes review data embed.
 */
import fs from 'fs';
import path from 'path';
import { auditDataset } from '../src/lib/food-audit-core.mjs';
import { calculateAllGroupStatistics } from '../src/lib/group-statistics.mjs';
import { computeFoodsDataHash, shortHash } from '../src/lib/data-hash.mjs';
import { getFoodStatus, isVerifiedFood } from '../src/lib/food-status.mjs';
import { resolvePaths } from '../src/lib/paths.mjs';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildHtml(report) {
  const rows = report.items
    .map((item) => {
      const alertText = item.alerts
        .map((a) => {
          const res = a.resolutionStatus === 'resolved_documented' ? ' [résolue et documentée]' : '';
          return `[${a.severity}] ${a.code}: ${a.message}${res}`;
        })
        .join(' | ');
      return `<tr data-severity="${esc(item.maxSeverity)}" data-cat="${esc(item.displayCategory)}" data-group="${esc(item.calculationGroup)}" data-status="${esc(item.status)}">
      <td>${esc(item.maxSeverity)}</td>
      <td>${item.errorCount}</td>
      <td>${item.warningCount}</td>
      <td>${esc(item.displayCategory)}</td>
      <td>${esc(item.calculationGroup)}</td>
      <td>${esc(item.nameFr)}</td>
      <td>${esc(item.nameEn)}</td>
      <td>${esc(item.status)}</td>
      <td>${item.declaredKcal ?? ''}</td>
      <td>${item.calculatedKcal == null ? '' : item.calculatedKcal.toFixed(1)}</td>
      <td>${item.absDiff == null ? '' : item.absDiff.toFixed(1)}</td>
      <td>${item.pctDiff == null ? '' : item.pctDiff.toFixed(1)}</td>
      <td class="alerts">${esc(alertText)}</td>
    </tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8" />
<title>Audit équivalents alimentaires — KR Kinetics</title>
<style>
  :root { --bg:#0f1115; --card:#171a21; --text:#e8eaed; --muted:#9aa0a6; --line:#2a2f3a; --err:#ff6b6b; --warn:#ffd166; --ok:#7dcea0; }
  body { margin:0; font-family: system-ui, sans-serif; background:var(--bg); color:var(--text); }
  header { padding:24px 28px; border-bottom:1px solid var(--line); }
  h1 { margin:0 0 8px; font-size:22px; }
  .meta { color:var(--muted); font-size:13px; }
  .stats { display:flex; flex-wrap:wrap; gap:12px; padding:16px 28px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 14px; min-width:140px; }
  .stat b { display:block; font-size:20px; }
  .stat span { color:var(--muted); font-size:12px; }
  .controls { padding:0 28px 16px; display:flex; flex-wrap:wrap; gap:10px; }
  input, select { background:#10131a; color:var(--text); border:1px solid var(--line); border-radius:8px; padding:8px 10px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { border-bottom:1px solid var(--line); padding:8px 10px; vertical-align:top; text-align:left; }
  th { position:sticky; top:0; background:#12151c; cursor:pointer; }
  tr[data-severity="ERROR"] td:first-child { color:var(--err); font-weight:700; }
  tr[data-severity="WARNING"] td:first-child { color:var(--warn); font-weight:700; }
  tr[data-severity="OK"] td:first-child { color:var(--ok); }
  .alerts { max-width:420px; color:var(--muted); }
  .wrap { padding:0 12px 40px; overflow:auto; }
  .note { padding:0 28px 20px; color:var(--muted); font-size:13px; }
</style></head><body>
<header>
  <h1>Audit — équivalents alimentaires</h1>
  <div class="meta">Version ${esc(report.version.version)} · ${esc(report.version.status)} · hash ${esc(report.version.shortHash || '')} · généré ${esc(report.generatedAt)} · 4-4-9 = contrôle seulement</div>
</header>
<section class="stats">
  <div class="stat"><b>${report.summary.totalFoods}</b><span>Aliments</span></div>
  <div class="stat"><b>${report.summary.foodsWithBlockingErrors}</b><span>Aliments avec ERROR</span></div>
  <div class="stat"><b>${report.summary.blockingErrorCount}</b><span>Alertes ERROR (count)</span></div>
  <div class="stat"><b>${report.summary.foodsWithWarnings}</b><span>Aliments WARNING</span></div>
  <div class="stat"><b>${report.summary.warningCount}</b><span>Alertes WARNING (count)</span></div>
  <div class="stat"><b>${report.summary.auditCleanFoods}</b><span>Audit clean</span></div>
  <div class="stat"><b>${report.summary.verifiedFoods}</b><span>Verified</span></div>
</section>
<p class="note">Cet audit ne modifie jamais les nutriments. Les résolutions documentées restent visibles comme « résolue et documentée ».</p>
<div class="controls">
  <input id="q" placeholder="Rechercher…" size="32" />
  <select id="sev"><option value="">Gravité</option><option>ERROR</option><option>WARNING</option><option>OK</option></select>
  <select id="cat"><option value="">Catégorie</option>${[...new Set(report.items.map((i) => i.displayCategory))].map((c) => `<option>${esc(c)}</option>`).join('')}</select>
  <select id="group"><option value="">Groupe</option>${[...new Set(report.items.map((i) => i.calculationGroup))].map((c) => `<option>${esc(c)}</option>`).join('')}</select>
  <select id="status"><option value="">Statut</option><option>unverified</option><option>verified</option><option>rejected</option></select>
</div>
<div class="wrap"><table id="tbl"><thead><tr>
  <th data-k="maxSeverity">Gravité</th><th data-k="errorCount">#E</th><th data-k="warningCount">#W</th>
  <th data-k="displayCategory">Catégorie</th><th data-k="calculationGroup">Groupe</th>
  <th data-k="nameFr">FR</th><th data-k="nameEn">EN</th><th data-k="status">Statut</th>
  <th data-k="declaredKcal">kcal</th><th data-k="calculatedKcal">Atwater</th>
  <th data-k="absDiff">Δ</th><th data-k="pctDiff">Δ%</th><th>Alertes</th>
</tr></thead><tbody>${rows}</tbody></table></div>
<script>
const rows=[...document.querySelectorAll('#tbl tbody tr')];
const data=${JSON.stringify(report.items.map((i)=>({maxSeverity:i.maxSeverity,errorCount:i.errorCount,warningCount:i.warningCount,displayCategory:i.displayCategory,calculationGroup:i.calculationGroup,nameFr:i.nameFr,nameEn:i.nameEn,status:i.status,declaredKcal:i.declaredKcal,calculatedKcal:i.calculatedKcal,absDiff:i.absDiff,pctDiff:i.pctDiff})))};
function applyFilters(){const q=document.getElementById('q').value.toLowerCase();const sev=document.getElementById('sev').value;const cat=document.getElementById('cat').value;const group=document.getElementById('group').value;const status=document.getElementById('status').value;rows.forEach(tr=>{const text=tr.innerText.toLowerCase();tr.style.display=(!q||text.includes(q))&&(!sev||tr.dataset.severity===sev)&&(!cat||tr.dataset.cat===cat)&&(!group||tr.dataset.group===group)&&(!status||tr.dataset.status===status)?'':'none';});}
['q','sev','cat','group','status'].forEach(id=>document.getElementById(id).addEventListener('input',applyFilters));
let sortKey='errorCount',asc=false;
document.querySelectorAll('th[data-k]').forEach(th=>th.addEventListener('click',()=>{const k=th.dataset.k;if(sortKey===k)asc=!asc;else{sortKey=k;asc=true;}const indexed=rows.map((tr,i)=>({tr,i,v:data[i][k]}));indexed.sort((a,b)=>{const av=a.v,bv=b.v;if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return-1;if(typeof av==='number'&&typeof bv==='number')return asc?av-bv:bv-av;return asc?String(av).localeCompare(String(bv)):String(bv).localeCompare(String(av));});const tb=document.querySelector('#tbl tbody');indexed.forEach(({tr})=>tb.appendChild(tr));}));
</script></body></html>`;
}

function main() {
  const paths = resolvePaths();
  const {
    foodDataPath,
    groupsPath,
    versionDataPath,
    reportsDir,
    reviewDataPath,
  } = paths;
  if (!fs.existsSync(foodDataPath)) {
    console.error('Missing food-equivalents.json — run npm run data:bootstrap once (or --force after backup).');
    process.exit(1);
  }
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(path.dirname(reviewDataPath), { recursive: true });

  // Read-only on nutrients: we only rewrite reports + version metadata counters/hash
  const rawBefore = fs.readFileSync(foodDataPath, 'utf8');
  const payload = JSON.parse(rawBefore);
  const foodsSnapshot = JSON.stringify(payload.foods.map((f) => f.nutrients));
  const groupsDoc = JSON.parse(fs.readFileSync(groupsPath, 'utf8'));

  let version = {
    version: '1.0.0',
    status: 'draft',
    createdAt: new Date().toISOString(),
    approvedAt: null,
    approvedBy: null,
  };
  if (fs.existsSync(versionDataPath)) {
    version = { ...version, ...JSON.parse(fs.readFileSync(versionDataPath, 'utf8')) };
  }

  const audited = auditDataset(payload.foods);
  const hash = computeFoodsDataHash(payload.foods);
  const oldHash = version.dataHash;
  const hashChanged = oldHash !== hash;

  const previousStatus = version.status;
  if (previousStatus === 'approved' && hashChanged) {
    version.status = 'review';
    version.approvedAt = null;
    version.approvedBy = null;
  }
  const approvalBlockingErrorCount = audited.summary.activeBlockingErrorCount;
  if (approvalBlockingErrorCount > 0) {
    version.status = 'draft';
  } else if (version.status !== 'approved') {
    version.status = 'review';
  }
  if (version.status !== 'approved') {
    version.approvedAt = null;
    version.approvedBy = null;
  }

  const verifiedFoods = payload.foods.filter((food) => isVerifiedFood(food)).length;
  const foodStatusCounts = payload.foods.reduce((counts, food) => {
    const status = getFoodStatus(food);
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  version.totalFoods = audited.summary.totalFoods;
  version.verifiedFoods = verifiedFoods;
  version.unverifiedFoods = audited.summary.unverifiedFoods;
  version.rejectedFoods = audited.summary.rejectedFoods;
  version.activeFoods = audited.summary.activeFoods;
  version.foodStatusCounts = foodStatusCounts;
  version.blockingErrorCount = audited.summary.blockingErrorCount;
  version.approvalBlockingErrorCount = approvalBlockingErrorCount;
  version.activeBlockingErrorCount = audited.summary.activeBlockingErrorCount;
  version.rejectedBlockingErrorCount = audited.summary.rejectedBlockingErrorCount;
  version.structuralBlockingErrorCount = audited.summary.structuralBlockingErrorCount;
  version.foodsWithBlockingErrors = audited.summary.foodsWithBlockingErrors;
  version.activeFoodsWithBlockingErrors = audited.summary.activeFoodsWithBlockingErrors;
  version.rejectedFoodsWithBlockingErrors = audited.summary.rejectedFoodsWithBlockingErrors;
  version.warningCount = audited.summary.warningCount;
  version.foodsWithWarnings = audited.summary.foodsWithWarnings;
  version.foodsWithWarningsOnly = audited.summary.foodsWithWarningsOnly;
  version.auditCleanFoods = audited.summary.auditCleanFoods;
  version.blockingErrors = audited.summary.blockingErrorCount; // legacy alias
  version.dataHash = hash;
  version.shortHash = shortHash(hash);
  version.lastAuditedAt = new Date().toISOString();
  if (hashChanged) version.lastModifiedAt = version.lastAuditedAt;
  if (!version.changeSummary) version.changeSummary = 'Audit refresh (nutrients unchanged)';

  fs.mkdirSync(path.dirname(versionDataPath), { recursive: true });
  fs.writeFileSync(versionDataPath, JSON.stringify(version, null, 2), 'utf8');
  const groupStats = calculateAllGroupStatistics(payload.foods, groupsDoc, version);

  const decisionsNeeded = [
    {
      id: 'approve-reference-profiles',
      title: 'Approuver les profils de référence des calculationGroups / exchange profiles',
    },
    {
      id: 'fat-total-for-nuts-oils',
      title: 'Définir les lipides totaux pour noix_graines et matieres_grasses',
    },
    {
      id: 'whey-portion-standard',
      title: 'Standardiser la portion whey guide vs calculateur',
    },
    {
      id: 'classification-egg-cheese-hummus-broth',
      title: 'Décider des classifications (œuf, fromage, hummus, bouillon, etc.)',
    },
    {
      id: 'fix-suspect-six',
      title: 'Réviser les cas suspects obligatoires',
    },
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    version,
    summary: audited.summary,
    groupStatistics: groupStats,
    alertCountsByCode: audited.alertCountsByCode,
    decisionsNeeded,
    suspectCases: audited.items
      .filter((i) => i.alerts.some((a) => a.code === 'SUSPECT_CASE'))
      .map((i) => ({
        id: i.id,
        nameFr: i.nameFr,
        nutrients: i.nutrients,
        declaredKcal: i.declaredKcal,
        calculatedKcal: i.calculatedKcal,
        alerts: i.alerts.filter((a) =>
          ['SUSPECT_CASE', 'KCAL_DIFF_HIGH', 'GUIDE_VS_CALCULATOR'].includes(a.code)
        ),
      })),
    items: audited.items,
  };

  fs.writeFileSync(path.join(reportsDir, 'food-equivalents-audit.json'), JSON.stringify(report, null, 2));
  const csvHeader = [
    'severity','errorCount','warningCount','id','displayCategory','calculationGroup','nameFr','nameEn','status',
    'proteinG','carbsG','fiberG','fatG','declaredKcal','calculatedKcal','absDiff','pctDiff','alerts',
  ];
  const csvLines = [csvHeader.join(',')];
  for (const i of audited.items) {
    csvLines.push(
      [
        i.maxSeverity, i.errorCount, i.warningCount, i.id, i.displayCategory, i.calculationGroup,
        i.nameFr, i.nameEn, i.status, i.nutrients.proteinG, i.nutrients.carbsG, i.nutrients.fiberG,
        i.nutrients.fatG, i.declaredKcal, i.calculatedKcal, i.absDiff, i.pctDiff,
        i.alerts.map((a) => `${a.severity}:${a.code}:${a.message}${a.resolutionStatus === 'resolved_documented' ? ':resolved' : ''}`).join(' || '),
      ].map(csvEscape).join(',')
    );
  }
  fs.writeFileSync(path.join(reportsDir, 'food-equivalents-audit.csv'), csvLines.join('\n'));
  fs.writeFileSync(path.join(reportsDir, 'food-equivalents-audit.html'), buildHtml(report));

  // Ensure nutrients untouched
  const rawAfterFoods = JSON.stringify(
    JSON.parse(fs.readFileSync(foodDataPath, 'utf8')).foods.map((f) => f.nutrients)
  );
  if (rawAfterFoods !== foodsSnapshot) {
    console.error('FATAL: audit mutated nutrients — aborting integrity');
    process.exit(99);
  }

  fs.writeFileSync(
    reviewDataPath,
    `window.FOOD_EQUIVALENTS_DATA = ${JSON.stringify(payload)};\n` +
      `window.FOOD_AUDIT_SUMMARY = ${JSON.stringify({
        summary: report.summary,
        alertCountsByCode: report.alertCountsByCode,
        decisionsNeeded: report.decisionsNeeded,
        suspectCases: report.suspectCases,
        version: report.version,
      })};\n`,
    'utf8'
  );

  console.log('Audit complete (nutrients unchanged)');
  console.log(JSON.stringify(report.summary, null, 2));
  console.log('status:', version.status, 'hash:', version.shortHash);
}

main();
