/**
 * Dual-brand (KR Kinetics × Elevate Fitness) patches for the coach calculator.
 * Applied after science UI patches so exclusive PDF branding and header logos survive rebuilds.
 */

function mustReplace(html, pattern, replacement, label) {
  if (!pattern.test(html)) {
    throw new Error(`Dual-brand patch failed: missing ${label}`);
  }
  return html.replace(pattern, replacement);
}

const DUAL_HEADER_CSS = `.header-logo.kr-logo,
        .header-logo.elevate-logo {
            flex: 0 0 315px;
        }
        .header-logo.kr-logo {
            display: flex;
            align-items: center;
            justify-content: flex-start;
        }
        .header-logo.kr-logo img {
            max-height: 112px;
            max-width: 315px;
        }
        .header-title-container {
            flex: 1;
            text-align: center;
            padding: 0 20px;
        }
        .header-title-container h1 {
            color: #ffffff;
            margin: 0 0 5px 0;
            padding: 0;
            border: none;
            letter-spacing: 1.15px;
            font-size: 1.55rem;
            text-shadow: 0 2px 12px rgba(0,0,0,0.22);
        }
        .collab-badge {
            font-size: 0.82rem;
            font-weight: 700;
            color: #cbd8eb;
            text-transform: uppercase;
            letter-spacing: 1px;
            white-space: nowrap;
        }
        .header-logo.elevate-logo {
            width: 315px;
            height: 138px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            border-radius: 12px;
            background: #050505;
            box-shadow: 0 8px 22px rgba(0,0,0,0.28);
        }
        .header-logo.elevate-logo img {
            width: 100%;
            height: 100%;
            max-height: none;
            object-fit: contain;
            border-radius: 0;
        }

        @media (max-width: 1120px) {
            .header-logo.kr-logo,
            .header-logo.elevate-logo { flex-basis: 245px; }
            .header-logo.kr-logo img { max-width: 245px; }
            .header-logo.elevate-logo { width:245px; height:122px; }
            .header-title-container { padding:0 12px; }
            .header-title-container h1 { font-size:1.28rem; }
            .collab-badge { font-size:0.72rem; letter-spacing:0.65px; }
        }
`;

export function buildDualBrandRuntime() {
  return "<script id=\"dual-brand-professional-corrections\">\n// Corrections client 2026-08-01: marques exclusives, tolérances, libellés et réconciliation.\nconst PDF_BRANDS = Object.freeze({\n    kr: Object.freeze({\n        key: 'kr', label: 'KR Kinetics', slug: 'KR_Kinetics',\n        logo: window.KR_PDF_LOGO_HORIZONTAL_DATA_URI,\n        logoAlt: 'KR Kinetics', guide: './guides/kr-kinetics-equivalents-client-fr.pdf'\n    }),\n    elevate: Object.freeze({\n        key: 'elevate', label: 'Elevate Fitness', slug: 'Elevate_Fitness',\n        logo: window.ELEVATE_PDF_LOGO_DATA_URI,\n        logoAlt: 'Elevate Fitness', guide: './guides/elevate-fitness-equivalents-client-fr.pdf'\n    })\n});\n\nfunction getSelectedPdfBrand() {\n    return pdfCreator === 'elevate' ? PDF_BRANDS.elevate : PDF_BRANDS.kr;\n}\n\nfunction updateGuideBrandLink() {\n    const brand = getSelectedPdfBrand();\n    const link = document.getElementById('btn-guide-pdf');\n    if (!link) return;\n    link.href = brand.guide;\n    link.textContent = '📄 Tableau des équivalents (PDF — ' + brand.label + ')';\n}\n\nchoisirPdfCreator = function (creator) {\n    pdfCreator = creator === 'elevate' ? 'elevate' : 'kr';\n    document.getElementById('creator-btn-kr').classList.toggle('active', pdfCreator === 'kr');\n    document.getElementById('creator-btn-elevate').classList.toggle('active', pdfCreator === 'elevate');\n    updateGuideBrandLink();\n    if (document.getElementById('output-plan').value.trim()) genererPlanTextuel();\n};\n\nObject.assign(PDF_LABELS.fr, {\n    subtitle: 'Évaluation des habitudes & planification alimentaire',\n    macroRatio: 'Répartition des macronutriments',\n    macroChartTitle: 'Répartition des macronutriments',\n    targetCalories: 'Cible alimentaire (macros arrondies)',\n    banqueNote: 'Portions sélectionnées (moyennes)',\n    hydration: 'Cible initiale de liquides',\n    varianceOrigin: 'Tolérance coach : ±2 % pour l\\'\\u00e9nergie et ±6 % par macro. Les petits écarts proviennent des moyennes et des arrondis.',\n    brandBy: 'Préparé par',\n    withinTolerance: 'dans la tolérance',\n    scopeNotice: 'Structure alimentaire destinée à une personne généralement en santé; elle ne remplace pas un avis médical ou un traitement nutritionnel clinique.'\n});\nObject.assign(PDF_LABELS.en, {\n    subtitle: 'Eating habits assessment & meal planning',\n    macroRatio: 'Macronutrient distribution',\n    macroChartTitle: 'Macronutrient distribution',\n    targetCalories: 'Meal target (rounded macros)',\n    banqueNote: 'Selected portions (averages)',\n    hydration: 'Initial fluid target',\n    varianceOrigin: 'Coach tolerance: ±2% energy and ±6% per macro. Small variances come from averages and rounding.',\n    brandBy: 'Prepared by',\n    withinTolerance: 'within tolerance',\n    scopeNotice: 'Meal structure intended for a generally healthy person; it does not replace medical advice or clinical nutrition treatment.'\n});\n\nfunction macroPercentagesFromTargets(target) {\n    const total = kcalFromMacros(target.pro || 0, target.glu || 0, target.lip || 0);\n    if (!total) return { pro: 0, glu: 0, lip: 0 };\n    const pro = Math.round((target.pro * 4 / total) * 100);\n    const glu = Math.round((target.glu * 4 / total) * 100);\n    return { pro, glu, lip: Math.max(0, 100 - pro - glu) };\n}\n\nfunction getClientMacroDistributionLabel(snapshot) {\n    const p = macroPercentagesFromTargets(snapshot.targets || {});\n    if (pdfLang === 'en') return p.pro + '% protein · ' + p.glu + '% carbs · ' + p.lip + '% fat';\n    return p.pro + ' % protéines · ' + p.glu + ' % glucides · ' + p.lip + ' % lipides';\n}\n\n// Preserve raw exchange precision for calories; round grams only for display.\ncomputeBanqueTotalsFromData = function (banque) {\n    let proRaw = 0, gluRaw = 0, lipRaw = 0;\n    CATS.forEach(function (cat) {\n        const value = parseFloat(banque[cat]) || 0;\n        proRaw += value * MOYENNES[cat].p;\n        gluRaw += value * MOYENNES[cat].g;\n        lipRaw += value * MOYENNES[cat].l;\n    });\n    return {\n        pro: Math.round(proRaw),\n        glu: Math.round(gluRaw),\n        lip: Math.round(lipRaw),\n        kcal: kcalFromMacros(proRaw, gluRaw, lipRaw)\n    };\n};\n\nfunction withinCoachTolerance(target, actual) {\n    const energyTolerance = Math.max(50, Math.round((target.kcal || 0) * 0.02));\n    const macroTolerance = function (value) { return Math.max(5, Math.round((value || 0) * 0.06)); };\n    return Math.abs((actual.kcal || 0) - (target.kcal || 0)) <= energyTolerance &&\n        Math.abs((actual.pro || 0) - (target.pro || 0)) <= macroTolerance(target.pro) &&\n        Math.abs((actual.glu || 0) - (target.glu || 0)) <= macroTolerance(target.glu) &&\n        Math.abs((actual.lip || 0) - (target.lip || 0)) <= macroTolerance(target.lip);\n}\n\nevaluerJourData = function (jourKey) {\n    const jourData = joursData[jourKey] || createEmptyJourData();\n    const jourTargets = computeTargetsForJour(jourKey);\n    const errors = [], warnings = [];\n    if (jourTargets.kcal === 0) errors.push('Profil incomplet (cibles).');\n    let banqueTotal = 0;\n    CATS.forEach(function (cat) { banqueTotal += parseFloat(jourData.banque[cat]) || 0; });\n    if (banqueTotal === 0) errors.push('Banque vide.');\n    const banqueTotals = computeBanqueTotalsFromData(jourData.banque);\n    if (jourTargets.kcal > 0 && banqueTotal > 0 && !withinCoachTolerance(jourTargets, banqueTotals)) {\n        warnings.push('Écart banque/cibles au-delà de la tolérance coach.');\n    }\n    const restants = [];\n    CATS.forEach(function (cat) {\n        const cible = parseFloat(jourData.banque[cat]) || 0;\n        let sum = 0;\n        for (let meal = 0; meal < MEAL_COUNT; meal++) sum += getRepValueFromData(jourData.repartition, meal, cat);\n        const restant = Math.round((cible - sum) * 10) / 10;\n        if (cible > 0 && restant !== 0) restants.push(NOMS_COURTS[cat]);\n    });\n    if (restants.length) errors.push('Répartition incomplète (' + restants.join(', ') + ').');\n    let hasMealFood = false;\n    for (let i = 0; i < MEAL_COUNT * CATS.length; i++) {\n        if ((parseFloat(jourData.repartition[i]) || 0) > 0) hasMealFood = true;\n    }\n    if (banqueTotal > 0 && !hasMealFood) errors.push('Repas non distribués.');\n    return { jourKey, errors, warnings, canExport: errors.length === 0 && hasMealFood && banqueTotal > 0 };\n};\n\nreconcilePlanTotalsFromSnapshot = function (snapshot) {\n    const target = snapshot.targets || { kcal: 0, pro: 0, glu: 0, lip: 0 };\n    const banque = snapshot.banqueTotals || { kcal: 0, pro: 0, glu: 0, lip: 0 };\n    const planned = {\n        pro: snapshot.totalPro || 0, glu: snapshot.totalGlu || 0,\n        lip: snapshot.totalLip || 0, kcal: snapshot.totalKcal || 0\n    };\n    const variance = {\n        kcal: planned.kcal - target.kcal,\n        pro: planned.pro - target.pro,\n        glu: planned.glu - target.glu,\n        lip: planned.lip - target.lip\n    };\n    return { target, banque, planned, variance, withinThreshold: withinCoachTolerance(target, planned) };\n};\n\nconst professionalPdfStylesBase = getPDFStylesCSS;\ngetPDFStylesCSS = function () {\n    return professionalPdfStylesBase()\n        + '.pdf-totals{bottom:54px;}'\n        + '.pdf-scope-note{position:absolute;left:28px;right:28px;bottom:29px;font-size:7.5px;line-height:1.25;color:#64748b;text-align:center;padding:0 18px;overflow-wrap:anywhere;}'\n        + '.pdf-footer{bottom:10px;padding-top:4px;}'\n        + '.pdf-a4-page.brand-elevate .pdf-brand-header{background:#050505;color:#fff;}'\n        + '.pdf-a4-page.brand-elevate .pdf-brand-rule{background:#D4A94F;}'\n        + '.pdf-a4-page.brand-elevate .pdf-brand-header-logo{max-width:170px;height:56px;background:#050505;border-radius:4px;overflow:hidden;}'\n        + '.pdf-a4-page.brand-elevate .pdf-brand-header-logo img{width:150px;height:54px;max-width:150px;max-height:54px;object-fit:cover;object-position:center;filter:none;}'\n        + '.pdf-a4-page.brand-elevate .pdf-brand-subtitle{color:#E8D39B;}'\n        + '.pdf-a4-page.brand-elevate .pdf-section{border-left-color:#D4A94F;color:#171717;}'\n        + '.pdf-a4-page.brand-elevate .meal-box{border-left-color:#D4A94F;}'\n        + '.pdf-a4-page.brand-elevate .pdf-recon-title,.pdf-a4-page.brand-elevate .pdf-totals{background:#111;color:#fff;}'\n        + '.pdf-a4-page.brand-elevate .val-blue{color:#9A6A13;}'\n        + '.pdf-a4-page.brand-elevate .pdf-pie-legend .dot-pro{background:#D4A94F;}'\n        + '.pdf-a4-page.brand-elevate .pdf-footer{color:#5f4310;}';\n};\n\nbuildPdfHeaderLogoHtml = function (creator) {\n    const brand = creator === 'elevate' ? PDF_BRANDS.elevate : PDF_BRANDS.kr;\n    return '<img src=\"' + brand.logo + '\" alt=\"' + brand.logoAlt + '\">';\n};\n\nfunction cleanProfessionalPdfText(value) {\n    return String(value == null ? '' : value)\n        .replace(/[\\u{1F4AA}\\u{1F6CC}\\u{1F305}\\u{2615}\\u{1F37D}\\u{1F34E}\\u{1F969}\\u{1F319}\\u{FE0F}]/gu, '')\n        .replace(/\\s{2,}/g, ' ')\n        .replace(/>\\s+</g, '><')\n        .trim();\n}\n\nbuildPDFInfoGrid = function (snapshot, nom, dateStr, ratioText, goalLabel) {\n    const l = PDF_LABELS[pdfLang];\n    const r = reconcilePlanTotalsFromSnapshot(snapshot);\n    const timingRow = snapshot.timing.active\n        ? '<tr><td class=\"info-label\">' + l.training + '</td><td><strong>' + snapshot.timing.heureLabel + '</strong> — ' + snapshot.timing.summary + '</td></tr>'\n        : '';\n    const variancePercent = r.target.kcal > 0 ? Math.round((r.variance.kcal / r.target.kcal) * 1000) / 10 : 0;\n    const varianceTxt = formatSignedDelta(r.variance.kcal, ' kcal') + ' (' + formatSignedDelta(variancePercent, ' %') + ')'\n        + ' · ' + formatSignedDelta(r.variance.pro, 'g ') + l.pro\n        + ' · ' + formatSignedDelta(r.variance.glu, 'g ') + l.glu\n        + ' · ' + formatSignedDelta(r.variance.lip, 'g ') + l.lip\n        + (r.withinThreshold ? ' — ' + l.withinTolerance : '');\n    const varianceClass = r.withinThreshold ? 'var-ok' : 'var-warn';\n    return '<div class=\"info-grid\">'\n        + '<table class=\"info-table\"><tbody>'\n        + '<tr><td class=\"info-label\">' + l.athlete + '</td><td>' + nom + '</td></tr>'\n        + '<tr><td class=\"info-label\">' + l.date + '</td><td>' + dateStr + '</td></tr>'\n        + '<tr><td class=\"info-label\">' + l.energyGoal + '</td><td>' + goalLabel + '</td></tr>'\n        + '<tr><td class=\"info-label\">' + l.dayType + '</td><td>' + snapshot.jourLabel + '</td></tr>'\n        + timingRow\n        + '<tr><td class=\"info-label\">' + l.macroRatio + '</td><td>' + ratioText + '</td></tr>'\n        + '</tbody></table>'\n        + '<div class=\"pdf-recon\"><div class=\"pdf-recon-title\">' + l.reconciliationTitle + '</div><table><tbody>'\n        + '<tr><td class=\"info-label\">' + l.targetCalories + '</td><td class=\"val-blue\">' + r.target.kcal + ' kcal</td></tr>'\n        + '<tr><td class=\"info-label\">' + l.targetMacros + '</td><td>' + formatSnapshotMacros(r.target.pro, r.target.glu, r.target.lip) + '</td></tr>'\n        + '<tr><td class=\"info-label\">' + l.plannedCalories + '</td><td><strong>' + r.planned.kcal + ' kcal</strong></td></tr>'\n        + '<tr><td class=\"info-label\">' + l.plannedMacros + '</td><td>' + formatSnapshotMacros(r.planned.pro, r.planned.glu, r.planned.lip) + '</td></tr>'\n        + '<tr><td class=\"info-label\">' + l.varianceLabel + '</td><td class=\"' + varianceClass + '\">' + varianceTxt + '</td></tr>'\n        + '<tr><td class=\"info-label\">' + l.banqueNote + '</td><td>' + r.banque.kcal + ' kcal · ' + formatSnapshotMacros(r.banque.pro, r.banque.glu, r.banque.lip) + '</td></tr>'\n        + '<tr><td class=\"info-label\">' + l.hydration + '</td><td><span class=\"val-cyan\">' + formatEau(snapshot.eau.total) + ' ' + l.perDay + '</span> — ' + snapshot.eauDetail + '</td></tr>'\n        + '</tbody></table><div class=\"pdf-recon-note\">' + l.varianceOrigin + '</div></div></div>';\n};\n\nbuildClientPDFPageHTML = function (snapshot, nom, dateStr, ratioText, goalLabel, isFirstPage) {\n    snapshot = Object.assign({}, snapshot, {\n        jourLabel: cleanProfessionalPdfText(snapshot.jourLabel),\n        portionsLeft: cleanProfessionalPdfText(snapshot.portionsLeft),\n        portionsRight: cleanProfessionalPdfText(snapshot.portionsRight)\n    });\n    const brand = getSelectedPdfBrand();\n    const l = PDF_LABELS[pdfLang];\n    const actualRatio = getClientMacroDistributionLabel(snapshot);\n    const dayLine = isFirstPage ? '' : '<div class=\"pdf-brand-day\">' + snapshot.jourLabel + '</div>';\n    const header = '<div class=\"pdf-brand-header\"><div class=\"pdf-brand-header-logo\">'\n        + buildPdfHeaderLogoHtml(brand.key) + '</div><div class=\"pdf-brand-copy\"><div class=\"pdf-brand-title\">' + l.mainTitle + '</div>'\n        + '<div class=\"pdf-brand-subtitle\">' + l.subtitle + ' — ' + l.brandBy + ' ' + brand.label + '</div>' + dayLine + '</div></div>'\n        + '<div class=\"pdf-brand-rule\"></div>';\n    const notes = getCoachNotes();\n    return '<div class=\"pdf-a4-page brand-' + brand.key + '\">' + header\n        + buildPDFInfoGrid(snapshot, nom, dateStr, actualRatio, goalLabel)\n        + '<div class=\"pdf-section\">' + l.portionsSection + '</div>'\n        + '<div class=\"pdf-page-body\"><div class=\"meals-grid\"><div class=\"meals-col\">' + snapshot.portionsLeft\n        + '</div><div class=\"meals-col\">' + snapshot.portionsRight + '</div></div>'\n        + buildCoachNotesHtml(notes) + buildMacroChartHtml(snapshot) + '</div>'\n        + '<div class=\"pdf-totals\">' + formatSnapshotTotals(snapshot) + '</div>'\n        + '<div class=\"pdf-scope-note\">' + l.scopeNotice + '</div>'\n        + '<div class=\"pdf-footer\">' + cleanProfessionalPdfText(l.footer) + '</div></div>';\n};\n\ngenererPlanTextuel = function () {\n    captureJourActif();\n    const l = PDF_LABELS[pdfLang];\n    const brand = getSelectedPdfBrand();\n    const nom = document.getElementById('nom_athlete').value.trim() || l.planUnspecified;\n    const activeGoal = document.querySelector('.goal-card.active .goal-title');\n    const kg = getPoidsKg();\n    const snapEnt = getJourSnapshot('entrainement');\n    const proKg = kg > 0 ? (snapEnt.targets.pro / kg).toFixed(1) : '0';\n    const goalLabel = translateGoalLabelForPdf(activeGoal ? activeGoal.textContent : '--');\n    const ratioLabel = getClientMacroDistributionLabel(snapEnt);\n    let plan = '==============================================\\n';\n    plan += l.mainTitle + '\\n';\n    plan += '==============================================\\n\\n';\n    plan += l.athlete.padEnd(18) + ': ' + nom + '\\n';\n    plan += l.date.padEnd(18) + ': ' + getPdfDateString(pdfLang) + '\\n';\n    plan += l.planObjective.padEnd(18) + ': ' + goalLabel + '\\n';\n    plan += l.brandBy.padEnd(18) + ': ' + brand.label + '\\n';\n    plan += l.macroRatio.padEnd(18) + ': ' + ratioLabel + '\\n';\n    plan += l.planProteinKg.padEnd(18) + ': ' + proKg + ' g/kg ' + l.planTrainingDay + '\\n';\n    plan += '----------------------------------------------\\n\\n';\n    plan += genererPlanBlocJour(snapEnt);\n    if (jourReposActif && isJourClientPlanConfigured(joursData.repos)) plan += genererPlanBlocJour(getJourSnapshot('repos'));\n    else if (jourReposActif) plan += l.restOmittedNote + '\\n\\n';\n    plan += l.footer + '\\n';\n    document.getElementById('output-plan').value = plan;\n};\n\nexporterPDF = function () {\n    if (!document.getElementById('output-plan').value.trim()) genererPlanTextuel();\n    const l = PDF_LABELS[pdfLang];\n    const brand = getSelectedPdfBrand();\n    const nom = document.getElementById('nom_athlete').value.trim() || l.defaultAthlete;\n    const dateStr = getPdfDateString(pdfLang);\n    const filenameDate = new Date().toISOString().slice(0, 10);\n    const snapEnt = getJourSnapshot('entrainement');\n    const snapRep = getClientPdfRestSnapshot();\n    const expectedPages = snapRep ? 2 : 1;\n    const btn = document.getElementById('btn-export-pdf');\n    const btnLabel = btn.textContent;\n    btn.disabled = true;\n    btn.textContent = '⏳ Génération PDF...';\n    const safeName = nom.replace(/[^a-zA-Z0-9À-ſ_-]+/g, '_');\n    const filename = l.filenamePrefix + '_' + brand.slug + '_' + safeName + '_' + filenameDate + (pdfLang === 'en' ? '_EN' : '') + '.pdf';\n    const html = buildFullPDFHTML(snapEnt, snapRep, nom, dateStr, getMacroRatioLabel(), getActiveGoalLabel());\n    const iframe = creerIframePDF(html);\n    attendreRenduPDF(iframe).then(function () {\n        const doc = iframe.contentWindow.document;\n        const pages = doc.querySelectorAll('.pdf-a4-page');\n        if (pages.length !== expectedPages || doc.body.innerText.trim().length < 30) throw new Error('Structure PDF invalide');\n        assertPdfImagesReady(doc);\n        const text = doc.body.innerText;\n        const bodyHtml = doc.body.innerHTML;\n        if (brand.key === 'elevate' && (/KR Kinetics/i.test(text) || /logo-kr/i.test(bodyHtml))) {\n            throw new Error('Contamination de marque KR détectée dans le PDF Elevate');\n        }\n        if (brand.key === 'kr' && (/Elevate Fitness/i.test(text) || /logo-elevate/i.test(bodyHtml))) {\n            throw new Error('Contamination de marque Elevate détectée dans le PDF KR');\n        }\n        return genererPDFNatif(pages, filename);\n    }).then(function () {\n        nettoyerIframePDF();\n        btn.disabled = false;\n        btn.textContent = btnLabel;\n    }).catch(function (error) {\n        console.error(error);\n        nettoyerIframePDF();\n        btn.disabled = false;\n        btn.textContent = btnLabel;\n        alert('Erreur PDF : ' + (error.message || 'réessayez.'));\n    });\n};\n\ndocument.addEventListener('DOMContentLoaded', function () {\n    updateGuideBrandLink();\n});\n</script>";
}

export function applyDualBrandPatches(html) {
  html = mustReplace(
    html,
    /<title>[^<]*<\/title>/,
    '<title>Calculateur Coach | KR Kinetics × Elevate Fitness</title>',
    'title'
  );

  if (!html.includes('elevate-logo-data.js')) {
    html = mustReplace(
      html,
      /(<script src="\.\/vendor\/html2canvas\.min\.js"><\/script>)/,
      '<script src="./assets/elevate-logo-data.js"></script>\n    $1',
      'elevate logo data script'
    );
  }

  html = mustReplace(
    html,
    /\.header-logo\.kr-logo img \{[\s\S]*?\.header-logo:not\(\.kr-logo\) img \{[^}]+\}/,
    DUAL_HEADER_CSS.trimEnd(),
    'header dual-brand css'
  );

  html = mustReplace(
    html,
    /@media \(max-width: 768px\) \{[\s\S]*?\.collab-badge \{[^}]+\}\s*\}/,
    `@media (max-width: 768px) {
            .grid-2, .grid-4, .grid-5 { grid-template-columns: 1fr; }
            .app-header { flex-direction: column; gap: 10px; text-align: center; padding: 22px 18px; min-height:0; }
            .header-logo img { max-height: 72px; }
            .header-logo.kr-logo, .header-logo.elevate-logo { flex-basis:auto; }
            .header-logo.kr-logo { justify-content:center; }
            .header-logo.kr-logo img { max-height: 86px; max-width: 270px; }
            .header-logo.elevate-logo { display:flex; width:250px; height:132px; }
            .header-title-container h1 { font-size: 1.2rem; }
            .collab-badge { font-size:0.76rem; letter-spacing:1px; white-space:normal; }
        }`,
    'mobile dual-brand header'
  );

  html = mustReplace(
    html,
    /<div class="collab-badge">[^<]*<\/div>/,
    '<div class="collab-badge">Outil coach · KR Kinetics × Elevate Fitness</div>',
    'collab badge'
  );

  html = mustReplace(
    html,
    /<div class="header-logo">\s*<img[^>]*>\s*<\/div>\s*<\/header>/,
    `<div class="header-logo elevate-logo">
        <img src="./assets/logo-elevate-fitness.jpg" alt="Elevate Fitness">
    </div>
</header>`,
    'elevate header logo'
  );

  if (html.includes('dual-brand-professional-corrections')) {
    throw new Error('Dual-brand runtime already present');
  }
  const bodyClose = html.lastIndexOf('</body>');
  if (bodyClose === -1) throw new Error('Cannot inject dual-brand runtime');
  html = `${html.slice(0, bodyClose)}${buildDualBrandRuntime()}\n${html.slice(bodyClose)}`;

  if (!html.includes('elevate-logo') || !html.includes('getSelectedPdfBrand') || !html.includes('ELEVATE_PDF_LOGO_DATA_URI')) {
    throw new Error('Dual-brand patch incomplete');
  }
  return html;
}
