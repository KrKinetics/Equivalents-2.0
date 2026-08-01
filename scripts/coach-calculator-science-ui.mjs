/**
 * Science + visual identity 2026 patches for the restored coach calculator.
 * Source of truth: KR_KINETICS_SCIENCE_UI_REVIEW package master index.html.
 */

// Protected fingerprints from refactor/nutrition-source-of-truth (immutable verify-only).
export const REQUIRED_COACH_DATA_SHA256 =
  '3647d051f1121c60e9bdf7fd67800071e22f1464a02334aed63d332333f4b06d';
export const REQUIRED_GUIDE_PDF_SHA256 =
  'f418b4ff7d88541bff7e4b39f661b400638faa03677671940995c1bc5114f8fd';

function mustReplace(html, pattern, replacement, label) {
  if (!pattern.test(html)) {
    throw new Error(`Science UI patch failed: missing ${label}`);
  }
  return html.replace(pattern, replacement);
}

export function buildScienceRuntime() {
  return String.raw`
<script>
// ═══ KR KINETICS — MOTEUR SCIENTIFIQUE ET IDENTITÉ VISUELLE 2026 ═══
(function () {
    window.KR_energyEquationVersion = 'nasem2023';

    const KR_ENERGY_METHODS = Object.freeze({
        nasem2023: 'NASEM 2023',
        iom2005: 'IOM 2005 (compatibilité)'
    });

    function krGrowthAllowance(sexe, age) {
        if (age < 4) return sexe === 'H' ? 20 : 15;
        if (age < 9) return 15;
        if (age < 14) return sexe === 'H' ? 25 : 30;
        return 20;
    }

    function krNasem2023Eer(sexe, age, kg, cm, activite) {
        const youth = age < 19;
        const growth = youth ? krGrowthAllowance(sexe, age) : 0;
        const key = activite || 'sedentaire';
        if (youth && sexe === 'H') {
            const f = {
                sedentaire: [-447.51, 3.68, 13.01, 13.15],
                leger: [19.12, 3.68, 8.62, 20.28],
                modere: [-388.19, 3.68, 12.66, 20.46],
                actif: [-671.75, 3.68, 15.38, 23.25]
            }[key];
            return f[0] + f[1] * age + f[2] * cm + f[3] * kg + growth;
        }
        if (youth) {
            const f = {
                sedentaire: [55.59, -22.25, 8.43, 17.07],
                leger: [-297.54, -22.25, 12.77, 14.73],
                modere: [-189.55, -22.25, 11.74, 18.34],
                actif: [-709.59, -22.25, 18.22, 14.25]
            }[key];
            return f[0] + f[1] * age + f[2] * cm + f[3] * kg + growth;
        }
        if (sexe === 'H') {
            const f = {
                sedentaire: [753.07, -10.83, 6.50, 14.10],
                leger: [581.47, -10.83, 8.30, 14.94],
                modere: [1004.82, -10.83, 6.52, 15.91],
                actif: [-517.88, -10.83, 15.61, 19.11]
            }[key];
            return f[0] + f[1] * age + f[2] * cm + f[3] * kg;
        }
        const f = {
            sedentaire: [584.90, -7.01, 5.72, 11.71],
            leger: [575.77, -7.01, 6.60, 12.14],
            modere: [710.25, -7.01, 6.54, 12.34],
            actif: [511.83, -7.01, 9.07, 12.56]
        }[key];
        return f[0] + f[1] * age + f[2] * cm + f[3] * kg;
    }

    function krIom2005Eer(sexe, age, kg, metres, activite) {
        const PA_H = { sedentaire: 1.00, leger: 1.11, modere: 1.25, actif: 1.48 };
        const PA_F = { sedentaire: 1.00, leger: 1.12, modere: 1.27, actif: 1.45 };
        if (sexe === 'H') {
            const pa = PA_H[activite];
            return 662 - (9.53 * age) + pa * ((15.91 * kg) + (539.6 * metres));
        }
        const pa = PA_F[activite];
        return 354 - (6.91 * age) + pa * ((9.36 * kg) + (726 * metres));
    }

    function krSetYouthGoalGuard(age) {
        const youth = age < 19;
        const cards = Array.from(document.querySelectorAll('.goal-card'));
        cards.forEach(function (card) {
            const multiplier = parseFloat(card.getAttribute('data-multiplier'));
            const locked = youth && multiplier !== 1;
            card.classList.toggle('goal-disabled', locked);
            card.setAttribute('aria-disabled', locked ? 'true' : 'false');
            card.style.opacity = locked ? '0.42' : '';
            card.style.cursor = locked ? 'not-allowed' : '';
        });
        if (youth && selectedGoalMultiplier !== 1) {
            selectedGoalMultiplier = 1;
            cards.forEach(function (card) {
                card.classList.toggle('active', parseFloat(card.getAttribute('data-multiplier')) === 1);
            });
        }
    }

    function krMacroAuditText() {
        const t = computeTargetsForJour(activeJour);
        if (!t || !t.kcal) return '';
        const age = parseFloat(document.getElementById('age').value) || 0;
        const youth = age < 19;
        const proPct = Math.round((t.pro * 4 / t.kcal) * 100);
        const gluPct = Math.round((t.glu * 4 / t.kcal) * 100);
        const lipPct = Math.round((t.lip * 9 / t.kcal) * 100);
        const outside = [];
        if (gluPct < 45 || gluPct > 65) outside.push('glucides ' + gluPct + '%');
        if (proPct < 10 || proPct > (youth ? 30 : 35)) outside.push('protéines ' + proPct + '%');
        if (lipPct < (youth ? 25 : 20) || lipPct > 35) outside.push('lipides ' + lipPct + '%');
        return outside.length
            ? ' <strong>Contrôle macros :</strong> hors AMDR général pour ' + outside.join(', ') + '; acceptable seulement si le contexte sportif le justifie.'
            : ' <strong>Contrôle macros :</strong> répartition dans les AMDR généraux ' + (youth ? '4–18 ans.' : 'adultes.');
    }

    function krUpdateScientificScope() {
        const box = document.getElementById('scientific-scope');
        if (!box) return;
        const age = parseFloat(document.getElementById('age').value) || 0;
        const method = window.KR_energyEquationVersion;
        const methodLabel = KR_ENERGY_METHODS[method] || method;
        box.className = 'scientific-scope';
        if (age < 5 || age > 100) {
            box.classList.add('scope-alert');
            box.innerHTML = '<strong>Hors portée :</strong> âge non pris en charge par ce calculateur.';
            return;
        }
        if (method === 'iom2005') box.classList.add('scope-warn');
        if (age < 19) {
            box.classList.add('scope-warn');
            box.innerHTML = '<span class="energy-method-badge">' + methodLabel + '</span> <strong>Mineur :</strong> l\'EER inclut le coût de croissance et le maintien est imposé. Aucun déficit ou surplus automatique. Supervision d\'un professionnel qualifié en pédiatrie recommandée.' + krMacroAuditText();
            return;
        }
        const legacy = method === 'iom2005'
            ? ' Méthode conservée pour reproduire un ancien dossier; utiliser NASEM 2023 pour un nouveau dossier.'
            : ' Équations dérivées de mesures par eau doublement marquée et applicables aux adultes de 19 ans et plus, toutes catégories d\'IMC.';
        box.innerHTML = '<span class="energy-method-badge">' + methodLabel + '</span>' + legacy
            + ' <strong>Portée :</strong> personne généralement en santé et poids stable. Grossesse, allaitement, maladie métabolique, chirurgie bariatrique et athlète d\'élite exigent une méthode dédiée. Valider la cible avec 2 à 4 semaines de données réelles.'
            + krMacroAuditText();
    }

    window.changerMethodeEnergetique = function (value) {
        const age = parseFloat(document.getElementById('age').value) || 0;
        if (value === 'iom2005' && age < 19) {
            alert('La méthode IOM 2005 historique de ce calculateur est une équation adulte. Pour une personne mineure, NASEM 2023 est imposée.');
            value = 'nasem2023';
        }
        window.KR_energyEquationVersion = value === 'iom2005' ? 'iom2005' : 'nasem2023';
        const select = document.getElementById('energy-method');
        if (select) select.value = window.KR_energyEquationVersion;
        calculerBesoins();
    };

    calculerBesoins = function () {
        const sexe = document.getElementById('sexe').value;
        const age = parseFloat(document.getElementById('age').value) || 0;
        const act = document.getElementById('activite').value;
        const kg = getPoidsKg();
        const metres = getGrandeurM();
        const cm = metres * 100;
        if (kg <= 0 || metres <= 0 || age <= 0) return;

        let method = window.KR_energyEquationVersion;
        if (age < 19 && method === 'iom2005') {
            method = 'nasem2023';
            window.KR_energyEquationVersion = method;
            const methodSelect = document.getElementById('energy-method');
            if (methodSelect) methodSelect.value = method;
        }
        const tdee = method === 'iom2005'
            ? krIom2005Eer(sexe, age, kg, metres, act)
            : krNasem2023Eer(sexe, age, kg, cm, act);
        const inactive = method === 'iom2005'
            ? krIom2005Eer(sexe, age, kg, metres, 'sedentaire')
            : krNasem2023Eer(sexe, age, kg, cm, 'sedentaire');

        currentTDEE = Math.max(0, tdee);
        krSetYouthGoalGuard(age);
        document.getElementById('bmr-out').textContent = Math.round(inactive);
        document.getElementById('tdee-out').textContent = Math.round(tdee);
        document.getElementById('poids-kg-out').textContent = kg.toFixed(1);
        document.getElementById('kcal-80').textContent = age < 19 ? '—' : Math.round(tdee * 0.8);
        document.getElementById('kcal-90').textContent = age < 19 ? '—' : Math.round(tdee * 0.9);
        document.getElementById('kcal-100').textContent = Math.round(tdee);
        document.getElementById('kcal-110').textContent = age < 19 ? '—' : Math.round(tdee * 1.1);
        document.getElementById('kcal-120').textContent = age < 19 ? '—' : Math.round(tdee * 1.2);
        updateCibles();
        krUpdateScientificScope();
    };

    const krBaseChoisirObjectif = choisirObjectif;
    choisirObjectif = function (element, multiplier) {
        const age = parseFloat(document.getElementById('age').value) || 0;
        if (age < 19 && multiplier !== 1) {
            alert('Pour une personne mineure, le calculateur autorise uniquement le maintien. Toute modification énergétique doit être supervisée par un professionnel qualifié en pédiatrie.');
            return;
        }
        krBaseChoisirObjectif(element, multiplier);
        krUpdateScientificScope();
    };

    normalizeProteinesParKg = function (value) {
        const n = parseFloat(value);
        if (isNaN(n)) return DEFAULT_PROTEIN_G_PER_KG;
        return Math.min(3.5, Math.max(MIN_PROTEIN_G_PER_KG, Math.round(n * 10) / 10));
    };

    getProteinPerKgColor = function (gPerKg) {
        if (gPerKg > 2.4 || gPerKg < 0.8) return 'var(--danger)';
        if (gPerKg >= 1.4 && gPerKg <= 2.0) return 'var(--success)';
        return 'var(--warning)';
    };

    const krBaseUpdateCibles = updateCibles;
    updateCibles = function () {
        krBaseUpdateCibles();
        krUpdateScientificScope();
    };

    const krBaseMigrateProfilData = migrateProfilData;
    migrateProfilData = function (data) {
        const migrated = krBaseMigrateProfilData(data);
        migrated.energyEquationVersion = data && data.energyEquationVersion === 'nasem2023' ? 'nasem2023' : 'iom2005';
        return migrated;
    };

    const krBaseGetProfilData = getProfilData;
    getProfilData = function (nom) {
        const data = krBaseGetProfilData(nom);
        data.version = 3;
        data.energyEquationVersion = window.KR_energyEquationVersion;
        return data;
    };

    const krBaseAppliquerProfilData = appliquerProfilData;
    appliquerProfilData = function (data, nomAffiche) {
        window.KR_energyEquationVersion = data && data.energyEquationVersion === 'nasem2023' ? 'nasem2023' : 'iom2005';
        const select = document.getElementById('energy-method');
        if (select) select.value = window.KR_energyEquationVersion;
        krBaseAppliquerProfilData(data, nomAffiche);
        krUpdateScientificScope();
    };

    const krBasePdfStyles = getPDFStylesCSS;
    getPDFStylesCSS = function () {
        return krBasePdfStyles()
            + '.pdf-brand-header{height:82px;background:linear-gradient(135deg,#071B41 0%,#0B285B 68%,#071B41 100%);display:flex;align-items:center;padding:12px 18px;color:#fff;border-radius:7px 7px 0 0;}'
            + '.pdf-brand-header-logo{width:245px;display:flex;align-items:center;}.pdf-brand-header-logo img{width:220px;height:auto;max-height:58px;object-fit:contain;display:block;}'
            + '.pdf-brand-copy{flex:1;text-align:right;padding-left:18px;}.pdf-brand-title{font-size:18px;font-weight:800;letter-spacing:.55px;line-height:1.15;color:#fff;}.pdf-brand-subtitle{font-size:9.5px;color:#cbd8eb;margin-top:6px;letter-spacing:.25px;}'
            + '.pdf-brand-day{font-size:10px;color:#fff;margin-top:4px;font-weight:700;}.pdf-brand-rule{height:4px;background:#ED1136;margin-bottom:14px;border-radius:0 0 3px 3px;}'
            + '.pdf-section{border-left-color:#ED1136;color:#071B41;}.meal-box{border-left-color:#ED1136;}.pdf-totals{background:#071B41;}.val-blue{color:#1d4ed8;font-weight:700;}';
    };

    buildPdfHeaderLogoHtml = function () {
        return '<img src="' + window.KR_PDF_LOGO_HORIZONTAL_DATA_URI + '" alt="KR Kinetics" width="220" height="64">';
    };

    function krCleanPdfText(value) {
        return String(value == null ? '' : value)
            .replace(/[\u{1F4AA}\u{1F6CC}\u{1F305}\u{2615}\u{1F37D}\u{1F34E}\u{1F969}\u{1F319}\u{FE0F}]/gu, '')
            .replace(/\s{2,}/g, ' ')
            .replace(/>\s+</g, '><')
            .trim();
    }

    buildClientPDFPageHTML = function (snapshot, nom, dateStr, ratioText, goalLabel, isFirstPage) {
        snapshot = Object.assign({}, snapshot, {
            jourLabel: krCleanPdfText(snapshot.jourLabel),
            portionsLeft: krCleanPdfText(snapshot.portionsLeft),
            portionsRight: krCleanPdfText(snapshot.portionsRight)
        });
        const creator = pdfCreator === 'elevate' ? 'elevate' : 'kr';
        const creatorLabel = creator === 'elevate' ? 'Elevate Fitness' : 'KR Kinetics';
        const l = PDF_LABELS[pdfLang];
        const logoHtml = buildPdfHeaderLogoHtml(creator);
        const dayLine = isFirstPage ? '' : '<div class="pdf-brand-day">' + snapshot.jourLabel + '</div>';
        const headerBlock = '<div class="pdf-brand-header">'
            + '<div class="pdf-brand-header-logo">' + logoHtml + '</div>'
            + '<div class="pdf-brand-copy"><div class="pdf-brand-title">' + l.mainTitle + '</div>'
            + '<div class="pdf-brand-subtitle">' + l.subtitle + ' — ' + creatorLabel + '</div>' + dayLine + '</div></div>'
            + '<div class="pdf-brand-rule"></div>';
        const coachNotes = getCoachNotes();
        return '<div class="pdf-a4-page">' + headerBlock
            + buildPDFInfoGrid(snapshot, nom, dateStr, ratioText, goalLabel)
            + '<div class="pdf-section">' + l.portionsSection + '</div>'
            + '<div class="pdf-page-body"><div class="meals-grid"><div class="meals-col">' + snapshot.portionsLeft
            + '</div><div class="meals-col">' + snapshot.portionsRight + '</div></div>'
            + buildCoachNotesHtml(coachNotes) + buildMacroChartHtml(snapshot) + '</div>'
            + '<div class="pdf-totals">' + formatSnapshotTotals(snapshot) + '</div>'
            + '<div class="pdf-footer">' + krCleanPdfText(l.footer) + '</div></div>';
    };

    document.addEventListener('DOMContentLoaded', function () {
        const select = document.getElementById('energy-method');
        if (select) select.value = window.KR_energyEquationVersion;
        calculerBesoins();
        krUpdateScientificScope();
    });
})();
</script>
`;
}

const SCIENCE_CSS = `
        .scientific-scope { margin-top: 14px; padding: 12px 14px; border: 1px solid #bfdbfe; border-left: 4px solid #2563eb; border-radius: 8px; background: #eff6ff; color: #334155; font-size: 0.82rem; line-height: 1.45; }
        .scientific-scope strong { color: #071B41; }
        .scientific-scope.scope-warn { border-color: #fbbf24; border-left-color: #b45309; background: #fffbeb; }
        .scientific-scope.scope-alert { border-color: #fca5a5; border-left-color: #ED1136; background: #fff1f2; }
        .energy-method-badge { display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;background:#dbeafe;color:#1e3a8a;font-size:0.72rem;font-weight:800;letter-spacing:0.25px; }
        .goal-card.goal-disabled { pointer-events: none; }
`;

const APP_HEADER_CSS = `.app-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            color: #ffffff;
            min-height: 158px;
            border-radius: 14px 14px 4px 4px;
            padding: 24px 34px;
            box-shadow: 0 14px 34px rgba(7,27,65,0.18);
            border: 1px solid rgba(255,255,255,0.08);
            border-bottom: 5px solid var(--accent);
            background:
                radial-gradient(circle at 12% 0%, rgba(237,17,54,0.15), transparent 26%),
                linear-gradient(135deg,#071B41 0%,#0B285B 58%,#071B41 100%);
            margin-bottom: 28px;
            overflow: hidden;
        }
        .header-logo img {
            max-height: 94px;
            width: auto;
            object-fit: contain;
        }
        .header-logo.kr-logo img {
            max-height: 112px;
            max-width: 360px;
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
            font-size: 0.95rem;
            font-weight: 700;
            color: #cbd8eb;
            text-transform: uppercase;
            letter-spacing: 1.5px;
        }
        .header-logo:not(.kr-logo) img { box-shadow: 0 8px 22px rgba(0,0,0,0.2); border-radius: 18px; }
`;

export function applyScienceUiPatches(html) {
  html = mustReplace(
    html,
    /body \{ font-family:[^}]+\}/,
    "body { font-family: Inter, 'Segoe UI', system-ui, -apple-system, sans-serif; background:radial-gradient(circle at 50% 0%,#ffffff 0,#f4f7fb 34%,#edf2f8 100%); color: var(--text); padding: 20px; max-width: 1300px; margin: 0 auto; line-height: 1.6; }",
    'body style'
  );

  html = mustReplace(
    html,
    /\.app-header \{[\s\S]*?\.collab-badge \{[\s\S]*?\}/,
    `${APP_HEADER_CSS}${SCIENCE_CSS}`,
    'app-header style'
  );

  html = mustReplace(
    html,
    /h2 \{ color: var\(--primary\);[^}]+\}/,
    'h2 { color: var(--primary); margin-top: 0; border-bottom: 2px solid var(--border); padding-bottom: 10px; font-size: 1.3rem; margin-bottom: 15px; letter-spacing:-0.2px; }',
    'h2 style'
  );

  html = mustReplace(
    html,
    /\.card \{ background-color: var\(--card-bg\);[^}]+\}/,
    '.card { background-color: var(--card-bg); border-radius: 12px; padding: 25px; box-shadow: 0 10px 28px rgba(7,27,65,0.07); border: 1px solid var(--border); margin-bottom: 25px; }',
    'card style'
  );

  html = mustReplace(
    html,
    /@media \(max-width: 768px\) \{[\s\S]*?\.header-title-container h1 \{[^}]+\}[\s\S]*?\}/,
    `@media (max-width: 768px) { 
            .grid-2, .grid-4, .grid-5 { grid-template-columns: 1fr; } 
            .app-header { flex-direction: column; gap: 10px; text-align: center; padding: 22px 18px; min-height:0; }
            .header-logo img { max-height: 72px; }
            .header-logo.kr-logo img { max-height: 86px; max-width: 270px; }
            .header-logo:not(.kr-logo) { display:none; }
            .header-title-container h1 { font-size: 1.2rem; }
            .collab-badge { font-size:0.76rem; letter-spacing:1px; }
        }`,
    'mobile header media'
  );

  html = mustReplace(
    html,
    /<div class="span-2">\s*<label>Niveau d'activité physique :<\/label>\s*<select id="activite"[\s\S]*?<\/select>\s*<\/div>/,
    `<div class="span-2">
            <label>Niveau d'activité physique :</label>
            <select id="activite" onchange="calculerBesoins()">
                <option value="sedentaire">🪑 Inactif — Activités quotidiennes essentielles seulement</option>
                <option value="leger">🚶 Peu actif — Vie quotidienne + activité légère régulière</option>
                <option value="modere" selected>🏃 Actif — Activité quotidienne soutenue et entraînement régulier</option>
                <option value="actif">⚡ Très actif — Volume quotidien élevé / travail physique exigeant</option>
            </select>
        </div>
        <div class="span-2">
            <label>Méthode d'estimation énergétique :</label>
            <select id="energy-method" onchange="changerMethodeEnergetique(this.value)">
                <option value="nasem2023" selected>NASEM 2023 — recommandée (Canada / États-Unis)</option>
                <option value="iom2005">IOM 2005 — compatibilité des anciens dossiers</option>
            </select>
        </div>`,
    'activity + energy method'
  );

  if (!html.includes('id="scientific-scope"')) {
    html = mustReplace(
      html,
      /(<\/div>\s*)(<!-- ═══ SECTION 2 — CIBLES)/,
      '$1    <div id="scientific-scope" class="scientific-scope" role="status" aria-live="polite"></div>\n$2',
      'scientific-scope mount'
    );
  }

  html = mustReplace(
    html,
    /<p class="scientific-note">[\s\S]*?<\/p>/,
    '<p class="scientific-note">* Estimation énergétique fondée sur les équations NASEM 2023 ou IOM 2005 selon la méthode choisie. Une équation est un point de départ : valider avec l\'évolution réelle du poids, de la performance et de la récupération. Protéines en g/kg ou % des calories; glucides et lipides répartis sur les calories restantes.</p>',
    'scientific-note'
  );

  html = mustReplace(
    html,
    /const MIN_PROTEIN_G_PER_KG = 2;/,
    'const MIN_PROTEIN_G_PER_KG = 0.8;',
    'MIN_PROTEIN_G_PER_KG'
  );

  if (html.includes('MOTEUR SCIENTIFIQUE ET IDENTITÉ VISUELLE 2026')) {
    throw new Error('Science UI runtime already present');
  }
  const endHtml = html.lastIndexOf('</html>');
  const bodyClose = html.lastIndexOf('</body>', endHtml);
  if (bodyClose === -1 || endHtml === -1) throw new Error('Cannot inject science runtime');
  html = `${html.slice(0, bodyClose)}${buildScienceRuntime()}\n${html.slice(bodyClose)}`;

  if (!html.includes('id="energy-method"') || !html.includes('id="scientific-scope"')) {
    throw new Error('Science UI patch incomplete');
  }
  if (!html.includes('window.KR_energyEquationVersion = \'nasem2023\'')) {
    throw new Error('Science UI runtime missing default NASEM');
  }
  return html;
}
