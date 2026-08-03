/**
 * Client-facing PDF + mobile polish patches injected into the restored coach calculator.
 * Kept separate from the golden-master transform for maintainability.
 */

export function buildMobileCssPatch() {
  return `
        /* ═══ Mobile polish (390px) — no desktop regression ═══ */
        @media (max-width: 430px) {
            body { padding: 12px; font-size: 15px; }
            label, .dash-sub, .scientific-note, .info-bar, .timing-preview,
            .plan-status-body p, .plan-status-body ul, .pdf-creator-hint,
            .repos-copy-hint, .macro-pct-readonly { font-size: 14px !important; }
            h2 { font-size: 1.15rem; }
            .header-title-container h1 { font-size: 1.15rem; }
            .btn, .jour-tab, .goal-card, .timing-toggle-btn,
            button.btn, .pdf-creator-picker button {
                min-height: 44px;
                font-size: 14px !important;
            }
            input[type="text"], input[type="number"], select, textarea {
                min-height: 44px;
                font-size: 16px !important;
            }
            .nutri-input, .target-input, .rep-input {
                min-height: 44px !important;
                min-width: 44px !important;
                font-size: 14px !important;
            }
            .goal-title { font-size: 14px; }
            .table-h-scroll {
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
                margin: 0 0 8px;
                border: 1px solid var(--border);
                border-radius: 8px;
                position: relative;
            }
            .table-h-scroll::before {
                content: "⟵ faire défiler le tableau ⟶";
                display: block;
                text-align: center;
                font-size: 14px;
                font-weight: 700;
                color: #475569;
                padding: 10px 8px 6px;
                background: #eef2f7;
                border-bottom: 1px solid var(--border);
            }
            .table-h-scroll table { margin: 0; }
        }
`;
}

export function buildClientFixesRuntime(logoHorizontalBase64) {
  const dataUri = `data:image/png;base64,${logoHorizontalBase64}`;
  return `
<script id="kr-client-pdf-mobile-fixes">
window.KR_PDF_LOGO_HORIZONTAL_DATA_URI = ${JSON.stringify(dataUri)};
window.PDF_VARIANCE_THRESHOLDS = Object.freeze({ kcal: 50, pro: 5, glu: 5, lip: 5 });

(function patchPdfLabels() {
    // PDF_LABELS is a top-level const (not on window) — patch via lexical binding.
    Object.assign(PDF_LABELS.fr, {
        plannedCalories: 'Total planifié',
        plannedMacros: 'Macros planifiées',
        varianceLabel: 'Écart planifié vs cible',
        banqueNote: 'Banque (réf. portions)',
        varianceOrigin: 'Écarts dus aux arrondis (formule / moyennes / repas)',
        restOmittedNote: 'Jour repos non configuré — omis du PDF client',
        pdfPagesRestOmitted: 'Télécharger PDF (1 page — repos omis)',
        reconciliationTitle: 'Réconciliation énergétique'
    });
    Object.assign(PDF_LABELS.en, {
        plannedCalories: 'Planned total',
        plannedMacros: 'Planned macros',
        varianceLabel: 'Planned vs target variance',
        banqueNote: 'Bank (portion reference)',
        varianceOrigin: 'Variances from rounding (formula / averages / meals)',
        restOmittedNote: 'Rest day not configured — omitted from client PDF',
        pdfPagesRestOmitted: 'Download PDF (1 page — rest omitted)',
        reconciliationTitle: 'Energy reconciliation'
    });
})();

function isJourClientPlanConfigured(jourData) {
    return window.CoachSharedEngine.isJourClientPlanConfigured(jourData);
}

function getClientPdfRestSnapshot() {
    if (!jourReposActif) return null;
    if (!isJourClientPlanConfigured(joursData.repos)) return null;
    return getJourSnapshot('repos');
}

function clientPdfIncludesRest() {
    return !!getClientPdfRestSnapshot();
}

function reconcilePlanTotalsFromSnapshot(snapshot) {
    const thr = window.PDF_VARIANCE_THRESHOLDS;
    const target = snapshot.targets || { kcal: 0, pro: 0, glu: 0, lip: 0 };
    const banque = snapshot.banqueTotals || { kcal: 0, pro: 0, glu: 0, lip: 0 };
    const planned = {
        pro: snapshot.totalPro || 0,
        glu: snapshot.totalGlu || 0,
        lip: snapshot.totalLip || 0,
        kcal: snapshot.totalKcal || 0
    };
    const variance = {
        kcal: planned.kcal - target.kcal,
        pro: planned.pro - target.pro,
        glu: planned.glu - target.glu,
        lip: planned.lip - target.lip
    };
    const within =
        Math.abs(variance.kcal) <= thr.kcal &&
        Math.abs(variance.pro) <= thr.pro &&
        Math.abs(variance.glu) <= thr.glu &&
        Math.abs(variance.lip) <= thr.lip;
    return { target, banque, planned, variance, withinThreshold: within, thresholds: thr };
}

function formatSignedDelta(n, unit) {
    const sign = n > 0 ? '+' : '';
    return sign + n + (unit || '');
}

function buildPdfHeaderLogoHtml(creator) {
    void creator;
    const src = window.KR_PDF_LOGO_HORIZONTAL_DATA_URI;
    return '<div class="pdf-brand-banner">'
        + '<img class="pdf-brand-logo" src="' + src + '" alt="KR Kinetics" width="220" height="48">'
        + '</div>';
}

(function patchPdfStyles() {
    const origGetPDFStylesCSS = window.getPDFStylesCSS;
    window.getPDFStylesCSS = function getPDFStylesCSS() {
        const base = typeof origGetPDFStylesCSS === 'function' ? origGetPDFStylesCSS() : '';
        return base
            + '.pdf-brand-banner{background:#071B41;border-radius:6px;padding:10px 14px;display:inline-flex;align-items:center;justify-content:flex-start;margin-right:12px;flex-shrink:0;}'
            + '.pdf-brand-logo{height:40px;width:auto;max-width:180px;object-fit:contain;display:block;filter:brightness(0) invert(1);flex-shrink:0;}'
            + '.pdf-recon{margin:8px 0 10px;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;min-width:0;max-width:100%;width:100%;box-sizing:border-box;}'
            + '.pdf-recon-title{background:#071B41;color:#fff;font-size:10px;font-weight:700;padding:6px 10px;overflow-wrap:anywhere;}'
            + '.pdf-recon table{width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;}'
            + '.pdf-recon td{padding:5px 8px;border-top:1px solid #e2e8f0;font-size:10px;overflow-wrap:anywhere;word-break:break-word;}'
            + '.pdf-recon .info-label{background:#f1f5f9;font-weight:700;width:42%;color:#475569;}'
            + '.pdf-recon .var-ok{color:#0f766e;font-weight:700;}'
            + '.pdf-recon .var-warn{color:#b45309;font-weight:700;}'
            + '.pdf-recon-note{font-size:9px;color:#64748b;padding:6px 8px;background:#f8fafc;overflow-wrap:anywhere;}';
    };
})();

function buildPDFInfoGrid(snapshot, nom, dateStr, ratioText, goalLabel) {
    const l = PDF_LABELS[pdfLang];
    const r = reconcilePlanTotalsFromSnapshot(snapshot);
    const timingRow = snapshot.timing.active
        ? '<tr><td class="info-label">' + l.training + '</td><td><strong>' + snapshot.timing.heureLabel + '</strong> — ' + snapshot.timing.summary + '</td></tr>'
        : '';
    const varClass = r.withinThreshold ? 'var-ok' : 'var-warn';
    const varianceTxt = formatSignedDelta(r.variance.kcal, ' kcal')
        + ' · ' + formatSignedDelta(r.variance.pro, 'g ') + l.pro
        + ' · ' + formatSignedDelta(r.variance.glu, 'g ') + l.glu
        + ' · ' + formatSignedDelta(r.variance.lip, 'g ') + l.lip;
    return '<div class="info-grid">' +
        '<table class="info-table"><tbody>' +
        '<tr><td class="info-label">' + l.athlete + '</td><td>' + nom + '</td></tr>' +
        '<tr><td class="info-label">' + l.date + '</td><td>' + dateStr + '</td></tr>' +
        '<tr><td class="info-label">' + l.energyGoal + '</td><td>' + goalLabel + '</td></tr>' +
        '<tr><td class="info-label">' + l.dayType + '</td><td>' + snapshot.jourLabel + '</td></tr>' +
        timingRow +
        '<tr><td class="info-label">' + l.macroRatio + '</td><td>' + ratioText + '</td></tr>' +
        '</tbody></table>' +
        '<div class="pdf-recon">' +
        '<div class="pdf-recon-title">' + l.reconciliationTitle + '</div>' +
        '<table><tbody>' +
        '<tr><td class="info-label">' + l.targetCalories + '</td><td class="val-blue">' + r.target.kcal + ' kcal</td></tr>' +
        '<tr><td class="info-label">' + l.targetMacros + '</td><td>' + formatSnapshotMacros(r.target.pro, r.target.glu, r.target.lip) + '</td></tr>' +
        '<tr><td class="info-label">' + l.plannedCalories + '</td><td><strong>' + r.planned.kcal + ' kcal</strong></td></tr>' +
        '<tr><td class="info-label">' + l.plannedMacros + '</td><td>' + formatSnapshotMacros(r.planned.pro, r.planned.glu, r.planned.lip) + '</td></tr>' +
        '<tr><td class="info-label">' + l.varianceLabel + '</td><td class="' + varClass + '">' + varianceTxt + '</td></tr>' +
        '<tr><td class="info-label">' + l.banqueNote + '</td><td>' + r.banque.kcal + ' kcal · ' + formatSnapshotMacros(r.banque.pro, r.banque.glu, r.banque.lip) + '</td></tr>' +
        '<tr><td class="info-label">' + l.hydration + '</td><td><span class="val-cyan">' + formatEau(snapshot.eau.total) + ' ' + l.perDay + '</span> — ' + snapshot.eauDetail + '</td></tr>' +
        '</tbody></table>' +
        '<div class="pdf-recon-note">' + l.varianceOrigin + '</div>' +
        '</div></div>';
}

function formatSnapshotTotals(snapshot) {
    const l = PDF_LABELS[pdfLang];
    const r = reconcilePlanTotalsFromSnapshot(snapshot);
    const varClass = r.withinThreshold ? 'var-ok' : 'var-warn';
    return l.plannedCalories + ' : ' + r.planned.kcal + ' kcal · '
        + r.planned.pro + 'g ' + l.pro + ' · '
        + r.planned.glu + 'g ' + l.glu + ' · '
        + r.planned.lip + 'g ' + l.lip
        + ' &nbsp;|&nbsp; ' + l.targetCalories + ' : ' + r.target.kcal + ' kcal'
        + ' &nbsp;|&nbsp; <span class="' + varClass + '">' + l.varianceLabel + ' : '
        + formatSignedDelta(r.variance.kcal, ' kcal') + '</span>';
}

function buildFullPDFHTML(snapEnt, snapRep, nom, dateStr, ratioText, goalLabel) {
    const localizedEnt = localizeSnapshotForPdf(snapEnt);
    const localizedGoal = translateGoalLabelForPdf(goalLabel);
    const localizedRatio = translateRatioLabelForPdf(ratioText);
    const pageEnt = buildClientPDFPageHTML(localizedEnt, nom, dateStr, localizedRatio, localizedGoal, true);
    let pages = pageEnt;
    // Never include an empty/unconfigured rest day (0 kcal) in the client PDF.
    if (snapRep && ((snapRep.totalKcal || 0) > 0 || (snapRep.portionsLeft || snapRep.portionsRight))) {
        const localizedRep = localizeSnapshotForPdf(snapRep);
        pages += buildClientPDFPageHTML(localizedRep, nom, dateStr, localizedRatio, localizedGoal, false);
    }
    return '<!DOCTYPE html><html lang="' + pdfLang + '"><head><meta charset="UTF-8"><style>' +
        getPDFStylesCSS() + '</style></head><body style="margin:0;background:#fff;">' +
        pages + '</body></html>';
}

function assertPdfImagesReady(doc) {
    const imgs = Array.from(doc.images || []);
    const broken = imgs.filter(function(img) {
        return !img.complete || !img.naturalWidth || img.naturalWidth === 0;
    });
    if (broken.length) {
        throw new Error(pdfLang === 'en'
            ? 'Broken PDF image(s) detected before print'
            : 'Image(s) PDF brisée(s) détectée(s) avant impression');
    }
    return imgs.length;
}

function attendreImagesPDF(doc) {
    const imgs = Array.from(doc.images || []);
    return Promise.all(imgs.map(function(img) {
        if (img.complete && img.naturalWidth > 0) {
            return img.decode ? img.decode().catch(function() {}) : Promise.resolve();
        }
        return new Promise(function(resolve, reject) {
            const ok = function() {
                if (img.decode) {
                    img.decode().then(resolve).catch(function() { resolve(); });
                } else resolve();
            };
            img.addEventListener('load', ok, { once: true });
            img.addEventListener('error', function() {
                reject(new Error('PDF logo failed to decode'));
            }, { once: true });
        });
    })).then(function() {
        assertPdfImagesReady(doc);
    });
}

function attendreRenduPDF(iframe) {
    return new Promise(function(resolve, reject) {
        const check = function() {
            const doc = iframe.contentWindow && iframe.contentWindow.document;
            const body = doc && doc.body;
            if (body && body.scrollHeight > 200) {
                attendreImagesPDF(doc).then(function() {
                    setTimeout(resolve, 120);
                }).catch(reject);
            } else {
                setTimeout(check, 50);
            }
        };
        iframe.onload = function() { setTimeout(check, 50); };
        setTimeout(check, 50);
    });
}

function exporterPDF() {
    if (!document.getElementById('output-plan').value.trim()) genererPlanTextuel();

    const l = PDF_LABELS[pdfLang];
    const nom = document.getElementById('nom_athlete').value.trim() || l.defaultAthlete;
    const dateStr = getPdfDateString(pdfLang);
    const ratioText = getMacroRatioLabel();
    const goalLabel = getActiveGoalLabel();
    const snapEnt = getJourSnapshot('entrainement');
    const snapRep = getClientPdfRestSnapshot();
    const expectedPages = snapRep ? 2 : 1;

    const btn = document.getElementById('btn-export-pdf');
    const btnLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Génération PDF...';

    const nomFichier = l.filenamePrefix + '_' + nom.replace(/\\s+/g, '_') + '_' + dateStr + (pdfLang === 'en' ? '_EN' : '') + '.pdf';
    const pdfHTML = buildFullPDFHTML(snapEnt, snapRep, nom, dateStr, ratioText, goalLabel);
    const iframe = creerIframePDF(pdfHTML);

    attendreRenduPDF(iframe)
        .then(function() {
            const doc = iframe.contentWindow.document;
            const pages = doc.querySelectorAll('.pdf-a4-page');
            if (!pages.length || pages.length !== expectedPages) {
                throw new Error(pdfLang === 'en' ? 'Invalid PDF structure' : 'Structure PDF invalide');
            }
            if (doc.body.innerText.trim().length < 30) {
                throw new Error(pdfLang === 'en' ? 'Empty PDF content' : 'Contenu PDF vide');
            }
            assertPdfImagesReady(doc);
            if (!doc.body.innerHTML.includes('data:image/png;base64,')) {
                throw new Error('PDF logo data URI missing');
            }
            return genererPDFNatif(pages, nomFichier);
        })
        .then(function() {
            nettoyerIframePDF();
            btn.disabled = false;
            btn.textContent = btnLabel;
        })
        .catch(function(err) {
            console.error(err);
            nettoyerIframePDF();
            btn.disabled = false;
            btn.textContent = btnLabel;
            alert('Erreur PDF : ' + (err.message || 'réessayez.'));
        });
}

function evaluerEtatPlan() {
    captureJourActif();
    const ent = evaluerJourData('entrainement');
    const rep = evaluerJourData('repos');
    const current = activeJour === 'entrainement' ? ent : rep;
    const errors = [];
    const warnings = [];
    const restConfigured = isJourClientPlanConfigured(joursData.repos);

    if (!ent.canExport) {
        errors.push('Jour Entraînement : ' + (ent.errors[0] || 'incomplet') + (ent.errors.length > 1 ? ' (+' + (ent.errors.length - 1) + ')' : ''));
    }
    if (jourReposActif && restConfigured && !rep.canExport) {
        errors.push('Jour Repos : ' + (rep.errors[0] || 'incomplet') + (rep.errors.length > 1 ? ' (+' + (rep.errors.length - 1) + ')' : ''));
    }
    if (jourReposActif && !restConfigured) {
        warnings.push(PDF_LABELS[pdfLang].restOmittedNote);
    }

    if (current.warnings.length) {
        warnings.push('Jour actif (' + JOUR_LABELS[activeJour].replace(/💪 |🛌 /g, '') + ') : écart banque/cibles à vérifier.');
    }
    if (ent.warnings.length && activeJour !== 'entrainement') warnings.push('Jour Entraînement : écart banque/cibles.');
    if (jourReposActif && restConfigured && rep.warnings.length && activeJour !== 'repos') {
        warnings.push('Jour Repos : écart banque/cibles.');
    }

    const canExport = ent.canExport && (!jourReposActif || !restConfigured || rep.canExport);
    let level = 'ok';
    if (!canExport) level = 'error';
    else if (warnings.length || ent.warnings.length || (jourReposActif && restConfigured && rep.warnings.length)) level = 'warn';
    else if (computeTargetsForJour('entrainement').kcal === 0) level = 'neutral';

    return { level, errors, warnings, canExport, ent, rep, current, restConfigured };
}

function updateEtatPlan() {
    const status = evaluerEtatPlan();
    const box = document.getElementById('plan-status');
    const icon = document.getElementById('plan-status-icon');
    const title = document.getElementById('plan-status-title');
    const msg = document.getElementById('plan-status-msg');
    const list = document.getElementById('plan-status-list');
    const pdfBtn = document.getElementById('btn-export-pdf');
    if (!box) return;

    box.className = 'plan-status plan-status-' + status.level;
    const l = PDF_LABELS[pdfLang];
    const twoPages = clientPdfIncludesRest();
    if (pdfBtn) {
        if (twoPages) pdfBtn.textContent = '📄 ' + l.pdfPagesTwo;
        else if (jourReposActif && !status.restConfigured) pdfBtn.textContent = '📄 ' + l.pdfPagesRestOmitted;
        else pdfBtn.textContent = '📄 ' + l.pdfPagesOne;
    }

    if (status.level === 'ok') {
        icon.textContent = '✅';
        title.textContent = twoPages ? 'Dossier complet — PDF 2 pages prêt' : 'Dossier complet — PDF 1 page prêt';
        msg.textContent = twoPages
            ? 'Jour Entraînement et Jour Repos validés. Le PDF contiendra les deux plans.'
            : (jourReposActif && !status.restConfigured
                ? l.restOmittedNote
                : 'Jour Entraînement validé. Le PDF contiendra uniquement le plan entraînement.');
        msg.style.display = 'block';
        list.style.display = 'none';
    } else if (status.level === 'warn') {
        icon.textContent = '⚠️';
        title.textContent = 'Dossier exportable avec réserves';
        msg.textContent = 'Vérifiez :';
        msg.style.display = 'block';
        list.innerHTML = status.warnings.map(function(w) { return '<li>' + w + '</li>'; }).join('');
        list.style.display = 'block';
    } else if (status.level === 'error') {
        icon.textContent = '❌';
        title.textContent = 'Dossier incomplet';
        msg.textContent = 'Points à compléter ou ajuster — vous pouvez quand même générer le plan et le PDF :';
        msg.style.display = 'block';
        list.innerHTML = status.errors.map(function(e) { return '<li>' + e + '</li>'; }).join('');
        list.style.display = 'block';
    } else {
        icon.textContent = 'ℹ️';
        title.textContent = 'Complétez le profil pour activer le plan';
        msg.style.display = 'none';
        list.style.display = 'none';
    }
}

function genererPlanTextuel() {
    captureJourActif();
    const l = PDF_LABELS[pdfLang];
    const nom = document.getElementById('nom_athlete').value.trim() || l.planUnspecified;
    const activeGoal = document.querySelector('.goal-card.active .goal-title');
    const kg = getPoidsKg();
    const snapEnt = getJourSnapshot('entrainement');
    const proKg = kg > 0 ? (snapEnt.targets.pro / kg).toFixed(1) : '0';
    const goalLabel = translateGoalLabelForPdf(activeGoal ? activeGoal.textContent : '--');
    const ratioLabel = translateRatioLabelForPdf(getMacroRatioLabel());

    let plan = '╔══════════════════════════════════════════════╗\\n';
    plan += '║       ' + l.mainTitle + '          ║\\n';
    plan += '╚══════════════════════════════════════════════╝\\n\\n';
    plan += l.athlete.padEnd(14) + ': ' + nom + '\\n';
    plan += l.date.padEnd(14) + ': ' + getPdfDateString(pdfLang) + '\\n';
    plan += l.planObjective.padEnd(14) + ': ' + goalLabel + '\\n';
    plan += l.planJointProject + '\\n';
    plan += l.planRatio.padEnd(14) + ': ' + ratioLabel + '\\n';
    plan += l.planProteinKg.padEnd(14) + ': ' + proKg + ' g/kg ' + l.planTrainingDay + '\\n';
    plan += '──────────────────────────────────────────────\\n\\n';
    plan += genererPlanBlocJour(snapEnt);
    if (jourReposActif && isJourClientPlanConfigured(joursData.repos)) {
        plan += genererPlanBlocJour(getJourSnapshot('repos'));
    } else if (jourReposActif) {
        plan += '══════════════════════════════════════════════\\n';
        plan += l.restOmittedNote + '\\n\\n';
    }
    plan += l.footer + '\\n';
    document.getElementById('output-plan').value = plan;
}

function wrapCoachTablesForMobile() {
    document.querySelectorAll('.card table').forEach(function(table) {
        if (table.closest('.table-h-scroll')) return;
        const wrap = document.createElement('div');
        wrap.className = 'table-h-scroll';
        table.parentNode.insertBefore(wrap, table);
        wrap.appendChild(table);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    try { wrapCoachTablesForMobile(); } catch (e) { console.warn(e); }
    try { updateEtatPlan(); } catch (e) { /* ignore until UI ready */ }
});
</script>
`;
}
