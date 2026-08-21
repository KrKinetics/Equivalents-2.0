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

function mustIncludesReplace(html, find, replacement, label) {
  if (!html.includes(find)) {
    throw new Error(`Dual-brand patch failed: missing ${label}`);
  }
  return html.split(find).join(replacement);
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

const MACRO_OPTIONS_HTML = `<select id="macroRatio" onchange="updateCibles()">
                    <option value="30,40,30">1. Perte légère — restant 57 % G / 43 % L</option>
                    <option value="40,35,25">2. Perte soutenue — restant 58 % G / 42 % L</option>
                    <option value="25,45,30" selected>3. Maintien — restant 60 % G / 40 % L</option>
                    <option value="33,33,33">4. Partage égal du restant — 50 % G / 50 % L</option>
                    <option value="25,50,25">5. Prise légère — restant 67 % G / 33 % L</option>
                    <option value="20,55,25">6. Prise soutenue — restant 69 % G / 31 % L</option>
                    <option value="15,60,25">7. Performance — restant 71 % G / 29 % L</option>
                    <option value="45,35,20">8. Lipides réduits — restant 64 % G / 36 % L</option>
                </select>
                <p class="macro-hint">Les protéines sont fixées d'abord en section 2. Le préréglage répartit ensuite les calories restantes entre glucides et lipides; le PDF affiche les pourcentages réels.</p>`;

const MACRO_PRESET_LABELS_EN_JS = `const MACRO_PRESET_LABELS_EN = {
    '1. Perte légère — restant 57 % G / 43 % L': '1. Light loss — remaining 57% C / 43% F',
    '2. Perte soutenue — restant 58 % G / 42 % L': '2. Sustained loss — remaining 58% C / 42% F',
    '3. Maintien — restant 60 % G / 40 % L': '3. Maintenance — remaining 60% C / 40% F',
    '4. Partage égal du restant — 50 % G / 50 % L': '4. Equal remaining split — 50% C / 50% F',
    '5. Prise légère — restant 67 % G / 33 % L': '5. Light gain — remaining 67% C / 33% F',
    '6. Prise soutenue — restant 69 % G / 31 % L': '6. Sustained gain — remaining 69% C / 31% F',
    '7. Performance — restant 71 % G / 29 % L': '7. Performance — remaining 71% C / 29% F',
    '8. Lipides réduits — restant 64 % G / 36 % L': '8. Reduced fats — remaining 64% C / 36% F'
};`;

export function buildDualBrandRuntime() {
  return `<script id="dual-brand-professional-corrections">
// Corrections client: marques exclusives, tolérances, libellés et réconciliation.
const PDF_BRANDS = Object.freeze({
    kr: Object.freeze({
        key: 'kr', label: 'KR Kinetics', slug: 'KR_Kinetics',
        logo: window.KR_PDF_LOGO_HORIZONTAL_DATA_URI,
        logoAlt: 'KR Kinetics', guide: './guides/kr-kinetics-equivalents-client-fr.pdf'
    }),
    elevate: Object.freeze({
        key: 'elevate', label: 'Elevate Fitness', slug: 'Elevate_Fitness',
        logo: window.ELEVATE_PDF_LOGO_DATA_URI,
        logoAlt: 'Elevate Fitness', guide: './guides/elevate-fitness-equivalents-client-fr.pdf'
    })
});

function getSelectedPdfBrand() {
    return pdfCreator === 'elevate' ? PDF_BRANDS.elevate : PDF_BRANDS.kr;
}

function updateGuideBrandLink() {
    const brand = getSelectedPdfBrand();
    const link = document.getElementById('btn-guide-pdf');
    if (!link) return;
    link.href = brand.guide;
    link.textContent = '📄 Tableau des équivalents (PDF — ' + brand.label + ')';
}

choisirPdfCreator = function (creator) {
    pdfCreator = creator === 'elevate' ? 'elevate' : 'kr';
    document.getElementById('creator-btn-kr').classList.toggle('active', pdfCreator === 'kr');
    document.getElementById('creator-btn-elevate').classList.toggle('active', pdfCreator === 'elevate');
    updateGuideBrandLink();
    if (document.getElementById('output-plan').value.trim()) genererPlanTextuel();
};

Object.assign(PDF_LABELS.fr, {
    subtitle: 'Évaluation des habitudes & planification alimentaire',
    macroRatio: 'Répartition des macronutriments',
    macroChartTitle: 'Répartition des macronutriments',
    targetCalories: 'Cible alimentaire (macros arrondies)',
    banqueNote: 'Portions sélectionnées (moyennes)',
    hydration: 'Cible initiale de liquides',
    varianceOrigin: 'Tolérance coach : ±2 % pour l\\'\\u00e9nergie et ±6 % par macro. Les petits écarts proviennent des moyennes et des arrondis.',
    brandBy: 'Préparé par',
    withinTolerance: 'dans la tolérance',
    scopeNotice: 'Structure alimentaire destinée à une personne généralement en santé; elle ne remplace pas un avis médical ou un traitement nutritionnel clinique.'
});
Object.assign(PDF_LABELS.en, {
    subtitle: 'Eating habits assessment & meal planning',
    macroRatio: 'Macronutrient distribution',
    macroChartTitle: 'Macronutrient distribution',
    targetCalories: 'Meal target (rounded macros)',
    banqueNote: 'Selected portions (averages)',
    hydration: 'Initial fluid target',
    varianceOrigin: 'Coach tolerance: ±2% energy and ±6% per macro. Small variances come from averages and rounding.',
    brandBy: 'Prepared by',
    withinTolerance: 'within tolerance',
    scopeNotice: 'Meal structure intended for a generally healthy person; it does not replace medical advice or clinical nutrition treatment.'
});

macroPercentagesFromGrams = function (pro, glu, lip) {
    const total = kcalFromMacros(pro || 0, glu || 0, lip || 0);
    if (!total) return { pro: 0, glu: 0, lip: 0 };
    const proPct = Math.round(((pro || 0) * 4 / total) * 100);
    const gluPct = Math.round(((glu || 0) * 4 / total) * 100);
    return { pro: proPct, glu: gluPct, lip: Math.max(0, 100 - proPct - gluPct) };
};

function macroPercentagesFromTargets(target) {
    return macroPercentagesFromGrams(target.pro, target.glu, target.lip);
}

computeMacroDistribution = function (snapshot) {
    const p = macroPercentagesFromGrams(snapshot.totalPro, snapshot.totalGlu, snapshot.totalLip);
    const proK = (snapshot.totalPro || 0) * 4;
    const gluK = (snapshot.totalGlu || 0) * 4;
    const lipK = (snapshot.totalLip || 0) * 9;
    return {
        proK: proK, gluK: gluK, lipK: lipK,
        proPct: p.pro, gluPct: p.glu, lipPct: p.lip,
        total: proK + gluK + lipK
    };
};

function getClientMacroDistributionLabel(snapshot) {
    const p = macroPercentagesFromTargets(snapshot.targets || {});
    if (pdfLang === 'en') return p.pro + '% protein · ' + p.glu + '% carbs · ' + p.lip + '% fat';
    return p.pro + ' % protéines · ' + p.glu + ' % glucides · ' + p.lip + ' % lipides';
}

// Preserve raw exchange precision for calories; round grams only for display.
computeBanqueTotalsFromData = function (banque) {
    let proRaw = 0, gluRaw = 0, lipRaw = 0;
    CATS.forEach(function (cat) {
        const value = parseFloat(banque[cat]) || 0;
        proRaw += value * MOYENNES[cat].p;
        gluRaw += value * MOYENNES[cat].g;
        lipRaw += value * MOYENNES[cat].l;
    });
    return {
        pro: Math.round(proRaw),
        glu: Math.round(gluRaw),
        lip: Math.round(lipRaw),
        kcal: kcalFromMacros(proRaw, gluRaw, lipRaw)
    };
};

function withinCoachTolerance(target, actual) {
    const energyTolerance = Math.max(50, Math.round((target.kcal || 0) * 0.02));
    const macroTolerance = function (value) { return Math.max(5, Math.round((value || 0) * 0.06)); };
    return Math.abs((actual.kcal || 0) - (target.kcal || 0)) <= energyTolerance &&
        Math.abs((actual.pro || 0) - (target.pro || 0)) <= macroTolerance(target.pro) &&
        Math.abs((actual.glu || 0) - (target.glu || 0)) <= macroTolerance(target.glu) &&
        Math.abs((actual.lip || 0) - (target.lip || 0)) <= macroTolerance(target.lip);
}

evaluerJourData = function (jourKey) {
    const jourData = joursData[jourKey] || createEmptyJourData();
    const jourTargets = computeTargetsForJour(jourKey);
    const errors = [], warnings = [];
    if (jourTargets.kcal === 0) errors.push('Profil incomplet (cibles).');
    let banqueTotal = 0;
    CATS.forEach(function (cat) { banqueTotal += parseFloat(jourData.banque[cat]) || 0; });
    if (banqueTotal === 0) errors.push('Banque vide.');
    const banqueTotals = computeBanqueTotalsFromData(jourData.banque);
    if (jourTargets.kcal > 0 && banqueTotal > 0 && !withinCoachTolerance(jourTargets, banqueTotals)) {
        warnings.push('Écart banque/cibles au-delà de la tolérance coach.');
    }
    const restants = [];
    CATS.forEach(function (cat) {
        const cible = parseFloat(jourData.banque[cat]) || 0;
        let sum = 0;
        for (let meal = 0; meal < MEAL_COUNT; meal++) sum += getRepValueFromData(jourData.repartition, meal, cat);
        const restant = Math.round((cible - sum) * 10) / 10;
        if (cible > 0 && restant !== 0) restants.push(NOMS_COURTS[cat]);
    });
    if (restants.length) errors.push('Répartition incomplète (' + restants.join(', ') + ').');
    let hasMealFood = false;
    for (let i = 0; i < MEAL_COUNT * CATS.length; i++) {
        if ((parseFloat(jourData.repartition[i]) || 0) > 0) hasMealFood = true;
    }
    if (banqueTotal > 0 && !hasMealFood) errors.push('Repas non distribués.');
    return { jourKey, errors, warnings, canExport: errors.length === 0 && hasMealFood && banqueTotal > 0 };
};

reconcilePlanTotalsFromSnapshot = function (snapshot) {
    const target = snapshot.targets || { kcal: 0, pro: 0, glu: 0, lip: 0 };
    const banque = snapshot.banqueTotals || { kcal: 0, pro: 0, glu: 0, lip: 0 };
    const planned = {
        pro: snapshot.totalPro || 0, glu: snapshot.totalGlu || 0,
        lip: snapshot.totalLip || 0, kcal: snapshot.totalKcal || 0
    };
    const variance = {
        kcal: planned.kcal - target.kcal,
        pro: planned.pro - target.pro,
        glu: planned.glu - target.glu,
        lip: planned.lip - target.lip
    };
    return { target, banque, planned, variance, withinThreshold: withinCoachTolerance(target, planned) };
};

const professionalPdfStylesBase = getPDFStylesCSS;
getPDFStylesCSS = function () {
    return professionalPdfStylesBase()
        + '.pdf-totals{bottom:54px;}'
        + '.pdf-scope-note{position:absolute;left:28px;right:28px;bottom:29px;font-size:7.5px;line-height:1.25;color:#64748b;text-align:center;padding:0 18px;overflow-wrap:anywhere;}'
        + '.pdf-footer{bottom:10px;padding-top:4px;}'
        + '.pdf-a4-page.brand-elevate .pdf-brand-header{background:#050505;color:#fff;}'
        + '.pdf-a4-page.brand-elevate .pdf-brand-rule{background:#D4A94F;}'
        + '.pdf-a4-page.brand-elevate .pdf-brand-header-logo{max-width:170px;height:56px;background:#050505;border-radius:4px;overflow:hidden;}'
        + '.pdf-a4-page.brand-elevate .pdf-brand-header-logo img{width:150px;height:54px;max-width:150px;max-height:54px;object-fit:cover;object-position:center;filter:none;}'
        + '.pdf-a4-page.brand-elevate .pdf-brand-subtitle{color:#E8D39B;}'
        + '.pdf-a4-page.brand-elevate .pdf-section{border-left-color:#D4A94F;color:#171717;}'
        + '.pdf-a4-page.brand-elevate .meal-box{border-left-color:#D4A94F;}'
        + '.pdf-a4-page.brand-elevate .pdf-recon-title,.pdf-a4-page.brand-elevate .pdf-totals{background:#111;color:#fff;}'
        + '.pdf-a4-page.brand-elevate .val-blue{color:#9A6A13;}'
        + '.pdf-a4-page.brand-elevate .pdf-pie-legend .dot-pro{background:#D4A94F;}'
        + '.pdf-a4-page.brand-elevate .pdf-footer{color:#5f4310;}';
};

buildPdfHeaderLogoHtml = function (creator) {
    const brand = creator === 'elevate' ? PDF_BRANDS.elevate : PDF_BRANDS.kr;
    return '<img src="' + brand.logo + '" alt="' + brand.logoAlt + '">';
};

function cleanProfessionalPdfText(value) {
    return String(value == null ? '' : value)
        .replace(/[\\u{1F4AA}\\u{1F6CC}\\u{1F305}\\u{2615}\\u{1F37D}\\u{1F34E}\\u{1F969}\\u{1F319}\\u{1F31C}\\u{FE0F}]/gu, '')
        .replace(/\\s{2,}/g, ' ')
        .replace(/>\\s+</g, '><')
        .trim();
}

buildPDFInfoGrid = function (snapshot, nom, dateStr, ratioText, goalLabel) {
    const l = PDF_LABELS[pdfLang];
    const r = reconcilePlanTotalsFromSnapshot(snapshot);
    const timingRow = snapshot.timing.active
        ? '<tr><td class="info-label">' + l.training + '</td><td><strong>' + snapshot.timing.heureLabel + '</strong> — ' + snapshot.timing.summary + '</td></tr>'
        : '';
    const variancePercent = r.target.kcal > 0 ? Math.round((r.variance.kcal / r.target.kcal) * 1000) / 10 : 0;
    const varianceTxt = formatSignedDelta(r.variance.kcal, ' kcal') + ' (' + formatSignedDelta(variancePercent, ' %') + ')'
        + ' · ' + formatSignedDelta(r.variance.pro, 'g ') + l.pro
        + ' · ' + formatSignedDelta(r.variance.glu, 'g ') + l.glu
        + ' · ' + formatSignedDelta(r.variance.lip, 'g ') + l.lip
        + (r.withinThreshold ? ' — ' + l.withinTolerance : '');
    const varianceClass = r.withinThreshold ? 'var-ok' : 'var-warn';
    return '<div class="info-grid">'
        + '<table class="info-table"><tbody>'
        + '<tr><td class="info-label">' + l.athlete + '</td><td>' + nom + '</td></tr>'
        + '<tr><td class="info-label">' + l.date + '</td><td>' + dateStr + '</td></tr>'
        + '<tr><td class="info-label">' + l.energyGoal + '</td><td>' + goalLabel + '</td></tr>'
        + '<tr><td class="info-label">' + l.dayType + '</td><td>' + snapshot.jourLabel + '</td></tr>'
        + timingRow
        + '<tr><td class="info-label">' + l.macroRatio + '</td><td>' + ratioText + '</td></tr>'
        + '</tbody></table>'
        + '<div class="pdf-recon"><div class="pdf-recon-title">' + l.reconciliationTitle + '</div><table><tbody>'
        + '<tr><td class="info-label">' + l.targetCalories + '</td><td class="val-blue">' + r.target.kcal + ' kcal</td></tr>'
        + '<tr><td class="info-label">' + l.targetMacros + '</td><td>' + formatSnapshotMacros(r.target.pro, r.target.glu, r.target.lip) + '</td></tr>'
        + '<tr><td class="info-label">' + l.plannedCalories + '</td><td><strong>' + r.planned.kcal + ' kcal</strong></td></tr>'
        + '<tr><td class="info-label">' + l.plannedMacros + '</td><td>' + formatSnapshotMacros(r.planned.pro, r.planned.glu, r.planned.lip) + '</td></tr>'
        + '<tr><td class="info-label">' + l.varianceLabel + '</td><td class="' + varianceClass + '">' + varianceTxt + '</td></tr>'
        + '<tr><td class="info-label">' + l.banqueNote + '</td><td>' + r.banque.kcal + ' kcal · ' + formatSnapshotMacros(r.banque.pro, r.banque.glu, r.banque.lip) + '</td></tr>'
        + '<tr><td class="info-label">' + l.hydration + '</td><td><span class="val-cyan">' + formatEau(snapshot.eau.total) + ' ' + l.perDay + '</span> — ' + snapshot.eauDetail + '</td></tr>'
        + '</tbody></table><div class="pdf-recon-note">' + l.varianceOrigin + '</div></div></div>';
};

buildClientPDFPageHTML = function (snapshot, nom, dateStr, ratioText, goalLabel, isFirstPage) {
    snapshot = Object.assign({}, snapshot, {
        jourLabel: cleanProfessionalPdfText(snapshot.jourLabel),
        portionsLeft: cleanProfessionalPdfText(snapshot.portionsLeft),
        portionsRight: cleanProfessionalPdfText(snapshot.portionsRight)
    });
    const brand = getSelectedPdfBrand();
    const l = PDF_LABELS[pdfLang];
    const actualRatio = getClientMacroDistributionLabel(snapshot);
    const dayLine = isFirstPage ? '' : '<div class="pdf-brand-day">' + snapshot.jourLabel + '</div>';
    const header = '<div class="pdf-brand-header"><div class="pdf-brand-header-logo">'
        + buildPdfHeaderLogoHtml(brand.key) + '</div><div class="pdf-brand-copy"><div class="pdf-brand-title">' + l.mainTitle + '</div>'
        + '<div class="pdf-brand-subtitle">' + l.subtitle + ' — ' + l.brandBy + ' ' + brand.label + '</div>' + dayLine + '</div></div>'
        + '<div class="pdf-brand-rule"></div>';
    const notes = getCoachNotes();
    return '<div class="pdf-a4-page brand-' + brand.key + '">' + header
        + buildPDFInfoGrid(snapshot, nom, dateStr, actualRatio, goalLabel)
        + '<div class="pdf-section">' + l.portionsSection + '</div>'
        + '<div class="pdf-page-body"><div class="meals-grid"><div class="meals-col">' + snapshot.portionsLeft
        + '</div><div class="meals-col">' + snapshot.portionsRight + '</div></div>'
        + buildCoachNotesHtml(notes) + buildMacroChartHtml(snapshot) + '</div>'
        + '<div class="pdf-totals">' + formatSnapshotTotals(snapshot) + '</div>'
        + '<div class="pdf-scope-note">' + l.scopeNotice + '</div>'
        + '<div class="pdf-footer">' + cleanProfessionalPdfText(l.footer) + '</div></div>';
};

genererPlanTextuel = function () {
    captureJourActif();
    const l = PDF_LABELS[pdfLang];
    const brand = getSelectedPdfBrand();
    const nom = document.getElementById('nom_athlete').value.trim() || l.planUnspecified;
    const activeGoal = document.querySelector('.goal-card.active .goal-title');
    const kg = getPoidsKg();
    const snapEnt = getJourSnapshot('entrainement');
    const proKg = kg > 0 ? (snapEnt.targets.pro / kg).toFixed(1) : '0';
    const goalLabel = translateGoalLabelForPdf(activeGoal ? activeGoal.textContent : '--');
    const ratioLabel = getClientMacroDistributionLabel(snapEnt);
    let plan = '==============================================\\n';
    plan += l.mainTitle + '\\n';
    plan += '==============================================\\n\\n';
    plan += l.athlete.padEnd(18) + ': ' + nom + '\\n';
    plan += l.date.padEnd(18) + ': ' + getPdfDateString(pdfLang) + '\\n';
    plan += l.planObjective.padEnd(18) + ': ' + goalLabel + '\\n';
    plan += l.brandBy.padEnd(18) + ': ' + brand.label + '\\n';
    plan += l.macroRatio.padEnd(18) + ': ' + ratioLabel + '\\n';
    plan += l.planProteinKg.padEnd(18) + ': ' + proKg + ' g/kg ' + l.planTrainingDay + '\\n';
    plan += '----------------------------------------------\\n\\n';
    plan += genererPlanBlocJour(snapEnt);
    if (jourReposActif && isJourClientPlanConfigured(joursData.repos)) plan += genererPlanBlocJour(getJourSnapshot('repos'));
    else if (jourReposActif) plan += l.restOmittedNote + '\\n\\n';
    plan += l.footer + '\\n';
    document.getElementById('output-plan').value = plan;
};

exporterPDF = function () {
    if (!document.getElementById('output-plan').value.trim()) genererPlanTextuel();
    const l = PDF_LABELS[pdfLang];
    const brand = getSelectedPdfBrand();
    const nom = document.getElementById('nom_athlete').value.trim() || l.defaultAthlete;
    const dateStr = getPdfDateString(pdfLang);
    const filenameDate = new Date().toISOString().slice(0, 10);
    const snapEnt = getJourSnapshot('entrainement');
    const snapRep = getClientPdfRestSnapshot();
    const expectedPages = snapRep ? 2 : 1;
    const btn = document.getElementById('btn-export-pdf');
    const btnLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Génération PDF...';
    const safeName = nom.replace(/[^a-zA-Z0-9À-ſ_-]+/g, '_');
    const filename = l.filenamePrefix + '_' + brand.slug + '_' + safeName + '_' + filenameDate + (pdfLang === 'en' ? '_EN' : '') + '.pdf';
    const html = buildFullPDFHTML(snapEnt, snapRep, nom, dateStr, getMacroRatioLabel(), getActiveGoalLabel());
    const iframe = creerIframePDF(html);
    attendreRenduPDF(iframe).then(function () {
        const doc = iframe.contentWindow.document;
        const pages = doc.querySelectorAll('.pdf-a4-page');
        if (pages.length !== expectedPages || doc.body.innerText.trim().length < 30) throw new Error('Structure PDF invalide');
        assertPdfImagesReady(doc);
        const text = doc.body.innerText;
        const bodyHtml = doc.body.innerHTML;
        if (brand.key === 'elevate' && (/KR Kinetics/i.test(text) || /logo-kr/i.test(bodyHtml))) {
            throw new Error('Contamination de marque KR détectée dans le PDF Elevate');
        }
        if (brand.key === 'kr' && (/Elevate Fitness/i.test(text) || /logo-elevate/i.test(bodyHtml))) {
            throw new Error('Contamination de marque Elevate détectée dans le PDF KR');
        }
        return genererPDFNatif(pages, filename);
    }).then(function () {
        nettoyerIframePDF();
        btn.disabled = false;
        btn.textContent = btnLabel;
    }).catch(function (error) {
        console.error(error);
        nettoyerIframePDF();
        btn.disabled = false;
        btn.textContent = btnLabel;
        alert('Erreur PDF : ' + (error.message || 'réessayez.'));
    });
};

document.addEventListener('DOMContentLoaded', function () {
    updateGuideBrandLink();
});
</script>`;
}

function applyProfessionalUiPatches(html) {
  html = mustReplace(
    html,
    /<h1>ÉVALUATION & PLANIFICATION NUTRITIONNELLE<\/h1>/,
    '<h1>ÉVALUATION DES HABITUDES & PLANIFICATION ALIMENTAIRE</h1>',
    'main h1 title',
  );

  html = mustReplace(
    html,
    /<select id="macroRatio" onchange="updateCibles\(\)">[\s\S]*?<\/select>\s*<p class="macro-hint">[\s\S]*?<\/p>/,
    MACRO_OPTIONS_HTML,
    'macro preset options',
  );

  html = mustReplace(
    html,
    /const MACRO_PRESET_LABELS_EN = \{[\s\S]*?\};/,
    MACRO_PRESET_LABELS_EN_JS,
    'MACRO_PRESET_LABELS_EN',
  );

  html = mustIncludesReplace(
    html,
    '<div class="dash-title">Cible Calorique</div>',
    '<div class="dash-title">Cible alimentaire après arrondi des macros</div>',
    'calorie target label',
  );

  html = mustIncludesReplace(
    html,
    '<label>💧 Hydratation — calcul automatique</label>',
    '<label>💧 Cible initiale de liquides — repère automatique</label>',
    'hydration label',
  );

  html = mustReplace(
    html,
    /Règle : 1 L \/ 1000 kcal\s*&nbsp;·&nbsp;\s*Basé sur <strong id="eau-kcal-base">0<\/strong> kcal/,
    'Repère initial : 1 L / 1000 kcal &nbsp;·&nbsp; Basé sur <strong id="eau-kcal-base">0</strong> kcal · À individualiser selon la sudation, la chaleur et l\'entraînement',
    'hydration rule text',
  );

  html = mustReplace(
    html,
    /(<div class="pdf-creator-picker">\s*<label>Créateur du plan PDF<\/label>[\s\S]*?<p class="pdf-creator-hint">)[^<]*(<\/p>)/,
    '$1Le PDF et le guide client utiliseront exclusivement la marque choisie.$2',
    'pdf creator brand hint',
  );

  html = mustIncludesReplace(
    html,
    "title.textContent = 'Dossier exportable avec réserves';",
    "title.textContent = 'Plan complet — ajustements à confirmer';",
    'plan status warn title',
  );

  html = mustIncludesReplace(
    html,
    "msg.textContent = 'Vérifiez :';",
    "msg.textContent = 'Les journées sont complètes; validez simplement les écarts suivants :';",
    'plan status warn message',
  );

  html = mustIncludesReplace(
    html,
    'Jour Repos (Carb Cycling)',
    'Jour Repos (cyclage des glucides)',
    'French rest day carb-cycling wording',
  );

  // App/PDF consistency: residual fat % so displayed shares always total 100%.
  html = mustReplace(
    html,
    /const pctPro = totalKcal > 0 \? Math\.round\(\(totalPro \* 4 \/ totalKcal\) \* 100\) \+ '%' : '—';\s*const pctGlu = totalKcal > 0 \? Math\.round\(\(totalGlu \* 4 \/ totalKcal\) \* 100\) \+ '%' : '—';\s*const pctLip = totalKcal > 0 \? Math\.round\(\(totalLip \* 9 \/ totalKcal\) \* 100\) \+ '%' : '—';/,
    `let pctPro = '—', pctGlu = '—', pctLip = '—';
    if (totalKcal > 0) {
        const pct = macroPercentagesFromGrams(totalPro, totalGlu, totalLip);
        pctPro = pct.pro + '%'; pctGlu = pct.glu + '%'; pctLip = pct.lip + '%';
    }`,
    'snapshot macro percent residual rounding',
  );

  html = mustReplace(
    html,
    /if \(totalKcal > 0\) \{\s*document\.getElementById\('recap-pct-pro'\)\.textContent = Math\.round\(\(totalPro \* 4 \/ totalKcal\) \* 100\) \+ '%';\s*document\.getElementById\('recap-pct-glu'\)\.textContent = Math\.round\(\(totalGlu \* 4 \/ totalKcal\) \* 100\) \+ '%';\s*document\.getElementById\('recap-pct-lip'\)\.textContent = Math\.round\(\(totalLip \* 9 \/ totalKcal\) \* 100\) \+ '%';\s*\} else \{/,
    `if (totalKcal > 0) {
        const pct = macroPercentagesFromGrams(totalPro, totalGlu, totalLip);
        document.getElementById('recap-pct-pro').textContent = pct.pro + '%';
        document.getElementById('recap-pct-glu').textContent = pct.glu + '%';
        document.getElementById('recap-pct-lip').textContent = pct.lip + '%';
    } else {`,
    'recap macro percent residual rounding',
  );

  html = mustReplace(
    html,
    /function computeMacroDistribution\(snapshot\) \{\s*const proK = snapshot\.totalPro \* 4, gluK = snapshot\.totalGlu \* 4, lipK = snapshot\.totalLip \* 9;\s*const total = proK \+ gluK \+ lipK;\s*if \(total <= 0\) return \{ proK: 0, gluK: 0, lipK: 0, proPct: 0, gluPct: 0, lipPct: 0, total: 0 \};\s*const proPct = Math\.round\(\(proK \/ total\) \* 100\);\s*const gluPct = Math\.round\(\(gluK \/ total\) \* 100\);\s*const lipPct = Math\.max\(0, 100 - proPct - gluPct\);\s*return \{ proK, gluK, lipK, proPct, gluPct, lipPct, total \};\s*\}/,
    `function macroPercentagesFromGrams(pro, glu, lip) {
    const total = kcalFromMacros(pro || 0, glu || 0, lip || 0);
    if (!total) return { pro: 0, glu: 0, lip: 0 };
    const proPct = Math.round(((pro || 0) * 4 / total) * 100);
    const gluPct = Math.round(((glu || 0) * 4 / total) * 100);
    return { pro: proPct, glu: gluPct, lip: Math.max(0, 100 - proPct - gluPct) };
}
function computeMacroDistribution(snapshot) {
    const p = macroPercentagesFromGrams(snapshot.totalPro, snapshot.totalGlu, snapshot.totalLip);
    const proK = (snapshot.totalPro || 0) * 4, gluK = (snapshot.totalGlu || 0) * 4, lipK = (snapshot.totalLip || 0) * 9;
    const total = proK + gluK + lipK;
    if (total <= 0) return { proK: 0, gluK: 0, lipK: 0, proPct: 0, gluPct: 0, lipPct: 0, total: 0 };
    return { proK, gluK, lipK, proPct: p.pro, gluPct: p.glu, lipPct: p.lip, total };
}`,
    'shared macroPercentagesFromGrams helper',
  );

  html = mustReplace(
    html,
    /(<textarea id="coach-notes"[^>]*><\/textarea>)\s*<\/div>\s*<div class="pdf-export-options">/,
    `$1
        <p class="coach-notes-lang-hint" id="coach-notes-lang-hint">Les notes sont reproduites telles quelles dans le PDF; rédigez-les dans la langue sélectionnée.</p>
    </div>
    <div class="pdf-export-options">`,
    'coach notes language hint',
  );

  if (!html.includes('.coach-notes-lang-hint')) {
    html = mustReplace(
      html,
      /\.coach-notes-panel textarea \{[^}]+\}/,
      (match) => `${match}
        .coach-notes-lang-hint { margin: 8px 0 0; font-size: 0.78rem; color: #64748b; line-height: 1.4; }`,
      'coach notes hint css',
    );
  }

  return html;
}

export function applyDualBrandPatches(html) {
  html = mustReplace(
    html,
    /<title>[^<]*<\/title>/,
    '<title>Calculateur Coach | KR Kinetics × Elevate Fitness</title>',
    'title',
  );

  if (!html.includes('elevate-logo-data.js')) {
    html = mustReplace(
      html,
      /(<script src="\.\/vendor\/html2canvas\.min\.js"><\/script>)/,
      '<script src="./assets/elevate-logo-data.js"></script>\n    $1',
      'elevate logo data script',
    );
  }

  html = mustReplace(
    html,
    /\.header-logo\.kr-logo img \{[\s\S]*?\.header-logo:not\(\.kr-logo\) img \{[^}]+\}/,
    DUAL_HEADER_CSS.trimEnd(),
    'header dual-brand css',
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
    'mobile dual-brand header',
  );

  html = mustReplace(
    html,
    /<div class="collab-badge">[^<]*<\/div>/,
    '<div class="collab-badge">Outil coach · KR Kinetics × Elevate Fitness</div>',
    'collab badge',
  );

  html = mustReplace(
    html,
    /<div class="header-logo">\s*<img[^>]*>\s*<\/div>\s*<\/header>/,
    `<div class="header-logo elevate-logo">
        <img src="./assets/logo-elevate-fitness.jpg" alt="Elevate Fitness">
    </div>
</header>`,
    'elevate header logo',
  );

  html = applyProfessionalUiPatches(html);

  if (html.includes('dual-brand-professional-corrections')) {
    throw new Error('Dual-brand runtime already present');
  }
  const bodyClose = html.lastIndexOf('</body>');
  if (bodyClose === -1) throw new Error('Cannot inject dual-brand runtime');
  html = `${html.slice(0, bodyClose)}${buildDualBrandRuntime()}\n${html.slice(bodyClose)}`;

  if (!html.includes('elevate-logo') || !html.includes('getSelectedPdfBrand') || !html.includes('ELEVATE_PDF_LOGO_DATA_URI')) {
    throw new Error('Dual-brand patch incomplete');
  }
  if (!html.includes('ÉVALUATION DES HABITUDES & PLANIFICATION ALIMENTAIRE')) {
    throw new Error('Professional title patch incomplete');
  }
  if (!html.includes('restant 57 % G / 43 % L') || !html.includes('Cible alimentaire après arrondi des macros')) {
    throw new Error('Professional label patches incomplete');
  }
  if (!html.includes('Les notes sont reproduites telles quelles dans le PDF')) {
    throw new Error('Coach notes language hint missing');
  }
  return html;
}
