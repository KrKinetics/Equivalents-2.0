/**
 * Génère un PDF professionnel des équivalents alimentaires
 * Données extraites de « Equivalent alimentaire (2).pdf »
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const I18N = require('./i18n');

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function t(fr, en) {
  return `<span class="t" data-fr="${escAttr(fr)}" data-en="${escAttr(en)}">${fr}</span>`;
}

function tHtml(fr, en) {
  return `<span class="t" data-fr-html="${escAttr(fr)}" data-en-html="${escAttr(en)}">${fr}</span>`;
}

function brandField(brandKey, field) {
  const fr = I18N.BRANDS[brandKey].fr[field];
  const en = I18N.BRANDS[brandKey].en[field];
  return field === 'watermarkHtml' ? tHtml(fr, en) : t(fr, en);
}

function sectionField(sectionKey, field) {
  const fr = I18N.SECTIONS[sectionKey].fr[field];
  const en = I18N.SECTIONS[sectionKey].en[field];
  if (fr == null) return '';
  return t(fr, en);
}

function colLabel(key, fallback) {
  const fr = I18N.COLUMNS.fr[key] || fallback;
  const en = I18N.COLUMNS.en[key] || fr;
  return t(fr, en);
}

function colLabelShort(key, fallback) {
  const fr = (I18N.COLUMNS.fr[key] || fallback).replace(' (g)', '').replace(' (Kcal)', '');
  const en = (I18N.COLUMNS.en[key] || fr).replace(' (g)', '').replace(' (kcal)', '');
  return t(fr, en);
}

function foodLabel(sectionKey, rowIndex, frName) {
  const en = I18N.FOODS[sectionKey][rowIndex];
  return t(frName, en);
}

function tagLabel(key) {
  const fr = I18N.UI.fr.tagLabels[key] || key;
  const en = I18N.UI.en.tagLabels[key] || fr;
  return t(fr, en);
}

function L(lang, fr, en) {
  return lang === 'en' ? en : fr;
}

function indexId(lang) {
  return `index-${lang}`;
}

const LANG_PDF_BTN_CSS = `
  .lang-bar {
    display: flex;
    justify-content: center;
    width: 100%;
    position: relative;
    z-index: 20;
  }
  .lang-bar-in-cover {
    padding: 0;
    max-width: 280px;
  }
  .lang-pdf-btn {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    max-width: 280px;
    min-height: 56px;
    padding: 14px 18px;
    border: 1px solid rgba(255,255,255,0.28);
    border-radius: 14px;
    background: rgba(255,255,255,0.14);
    color: #fff;
    font-family: 'DM Sans', system-ui, sans-serif;
    text-decoration: none;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .lang-pdf-btn-icon { font-size: 18pt; line-height: 1; }
  .lang-pdf-btn-label {
    font-size: 9.5pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    line-height: 1.2;
  }
  .lang-pdf-btn-sub {
    font-size: 7pt;
    font-weight: 500;
    opacity: 0.82;
    letter-spacing: 0.02em;
    line-height: 1.3;
    text-transform: none;
  }
  .edition-en {
    break-before: page;
    page-break-before: always;
  }
  .edition-wrap { position: relative; }
`;

const MOBILE_VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">';

const OUTPUT_LANDSCAPE = 'd:\\Download\\Equivalents-alimentaires-professionnel.pdf';
const OUTPUT_MOBILE = 'd:\\Download\\Equivalents-alimentaires-mobile.pdf';
const OUTPUT_MOBILE_TMP = 'd:\\Download\\Equivalents-alimentaires-mobile-new.pdf';
const OUTPUT_LANDSCAPE_ELEVATE = 'd:\\Download\\Equivalents-alimentaires-elevate-professionnel.pdf';
const OUTPUT_MOBILE_ELEVATE = 'd:\\Download\\Equivalents-alimentaires-elevate-mobile.pdf';
const ASSETS = path.join(__dirname, 'assets');

const BRANDS = {
  kinetics: {
    id: 'kinetics',
    name: 'KR Kinetics',
    nameShort: 'KR KINETICS',
    alt: 'KR Kinetics — Force, Conditionnement et Nutrition',
    badge: 'Guide nutritionnel · Écosystème Kinetics',
    ecosystem: 'Conçu par KR Kinetics · Force, Conditionnement & Nutrition',
    watermarkHtml: 'Conçu par<br>KR Kinetics',
    footerMid: 'Équivalents alimentaires · Conçu par l\'écosystème Kinetics',
    accent: '#991F2D',
    statColor: '#60a5fa',
    logoFull: 'kinetics-logo-full.png',
    logoWatermark: 'kinetics-logo-transparent.png',
    coverWrap: 'light',
  },
  elevate: {
    id: 'elevate',
    name: 'Elevate Fitness',
    nameShort: 'ELEVATE FITNESS',
    alt: 'Elevate Fitness — Performance et Nutrition',
    badge: 'Guide nutritionnel · Elevate Fitness',
    ecosystem: 'Conçu par Elevate Fitness · Performance & Nutrition',
    watermarkHtml: 'Conçu par<br>Elevate Fitness',
    footerMid: 'Équivalents alimentaires · Elevate Fitness',
    accent: '#C9A227',
    statColor: '#E8D5A3',
    logoFull: 'elevate-logo.jpeg',
    logoWatermark: 'elevate-logo-watermark.jpeg',
    coverWrap: 'elevate',
  },
};

const LOGO_FULL = path.join(ASSETS, 'kinetics-logo-full.png');
const LOGO_TRANSPARENT = path.join(ASSETS, 'kinetics-logo-transparent.png');

function getBrand(key = 'kinetics') {
  const brand = BRANDS[key];
  if (!brand) throw new Error(`Marque inconnue : ${key}`);
  return brand;
}

function brandLogoPath(brand) {
  return path.join(ASSETS, brand.logoFull);
}

function brandWatermarkPath(brand) {
  return path.join(ASSETS, brand.logoWatermark);
}

function assertBrandAssets(brand) {
  if (!fs.existsSync(brandLogoPath(brand)) || !fs.existsSync(brandWatermarkPath(brand))) {
    throw new Error(`Logos introuvables pour ${brand.name} dans assets/`);
  }
}

function buildFooterHtml(brand, padX = 36) {
  return `
    <div style="width:100%;font-size:7px;color:#64748b;padding:0 ${padX}px;display:flex;justify-content:space-between;align-items:center;font-family:Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
      <span style="color:${brand.accent};font-weight:700;letter-spacing:0.08em;">${brand.nameShort}</span>
      <span class="t" data-fr="${escAttr(I18N.BRANDS[brand.id].fr.footerMid)}" data-en="${escAttr(I18N.BRANDS[brand.id].en.footerMid)}">${I18N.BRANDS[brand.id].fr.footerMid}</span>
      <span><span class="t" data-fr="${escAttr(I18N.UI.fr.footerPage)}" data-en="${escAttr(I18N.UI.en.footerPage)}">${I18N.UI.fr.footerPage}</span> <span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>`;
}

function buildFooterHtmlMobile(brand, padX = 20) {
  return `
    <div style="width:100%;font-size:7px;color:#64748b;padding:0 ${padX}px;display:flex;justify-content:space-between;align-items:center;font-family:Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
      <span style="color:${brand.accent};font-weight:700;letter-spacing:0.08em;">${brand.nameShort}</span>
      <span>FR · EN</span>
      <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>`;
}

function assetUrl(filename) {
  return `assets/${filename}`;
}

const DATA = {
  noix: {
    title: 'Noix & graines',
    subtitle: 'Une portion de NOIX, c\'est :',
    color: '#8B6914',
    columns: [
      { key: 'aliment', label: 'Aliments', align: 'left' },
      { key: 'prot', label: 'Protéines (g)' },
      { key: 'gluc', label: 'Glucides (g)' },
      { key: 'fib', label: 'Fibres (g)' },
      { key: 'sat', label: 'Saturés (g)', group: 'Lipides' },
      { key: 'poly', label: 'Poly-ins. (g)', group: 'Lipides' },
      { key: 'mono', label: 'Mono-ins. (g)', group: 'Lipides' },
      { key: 'cal', label: 'Calories (Kcal)' },
    ],
    rows: [
      { aliment: '7 Amandes (5 g)', prot: 1, gluc: 2, fib: 1, sat: 0, poly: 1, mono: 3, cal: 53 },
      { aliment: '10 Arachides', prot: 2, gluc: 1, fib: 1, sat: 1, poly: 2, mono: 1, cal: 54 },
      { aliment: '10 ml de Beurre d\'arachide / amandes', prot: 3, gluc: 2, fib: 1, sat: 1, poly: 1, mono: 3, cal: 66 },
      { aliment: '10 ml de Tahini (beurre de sésame)', prot: 2, gluc: 2, fib: 1, sat: 1, poly: 2, mono: 2, cal: 59 },
      { aliment: '15 ml de Graines de chanvre', prot: 4, gluc: 1, fib: 1, sat: 1, poly: 5, mono: 1, cal: 77 },
      { aliment: '15 ml de Graines de chia moulues', prot: 3, gluc: 6, fib: 5, sat: 0, poly: 4, mono: 1, cal: 77 },
      { aliment: '20 ml de Graines de lin moulues', prot: 2, gluc: 3, fib: 2, sat: 0, poly: 3, mono: 1, cal: 53 },
      { aliment: '15 ml de Graines de citrouille rôties', prot: 3, gluc: 6, fib: 1, sat: 0, poly: 1, mono: 0, cal: 45 },
      { aliment: '15 ml de Graines de pin déshydratées', prot: 2, gluc: 1, fib: 1, sat: 1, poly: 2, mono: 2, cal: 60 },
      { aliment: '15 ml de Graines de sésame', prot: 2, gluc: 2, fib: 2, sat: 1, poly: 2, mono: 2, cal: 61 },
      { aliment: '15 ml de Graines de tournesol rôtie à l\'huile', prot: 2, gluc: 1, fib: 1, sat: 0, poly: 3, mono: 1, cal: 48 },
      { aliment: '30 ml d\'Hummus', prot: 2, gluc: 5, fib: 1, sat: 1, poly: 2, mono: 3, cal: 69 },
      { aliment: '7 Noix d\'acajou ou cajous (5 g)', prot: 1, gluc: 3, fib: 1, sat: 1, poly: 1, mono: 2, cal: 53 },
      { aliment: '15 ml de Noix de coco filamenté', prot: 0, gluc: 3, fib: 0, sat: 2, poly: 0, mono: 0, cal: 31 },
      { aliment: '5 Noix de Grenoble (9 g)', prot: 1, gluc: 1, fib: 0, sat: 0, poly: 4, mono: 1, cal: 54 },
      { aliment: '2 Noix du Brésil (7 g)', prot: 1, gluc: 1, fib: 0, sat: 1, poly: 2, mono: 2, cal: 55 },
      { aliment: '7 Noix de macadamia', prot: 1, gluc: 0, fib: 1, sat: 1, poly: 0, mono: 4, cal: 51 },
      { aliment: '5 Pacanes rôties à l\'huile (9 g)', prot: 1, gluc: 1, fib: 1, sat: 0, poly: 2, mono: 3, cal: 51 },
      { aliment: '10 Pistaches crues (6 g)', prot: 1, gluc: 2, fib: 0, sat: 0, poly: 1, mono: 1, cal: 31 },
      { aliment: '⅓ tasse de Soja ou edamames', prot: 5, gluc: 3, fib: 2, sat: 1, poly: 2, mono: 1, cal: 64 },
      { aliment: '30 g Granola protéiné maison (noix / graines)', prot: 2, gluc: 2, fib: 1, sat: 1, poly: 2, mono: 2, cal: 56 },
      { aliment: '20 g Beurre de cajou nature', prot: 2, gluc: 2, fib: 1, sat: 1, poly: 1, mono: 3, cal: 57 },
    ],
    average: { prot: 2, gluc: 2, fib: 1, sat: 1, poly: 2, mono: 2, cal: 56 },
  },

  matiereGrasse: {
    title: 'Matières grasses',
    subtitle: 'Une portion de MATIÈRE GRASSE, c\'est :',
    color: '#C45C26',
    columns: [
      { key: 'aliment', label: 'Aliments', align: 'left' },
      { key: 'prot', label: 'Protéines (g)' },
      { key: 'gluc', label: 'Glucides (g)' },
      { key: 'fib', label: 'Fibres (g)' },
      { key: 'sat', label: 'Saturés (g)', group: 'Lipides' },
      { key: 'poly', label: 'Poly-ins. (g)', group: 'Lipides' },
      { key: 'mono', label: 'Mono-ins. (g)', group: 'Lipides' },
      { key: 'cal', label: 'Calories (Kcal)' },
    ],
    rows: [
      { aliment: '⅙ d\'avocat', prot: 1, gluc: 3, fib: 2, sat: 1, poly: 1, mono: 3, cal: 55 },
      { aliment: '1 carré de Chocolat noir > 70 %', prot: 1, gluc: 3, fib: 1, sat: 3, poly: 0, mono: 2, cal: 61 },
      { aliment: '15 g de fromage cheddar / mozzarella / Philadelphia', prot: 3, gluc: 0, fib: 0, sat: 2, poly: 0, mono: 1, cal: 44 },
      { aliment: '7,5 ml d\'Huile végétale (arachide, canola, olive)', prot: 0, gluc: 0, fib: 0, sat: 1, poly: 1, mono: 5, cal: 59 },
      { aliment: '7,5 ml d\'Huile de coco vierge', prot: 0, gluc: 0, fib: 0, sat: 6, poly: 0, mono: 0, cal: 59 },
      { aliment: '7,5 ml d\'Huile MCT', prot: 0, gluc: 0, fib: 0, sat: 7, poly: 0, mono: 0, cal: 58 },
      { aliment: '1 œuf entier', prot: 6, gluc: 0, fib: 0, sat: 2, poly: 1, mono: 2, cal: 70 },
      { aliment: '2 jaunes d\'œuf', prot: 3, gluc: 0, fib: 0, sat: 2, poly: 1, mono: 2, cal: 55 },
      { aliment: '7,5 ml de Margarine non hydrogénée ou de beurre', prot: 0, gluc: 0, fib: 0, sat: 1, poly: 2, mono: 3, cal: 50 },
      { aliment: '7,5 ml de mayonnaise', prot: 0, gluc: 0, fib: 0, sat: 1, poly: 2, mono: 3, cal: 49 },
      { aliment: '16 Olives de 1,6 × 2 cm', prot: 1, gluc: 1, fib: 2, sat: 1, poly: 1, mono: 5, cal: 66 },
      { aliment: '10 ml de vinaigrette à base d\'huile végétale', prot: 0, gluc: 0, fib: 0, sat: 1, poly: 2, mono: 3, cal: 50 },
      { aliment: '10 ml d\'Huile de poisson (EPA / DHA)', prot: 0, gluc: 0, fib: 0, sat: 0, poly: 3, mono: 2, cal: 56 },
    ],
    average: { prot: 1, gluc: 1, fib: 1, sat: 1, poly: 2, mono: 3, cal: 56 },
  },

  legumes: {
    title: 'Légumes',
    subtitle: 'Une portion de LÉGUMES, c\'est :',
    badge: 'À volonté',
    color: '#2D6A4F',
    columns: [
      { key: 'aliment', label: 'Aliments', align: 'left' },
      { key: 'prot', label: 'Protéines (g)' },
      { key: 'gluc', label: 'Glucides (g)' },
      { key: 'cal', label: 'Calories (Kcal)' },
      { key: 'fib', label: 'Fibres (g)' },
      { key: 'lip', label: 'Lipides (g)' },
    ],
    rows: [
      { aliment: 'Ail (15 ml)', prot: '0,5', gluc: 3, cal: 14, fib: 0, lip: 0 },
      { aliment: 'Artichaut', prot: 3, gluc: 10, cal: 52, fib: 2, lip: '0,3' },
      { aliment: 'Asperges', prot: 5, gluc: 8, cal: 57, fib: 3, lip: '0,1' },
      { aliment: 'Aubergine', prot: 1, gluc: 5, cal: 26, fib: 3, lip: '0,6' },
      { aliment: 'Betteraves', prot: 1, gluc: 9, cal: 44, fib: '0,2', lip: '0,2' },
      { aliment: 'Brocoli', prot: 3, gluc: 5, cal: 35, fib: 3, lip: '0,2' },
      { aliment: '250 ml de Chou kale', prot: 2, gluc: 6, cal: 33, fib: 3, lip: '0,3' },
      { aliment: 'Carottes', prot: 1, gluc: 9, cal: 41, fib: 2, lip: '0,2' },
      { aliment: 'Céleri', prot: 1, gluc: 5, cal: 26, fib: 2, lip: '0,2' },
      { aliment: 'Champignons', prot: 2, gluc: 3, cal: 22, fib: 3, lip: '0,4' },
      { aliment: 'Chou de Bruxelles', prot: 2, gluc: 7, cal: 40, fib: 3, lip: '0,6' },
      { aliment: 'Chou-fleurs', prot: 2, gluc: 6, cal: 34, fib: '0,2', lip: '0,2' },
      { aliment: 'Concombres', prot: 1, gluc: 3, cal: 17, fib: 2, lip: '0,1' },
      { aliment: '300 g de Courgette', prot: 2, gluc: 7, cal: 51, fib: 2, lip: '0,2' },
      { aliment: 'Courge', prot: 2, gluc: 8, cal: 45, fib: '0,2', lip: '0,1' },
      { aliment: 'Échalotte', prot: 1, gluc: 4, cal: 21, fib: 3, lip: '0,2' },
      { aliment: 'Épinards', prot: 2, gluc: 2, cal: 18, fib: 5, lip: '0,2' },
      { aliment: 'Fenouil', prot: 1, gluc: 6, cal: 30, fib: 2, lip: '0,1' },
      { aliment: 'Haricots jaunes ou verts', prot: 2, gluc: 8, cal: 41, fib: 3, lip: '0,2' },
      { aliment: 'Jus de légumes (250 ml)', prot: 2, gluc: 12, cal: 58, fib: 3, lip: '0,2' },
      { aliment: 'Laitue romaine', prot: 1, gluc: 1, cal: 9, fib: 2, lip: '0,1' },
      { aliment: 'Navet bouilli égoutté', prot: 2, gluc: 12, cal: 58, fib: 2, lip: '0,1' },
      { aliment: 'Oignon', prot: 1, gluc: 8, cal: 37, fib: 2, lip: '0,1' },
      { aliment: 'Poireau bouilli égoutté', prot: 1, gluc: 8, cal: 38, fib: 2, lip: '0,1' },
      { aliment: 'Pois mange-tout', prot: 2, gluc: 6, cal: 33, fib: 2, lip: '0,1' },
      { aliment: 'Poivron vert / rouge / jaune', prot: 1, gluc: 10, cal: 47, fib: 3, lip: '0,2' },
      { aliment: 'Radis', prot: 1, gluc: 4, cal: 26, fib: 2, lip: '0,1' },
      { aliment: 'Tomate de 6,6 cm de diamètre', prot: 1, gluc: 6, cal: 32, fib: 2, lip: '0,1' },
      { aliment: '250 ml de Bouillon d\'os maison', prot: 2, gluc: 1, cal: 50, fib: 0, lip: '0,4' },
      { aliment: '200 g de Portobello grillé', prot: 2, gluc: 7, cal: 52, fib: 2, lip: '0,3' },
    ],
    average: { prot: 2, gluc: 7, cal: 53, fib: '1,5', lip: '0,4' },
  },

  fruits: {
    title: 'Fruits',
    subtitle: 'Une portion de FRUIT, c\'est :',
    color: '#E63946',
    columns: [
      { key: 'aliment', label: 'Aliments', align: 'left' },
      { key: 'prot', label: 'Protéines (g)' },
      { key: 'gluc', label: 'Glucides (g)' },
      { key: 'cal', label: 'Calories (Kcal)' },
      { key: 'fib', label: 'Fibres (g)' },
      { key: 'lip', label: 'Lipides (g)' },
    ],
    rows: [
      { aliment: '250 ml d\'abricot (160 g)', prot: 2, gluc: 18, cal: 85, fib: 3, lip: '0,6' },
      { aliment: '175 ml d\'ananas (110 g)', prot: 1, gluc: 14, cal: 64, fib: 2, lip: '0,0' },
      { aliment: '½ banane (60 g)', prot: 1, gluc: 14, cal: 63, fib: 1, lip: '0,5' },
      { aliment: '175 ml de bleuets (110 g)', prot: 1, gluc: '15,4', cal: 69, fib: 2, lip: '0,4' },
      { aliment: '20 g de Baies de goji séchées', prot: 3, gluc: 12, cal: 70, fib: 3, lip: '0,2' },
      { aliment: '175 ml de cantaloup (110 g)', prot: 2, gluc: '15,4', cal: 73, fib: '0,6', lip: '0,3' },
      { aliment: '250 ml de cerise avec noyau (110 g)', prot: 1, gluc: 13, cal: 59, fib: 2, lip: '0,3' },
      { aliment: '2 clémentines', prot: 1, gluc: 14, cal: 61, fib: 3, lip: '0,5' },
      { aliment: '1 datte Medjool (24 g)', prot: 0, gluc: 18, cal: 66, fib: 2, lip: '0,0' },
      { aliment: '125 ml de compote de fruits sans sucre ajouté', prot: '0,2', gluc: 19, cal: 79, fib: 3, lip: '0,1' },
      { aliment: '250 ml de fraises (150 g)', prot: 1, gluc: 12, cal: 57, fib: '0,2', lip: '0,3' },
      { aliment: '250 ml de framboises (130 g)', prot: 1, gluc: 15, cal: 70, fib: 0, lip: '0,2' },
      { aliment: '125 ml de jus de fruits 100 % pur, sans sucre ajouté', prot: 1, gluc: 14, cal: 63, fib: 4, lip: '0,6' },
      { aliment: '2 petits kiwis (130 g)', prot: 1, gluc: 16, cal: 73, fib: 6, lip: '0,7' },
      { aliment: '½ mangue (110 g)', prot: '0,5', gluc: 18, cal: 77, fib: '0,7', lip: '0,3' },
      { aliment: '250 ml de melon d\'eau (170 g)', prot: 1, gluc: 12, cal: 58, fib: 3, lip: '0,6' },
      { aliment: '250 ml de mûres (150 g)', prot: 2, gluc: 15, cal: 73, fib: 2, lip: '0,3' },
      { aliment: '1 nectarine (ou 250 ml)', prot: 1, gluc: 16, cal: 73, fib: 1, lip: '0,3' },
      { aliment: '1 orange (170 g)', prot: 1, gluc: 16, cal: 69, fib: 3, lip: '0,4' },
      { aliment: '1 pamplemousse (250 g)', prot: 1, gluc: 18, cal: 78, fib: '1,4', lip: '0,42' },
      { aliment: '1 pêche (100 g)', prot: '1,2', gluc: 10, cal: 46, fib: 1, lip: '0,5' },
      { aliment: '125 ml de poire (110 g)', prot: '0,3', gluc: 13, cal: 57, fib: 1, lip: '0,2' },
      { aliment: '1 pomme (140 g)', prot: '0,3', gluc: 21, cal: 90, fib: 0, lip: '0,2' },
      { aliment: '½ pomme-grenade', prot: '0,8', gluc: 13, cal: 57, fib: 1, lip: '0,2' },
      { aliment: '2 prunes (130 g)', prot: 1, gluc: 18, cal: 83, fib: 2, lip: '0,8' },
      { aliment: '3 pruneaux (30 g)', prot: '0,8', gluc: 15, cal: 63, fib: 1, lip: '0,2' },
      { aliment: '30 ml de raisins secs (20 g)', prot: '0,6', gluc: 15, cal: 62, fib: 1, lip: '0,2' },
      { aliment: '15 gros raisins (75 g)', prot: 1, gluc: 14, cal: 65, fib: 1, lip: '0,2' },
      { aliment: '40 g de Dattes Deglet Nour (3 dattes)', prot: 1, gluc: 15, cal: 70, fib: 2, lip: '0,2' },
      { aliment: '30 g de Canneberges séchées peu sucrées', prot: 0, gluc: 15, cal: 68, fib: 2, lip: '0,2' },
    ],
    average: { prot: 1, gluc: 15, cal: 71, fib: 2, lip: '0,3' },
  },

  poissons: {
    title: 'Poissons & fruits de mer',
    subtitle: 'Une portion de POISSONS & FRUITS DE MER, c\'est :',
    color: '#0077B6',
    note: '* Les poissons et fruits de mer gras sont équivalents aux viandes et volailles : 1 once (30 g) par portion.',
    columns: [
      { key: 'aliment', label: 'Aliments', align: 'left' },
      { key: 'prot', label: 'Protéines (g)' },
      { key: 'gluc', label: 'Glucides (g)' },
      { key: 'lip', label: 'Lipides (g)' },
      { key: 'cal', label: 'Calories (Kcal)' },
    ],
    rows: [
      { aliment: '45 g d\'Aiglefin', prot: 11, gluc: 0, lip: 0, cal: 50 },
      { aliment: '30 g d\'Anguille', prot: 7, gluc: 2, lip: 5, cal: 76 },
      { aliment: '45 g de Brochet', prot: 11, gluc: 0, lip: 0, cal: 47 },
      { aliment: '30 g de Caviar', prot: 7, gluc: 0, lip: 0, cal: 44 },
      { aliment: '45 g de Crabe', prot: 12, gluc: 3, lip: 1, cal: 36 },
      { aliment: '30 g de Surimi', prot: 8, gluc: 1, lip: 2, cal: 57 },
      { aliment: '45 g de Crevette', prot: 9, gluc: 0, lip: 4, cal: 53 },
      { aliment: '45 g d\'Escargot', prot: 7, gluc: 0, lip: 0, cal: 52 },
      { aliment: '30 g de Hareng', prot: 7, gluc: 0, lip: 2, cal: 55 },
      { aliment: '45 g d\'Homard', prot: 9, gluc: 0, lip: 1, cal: 53 },
      { aliment: '45 g d\'Huîtres', prot: 9, gluc: 3, lip: 2, cal: 77 },
      { aliment: '30 g de Maquereau', prot: 7, gluc: 2, lip: 1, cal: 67 },
      { aliment: '45 g de Morue', prot: 10, gluc: 2, lip: 1, cal: 66 },
      { aliment: '45 g de Moules', prot: 11, gluc: 0, lip: 5, cal: 71 },
      { aliment: '45 g de Palourdes en conserve', prot: 11, gluc: 0, lip: 0, cal: 51 },
      { aliment: '45 g de Pétoncle', prot: 8, gluc: 1, lip: 1, cal: 41 },
      { aliment: '45 g de Sole', prot: 11, gluc: 0, lip: 3, cal: 61 },
      { aliment: '30 g de Sardines en conserve', prot: 5, gluc: 5, lip: 1, cal: 61 },
      { aliment: '30 g de Saumon de l\'Atlantique', prot: 7, gluc: 0, lip: 0, cal: 45 },
      { aliment: '45 g de Thon', prot: 11, gluc: 0, lip: 0, cal: 50 },
      { aliment: '45 g de Thon en conserve au naturel, égoutté', prot: 11, gluc: 0, lip: 1, cal: 50 },
      { aliment: '50 g de Tilapia', prot: 10, gluc: 0, lip: 1, cal: 48 },
      { aliment: '45 g de Truite arc-en-ciel', prot: 11, gluc: 0, lip: 0, cal: 47 },
      { aliment: '45 g de Turbot', prot: 9, gluc: 0, lip: 0, cal: 44 },
      { aliment: '45 g de Flétan', prot: 10, gluc: 0, lip: 1, cal: 52 },
      { aliment: '30 g d\'Anchois au naturel (en conserve)', prot: 9, gluc: 0, lip: 2, cal: 55 },
    ],
    average: { prot: 9, gluc: 1, lip: 1, cal: 55 },
  },

  viandes: {
    title: 'Viandes & volaille',
    subtitle: 'Une portion de VIANDES & VOLAILLE, c\'est :',
    color: '#9D0208',
    note: '* À consommer peu souvent : choix moins intéressants en raison de leur plus grande teneur en lipides.',
    columns: [
      { key: 'aliment', label: 'Aliments', align: 'left' },
      { key: 'cal', label: 'Calories (Kcal)' },
      { key: 'prot', label: 'Protéines (g)' },
      { key: 'gluc', label: 'Glucides (g)' },
      { key: 'lip', label: 'Lipides (g)' },
    ],
    rows: [
      { aliment: '30 g d\'Agneau (Jarret)', cal: 56, prot: 7, gluc: 0, lip: 2 },
      { aliment: '30 g de Bison', cal: 43, prot: 6, gluc: 1, lip: 3 },
      { aliment: '30 g de Bœuf (aloyau)', cal: 65, prot: 9, gluc: 0, lip: 1 },
      { aliment: '30 g de Bœuf haché extra maigre', cal: 47, prot: 10, gluc: 0, lip: 2 },
      { aliment: '30 g de Bœuf faux-filet extra-maigre', cal: 52, prot: 9, gluc: 0, lip: 2 },
      { aliment: '30 g de Bœuf haché maigre *', cal: 62, prot: 8, gluc: 0, lip: 1 },
      { aliment: '30 g de Bœuf haché mi-maigre *', cal: 77, prot: 9, gluc: 0, lip: 5 },
      { aliment: '30 g de Bœuf haché régulier *', cal: 91, prot: 9, gluc: 0, lip: 2 },
      { aliment: '30 g de Canard', cal: 37, prot: 9, gluc: 0, lip: 0 },
      { aliment: '30 g de Caribou', cal: 50, prot: 10, gluc: 0, lip: 2 },
      { aliment: '30 g de Cheval', cal: 53, prot: 9, gluc: 0, lip: 1 },
      { aliment: '30 g de Cuisse de poulet', cal: 57, prot: 11, gluc: 0, lip: 1 },
      { aliment: '30 g de Dinde', cal: 45, prot: 8, gluc: 0, lip: 2 },
      { aliment: '30 g d\'Escalope de veau', cal: 57, prot: 8, gluc: 0, lip: 2 },
      { aliment: '30 g de Lapin', cal: 59, prot: 9, gluc: 0, lip: 0 },
      { aliment: '30 g d\'Orignal', cal: 40, prot: 9, gluc: 0, lip: 2 },
      { aliment: '30 g de Poitrine de poulet', cal: 48, prot: 8, gluc: 0, lip: 7 },
      { aliment: '30 g de Poulet haché maigre', cal: 51, prot: 9, gluc: 0, lip: 2 },
      { aliment: '30 g de Porc (Côtes levées de dos) *', cal: 77, prot: 8, gluc: 0, lip: 5 },
      { aliment: '30 g de Filet de porc', cal: 56, prot: 9, gluc: 0, lip: 2 },
      { aliment: '30 g de Sanglier', cal: 48, prot: 8, gluc: 0, lip: 1 },
      { aliment: '15 g de Saucisse *', cal: 59, prot: 9, gluc: 0, lip: 1 },
      { aliment: '30 g de Veau haché', cal: 52, prot: 9, gluc: 0, lip: 3 },
      { aliment: '30 g de Viandes froides (jambon / dinde)', cal: 55, prot: 9, gluc: 0, lip: 2 },
      { aliment: '30 g de Wapiti', cal: 44, prot: 9, gluc: 0, lip: 1 },
      { aliment: '30 g de Jerky de bœuf nature', cal: 57, prot: 9, gluc: 2, lip: 2 },
      { aliment: '30 g de Dinde fumée extra-maigre', cal: 55, prot: 9, gluc: 1, lip: 2 },
      { aliment: '30 g de Poulet en conserve (au naturel) égoutté', cal: 53, prot: 9, gluc: 0, lip: 1 },
    ],
    average: { cal: 55, prot: 9, gluc: 0, lip: 2 },
  },

  autresProteines: {
    title: 'Autres sources protéinées',
    subtitle: 'Une portion d\'AUTRES SOURCES PROTÉINÉES, c\'est :',
    color: '#6A4C93',
    columns: [
      { key: 'aliment', label: 'Aliments', align: 'left' },
      { key: 'cal', label: 'Calories (Kcal)' },
      { key: 'prot', label: 'Protéines (g)' },
      { key: 'gluc', label: 'Glucides (g)' },
      { key: 'lip', label: 'Lipides (g)' },
    ],
    rows: [
      { aliment: '3 Blancs d\'œuf (ou ¼ tasse)', cal: 36, prot: '2,5', gluc: 1, lip: 0 },
      { aliment: '1,5 c. à table de PB2', cal: 78, prot: 9, gluc: 0, lip: 2 },
      { aliment: '½ scoop de Lactosérum (Whey)', cal: 57, prot: 9, gluc: 0, lip: 0 },
      { aliment: '½ scoop de Protéine végétale (pois / riz)', cal: 58, prot: 9, gluc: 1, lip: 2 },
      { aliment: '50 g de Seitan', cal: 60, prot: 12, gluc: 2, lip: 1 },
      { aliment: '100 ml de Core Power, Fairlife (42 g prot./bouteille)', cal: 63, prot: 12, gluc: 2, lip: 2 },
      { aliment: '50 g de Tempeh', cal: 74, prot: 11, gluc: 1, lip: 1 },
      { aliment: '100 g de Tofu ferme', cal: 63, prot: 8, gluc: '7,5', lip: 2 },
      { aliment: '1 Wrap Egglife', cal: 70, prot: 7, gluc: 2, lip: 3 },
      { aliment: '½ scoop de Caséine micellaire', cal: 58, prot: 9, gluc: 1, lip: 2 },
      { aliment: '½ scoop d\'Isolat de whey', cal: 57, prot: 9, gluc: 0, lip: 0 },
      { aliment: '½ scoop de Protéine de bœuf (isolate)', cal: 59, prot: 9, gluc: 1, lip: 2 },
      { aliment: '35 g de Barre protéinée performance', cal: 59, prot: 9, gluc: 2, lip: 2 },
      { aliment: '15 g de Collagène hydrolysé (peptides)', cal: 55, prot: 9, gluc: 0, lip: 0 },
      { aliment: '100 g de Natto fermenté', cal: 60, prot: 9, gluc: 3, lip: 2 },
      { aliment: '150 ml de Boisson protéinée RTD', cal: 58, prot: 9, gluc: 2, lip: 1 },
    ],
    average: { cal: 59, prot: 9, gluc: 2, lip: 2 },
  },

  feculents: {
    title: 'Féculents',
    subtitle: 'Une portion de FÉCULENTS, c\'est :',
    color: '#BC6C25',
    columns: [
      { key: 'aliment', label: 'Aliments', align: 'left' },
      { key: 'prot', label: 'Protéines (g)' },
      { key: 'gluc', label: 'Glucides (g)' },
      { key: 'fib', label: 'Fibres (g)' },
      { key: 'lip', label: 'Lipides (g)' },
      { key: 'cal', label: 'Calories (Kcal)' },
    ],
    rows: [
      { aliment: '½ Bagel (~135 g)', prot: 5, gluc: 18, fib: 0, lip: 1, cal: 108 },
      { aliment: '75 ml de Gruau nature (~25 g), avant cuisson', prot: 2, gluc: 11, fib: 1, lip: 1, cal: 63 },
      { aliment: '35 g de Flocons d\'avoine (50 ml), avant cuisson', prot: 3, gluc: 15, fib: 2, lip: 1, cal: 88 },
      { aliment: '125 ml de Légumineuses cuites (100 g)', prot: 4, gluc: 7, fib: 0, lip: 0, cal: 105 },
      { aliment: '125 ml de Maïs bouilli, égoutté (75 g)', prot: 2, gluc: 11, fib: 0, lip: 0, cal: 64 },
      { aliment: '½ Muffin anglais, pain hot-dog ou hamburger', prot: 4, gluc: 13, fib: 1, lip: 1, cal: 93 },
      { aliment: '125 ml d\'Orge cuit (75 g)', prot: 6, gluc: 16, fib: 1, lip: 0, cal: 109 },
      { aliment: '1 Pain pita de 10,2 cm (blé)', prot: 3, gluc: 15, fib: 1, lip: 0, cal: 109 },
      { aliment: '125 ml de Pâtes cuites (blé) (75 g)', prot: 3, gluc: 20, fib: 0, lip: 0, cal: 72 },
      { aliment: '125 ml de Pomme de terre en purée avec lait', prot: 2, gluc: 14, fib: 0, lip: 0, cal: 102 },
      { aliment: '½ Pomme de terre moyenne (Douce) (75 g)', prot: 3, gluc: 1, fib: 1, lip: 0, cal: 82 },
      { aliment: '125 ml de Quinoa cuit (75 g)', prot: 8, gluc: 1, fib: 0, lip: 0, cal: 116 },
      { aliment: '125 ml de Sarrasin cuit (75 g)', prot: 3, gluc: 16, fib: 1, lip: 0, cal: 85 },
      { aliment: '125 ml de Riz cuit (100 g)', prot: 2, gluc: 22, fib: 3, lip: 0, cal: 91 },
      { aliment: '125 ml de Topinambour', prot: 3, gluc: 22, fib: 2, lip: 0, cal: 111 },
      { aliment: '1 Tranche de pain (blé)', prot: 3, gluc: 19, fib: 1, lip: 0, cal: 76 },
      { aliment: '1 tranche de Pain germé (sans farine enrichie)', prot: 4, gluc: 15, fib: 3, lip: 0, cal: 80 },
      { aliment: '125 ml de Céréales à déjeuner peu sucrées', prot: 4, gluc: 25, fib: 0, lip: 0, cal: 85 },
      { aliment: '125 ml de Couscous cuit (75 g)', prot: 2, gluc: 23, fib: 0, lip: 0, cal: 62 },
      { aliment: '2 Galettes de riz (~20 g)', prot: 3, gluc: 14, fib: 1, lip: 0, cal: 74 },
      { aliment: '45 g de Flocons d\'avoine (sec, ~60 ml)', prot: 4, gluc: 15, fib: 2, lip: 0, cal: 88 },
      { aliment: '125 ml de Lentilles Beluga cuites (100 g)', prot: 4, gluc: 14, fib: 2, lip: 0, cal: 87 },
      { aliment: '1 tranche de Pain Ezekiel germé (34 g)', prot: 4, gluc: 15, fib: 3, lip: 0, cal: 84 },
    ],
    average: { prot: 4, gluc: 15, fib: 1, lip: 0, cal: 89 },
  },

  laitier: {
    title: 'Produits laitiers',
    subtitle: 'Une portion de PRODUIT LAITIER, c\'est :',
    color: '#4895EF',
    columns: [
      { key: 'aliment', label: 'Aliments', align: 'left' },
      { key: 'prot', label: 'Protéines (g)' },
      { key: 'gluc', label: 'Glucides (g)' },
      { key: 'fib', label: 'Fibres (g)' },
      { key: 'lip', label: 'Lipides (g)' },
      { key: 'cal', label: 'Calories (Kcal)' },
    ],
    rows: [
      { aliment: '100 ml de Yogourt 1-2 % sans sucre ajouté (100 g)', prot: 6, gluc: 6, fib: 0, lip: 2, cal: 78 },
      { aliment: '100 ml de Yogourt grec (100 g)', prot: 1, gluc: 3, fib: 0, lip: 0, cal: 67 },
      { aliment: '100 g de Skyr 0 % nature', prot: 11, gluc: 4, fib: 0, lip: 0, cal: 62 },
      { aliment: '100 ml de Kéfir nature ou aux fruits (100 g)', prot: 1, gluc: 2, fib: 0, lip: 0, cal: 54 },
      { aliment: '¾ tasse de Lait 1-2 %', prot: 5, gluc: 3, fib: 0, lip: 0, cal: 89 },
      { aliment: '150 ml de Lait filtré haute protéine (1 %)', prot: 8, gluc: 4, fib: 0, lip: 0, cal: 75 },
      { aliment: '1 tasse de Boisson d\'amandes / orge / riz nature', prot: 13, gluc: 3, fib: 0, lip: 0, cal: 91 },
      { aliment: '½ tasse de Boisson d\'amandes / orge / riz à la vanille', prot: 10, gluc: 3, fib: 0, lip: 0, cal: 67 },
      { aliment: '¾ tasse de Boisson de soya', prot: 15, gluc: 1, fib: 0, lip: 0, cal: 88 },
      { aliment: '½ bouteille de Core Power, Fairlife (26 g prot./bouteille)', prot: 10, gluc: 2, fib: 0, lip: 0, cal: 60 },
      { aliment: '30 g de Fromage Allegro 9 %', prot: 8, gluc: 5, fib: 0, lip: 0, cal: 77 },
      { aliment: '125 ml de Fromage cottage 1 %', prot: 9, gluc: 3, fib: 0, lip: 0, cal: 83 },
      { aliment: '50 g de Ricotta partiellement écrémée', prot: 7, gluc: 2, fib: 0, lip: 2, cal: 69 },
      { aliment: '25 g de Fromage suisse léger COGRUET (1 tranche)', prot: 4, gluc: 1, fib: 0, lip: 0, cal: 59 },
      { aliment: '125 ml de NATREL PLUS 2 %', prot: 5, gluc: 2, fib: 0, lip: 0, cal: 66 },
      { aliment: '30 g de fromage Le Six pourcent (Bergeron)', prot: 10, gluc: 0, fib: 0, lip: 0, cal: 82 },
      { aliment: '125 g de Yaourt grec 0 % nature', prot: 7, gluc: 3, fib: 0, lip: 0, cal: 72 },
      { aliment: '150 ml de Lait au chocolat protéiné 1 %', prot: 7, gluc: 3, fib: 0, lip: 0, cal: 73 },
      { aliment: '100 g de Fromage cottage 2 %', prot: 7, gluc: 3, fib: 0, lip: 0, cal: 74 },
    ],
    average: { prot: 7, gluc: 3, fib: 0, lip: 0, cal: 74 },
  },
};

function hasLipidGroups(columns) {
  return columns.some(c => c.group === 'Lipides');
}

function renderTable(sectionKey, section) {
  const { columns, rows, average, color } = section;
  const lipidGroup = hasLipidGroups(columns);
  const avgLbl = t(I18N.UI.fr.average, I18N.UI.en.average);
  const lipGroup = t(I18N.COLUMNS.fr.groupLipides, I18N.COLUMNS.en.groupLipides);

  let headerHtml;
  if (lipidGroup) {
    const lipIdx = columns.findIndex(c => c.group === 'Lipides');
    const beforeLip = columns.slice(0, lipIdx);
    const lipCols = columns.filter(c => c.group === 'Lipides');
    const afterLip = columns.slice(lipIdx + lipCols.length);

    headerHtml = `<thead>
      <tr class="header-main">
        ${beforeLip.map(c => `<th rowspan="2">${colLabel(c.key, c.label)}</th>`).join('')}
        <th colspan="${lipCols.length}" class="group-header">${lipGroup}</th>
        ${afterLip.map(c => `<th rowspan="2">${colLabel(c.key, c.label)}</th>`).join('')}
      </tr>
      <tr class="header-sub">
        ${lipCols.map(c => `<th>${colLabelShort(c.key, c.label)}</th>`).join('')}
      </tr>
    </thead>`;
  } else {
    headerHtml = `<thead><tr class="header-main">${columns.map(c => `<th>${colLabel(c.key, c.label)}</th>`).join('')}</tr></thead>`;
  }

  const bodyRows = rows.map((row, i) => {
    const cells = columns.map(c => {
      const val = c.key === 'aliment'
        ? foodLabel(sectionKey, i, row.aliment)
        : (row[c.key] ?? '—');
      const cls = c.align === 'left' ? 'cell-aliment' : 'cell-num';
      return `<td class="${cls}">${val}</td>`;
    }).join('');
    return `<tr class="${i % 2 === 0 ? 'even' : 'odd'}">${cells}</tr>`;
  }).join('');

  const avgCells = columns.map(c => {
    const val = average?.[c.key] ?? '—';
    const cls = c.align === 'left' ? 'cell-aliment avg-label' : 'cell-num';
    const content = c.key === 'aliment' ? `<strong>${avgLbl}</strong>` : `<strong>${val}</strong>`;
    return `<td class="${cls}">${content}</td>`;
  }).join('');

  const badgeHtml = section.badge
    ? `<span class="badge">${sectionField(sectionKey, 'badge')}</span>`
    : '';
  const noteHtml = section.note
    ? `<p class="section-note">${sectionField(sectionKey, 'note')}</p>`
    : '';

  return `
    <div class="section" style="--accent: ${color}">
      <div class="section-header">
        <div class="section-title-block">
          <span class="section-icon">${sectionIcon(sectionKey)}</span>
          <div>
            <h2>${sectionField(sectionKey, 'title')}</h2>
            <p class="section-subtitle">${sectionField(sectionKey, 'subtitle')}</p>
          </div>
        </div>
        ${badgeHtml}
      </div>
      ${noteHtml}
      <table>
        ${headerHtml}
        <tbody>${bodyRows}<tr class="average-row">${avgCells}</tr></tbody>
      </table>
    </div>`;
}

function sectionIcon(sectionKey) {
  const icons = {
    noix: '🥜',
    matiereGrasse: '🫒',
    legumes: '🥦',
    fruits: '🍎',
    poissons: '🐟',
    viandes: '🥩',
    autresProteines: '🥚',
    feculents: '🍞',
    laitier: '🥛',
  };
  return icons[sectionKey] || '📋';
}

const INDEX_ID = 'index';

function btnIndexLink(variant = 'header') {
  return btnIndexLinkLang(variant, 'fr');
}

function btnIndexLinkLang(variant, lang) {
  const href = `#${indexId(lang)}`;
  const ui = I18N.UI;
  if (variant === 'footer') {
    return `<a href="${href}" class="btn-index btn-index-bottom">${L(lang, ui.fr.buttons.backToIndex, ui.en.buttons.backToIndex)}</a>`;
  }
  return `<a href="${href}" class="btn-index">${L(lang, ui.fr.buttons.index, ui.en.buttons.index)}</a>`;
}

function pdfLangButton(lang) {
  const target = lang === 'fr' ? '#lang-en' : '#lang-fr';
  const label = lang === 'fr' ? 'Passer en anglais' : 'Passer en français';
  const sub = lang === 'fr' ? 'Version anglaise complète' : 'Version française complète';
  return `
<div class="lang-bar lang-bar-in-cover">
  <a href="${target}" class="lang-pdf-btn">
    <span class="lang-pdf-btn-icon">🌐</span>
    <span class="lang-pdf-btn-label">${label}</span>
    <span class="lang-pdf-btn-sub">${sub}</span>
  </a>
</div>`;
}

const TAG_CLASS = {
  prot: 'tag-prot', gluc: 'tag-gluc', fib: 'tag-fib', lip: 'tag-lip',
  sat: 'tag-lip', poly: 'tag-lip', mono: 'tag-lip',
};

function renderMobileItemLang(sectionKey, row, rowIndex, columns, lang, isAvg = false) {
  const calCol = columns.find(c => c.key === 'cal');
  const metricCols = columns.filter(c => c.key !== 'aliment' && c.key !== 'cal');
  const cal = calCol ? row.cal : null;

  const tags = metricCols.map(c => {
    const lbl = L(lang, I18N.UI.fr.tagLabels[c.key], I18N.UI.en.tagLabels[c.key]) || c.key;
    const cls = TAG_CLASS[c.key] || 'tag-neutral';
    return `<span class="tag ${cls}">${lbl} ${row[c.key] ?? '—'}g</span>`;
  }).join('');

  const kcalHtml = cal != null
    ? `<span class="item-kcal">${cal}<small>kcal</small></span>`
    : '';

  const name = isAvg
    ? `<strong>${L(lang, I18N.UI.fr.average, I18N.UI.en.average)}</strong>`
    : (lang === 'en' ? I18N.FOODS[sectionKey][rowIndex] : row.aliment);

  return `
    <article class="item${isAvg ? ' item-avg' : ''}">
      <div class="item-top">
        <span class="item-name">${name}</span>
        ${kcalHtml}
      </div>
      <div class="item-tags">${tags}</div>
    </article>`;
}

function renderMobileListLang(sectionKey, section, lang) {
  const { columns, rows, average, color } = section;
  const sec = I18N.SECTIONS[sectionKey];
  const items = rows.map((r, i) => renderMobileItemLang(sectionKey, r, i, columns, lang)).join('');
  const avgItem = renderMobileItemLang(sectionKey, { ...average, aliment: '' }, -1, columns, lang, true);

  const badgePart = sec[lang].badge
    ? ` · <span class="badge">${sec[lang].badge}</span>`
    : '';

  return `
    <section class="section" style="--accent:${color}">
      <header class="section-header">
        <div class="section-title-block">
          <span class="section-icon">${sectionIcon(sectionKey)}</span>
          <div>
            <h2>${sec[lang].title}</h2>
            <p class="section-subtitle">${sec[lang].subtitle}${badgePart}</p>
          </div>
        </div>
        <div class="section-actions">
          <span class="cat-count">${rows.length}</span>
          ${btnIndexLinkLang('header', lang)}
        </div>
      </header>
      ${sec[lang].note ? `<p class="section-note">${sec[lang].note}</p>` : ''}
      <div class="item-list">${items}${avgItem}</div>
      ${btnIndexLinkLang('footer', lang)}
    </section>`;
}

function renderMobileItem(sectionKey, row, rowIndex, columns, isAvg = false) {
  return renderMobileItemLang(sectionKey, row, rowIndex, columns, 'fr', isAvg);
}

function renderMobileList(sectionKey, section) {
  return renderMobileListLang(sectionKey, section, 'fr');
}

function buildCoverHtmlLang(b, brandKey, lang) {
  const ui = I18N.UI;
  const brand = I18N.BRANDS[brandKey];
  return `
<div class="cover">
  <div class="cover-main">
    <div class="cover-logo-wrap ${b.coverWrap}">
      <img class="cover-logo" src="${assetUrl(b.logoFull)}" alt="${brand[lang].alt}" />
    </div>
    <div class="cover-badge">${brand[lang].badge}</div>
    <h1>${ui[lang].titleLine1}<br>${ui[lang].titleLine2}</h1>
    <p class="cover-tagline">${ui[lang].tagline}</p>
    <div class="cover-stats">
      <div class="cover-stat"><span class="num">${ui[lang].stats.categories.num}</span><span class="lbl">${ui[lang].stats.categories.label}</span></div>
      <div class="cover-stat"><span class="num">${ui[lang].stats.foods.num}</span><span class="lbl">${ui[lang].stats.foods.label}</span></div>
      <div class="cover-stat"><span class="num">${ui[lang].stats.nutrients.num}</span><span class="lbl">${ui[lang].stats.nutrients.label}</span></div>
    </div>
  </div>
  <div class="cover-bottom">
    <p class="cover-ecosystem">${brand[lang].ecosystem}</p>
    ${pdfLangButton(lang)}
  </div>
</div>`;
}

function buildCoverHtml(b, brandKey) {
  return buildCoverHtmlLang(b, brandKey, 'fr');
}

function buildGuideStepsHtmlLang(lang) {
  const steps = I18N.UI[lang].guide.steps;
  return steps.map((step, i) =>
    `<li><span class="step-n">${i + 1}</span><div class="step-body"><strong>${step.title}</strong><span>${step.text}</span></div></li>`
  ).join('');
}

function buildGuideStepsHtml() {
  return buildGuideStepsHtmlLang('fr');
}

function buildMobileEdition(brandKey, lang) {
  const b = getBrand(brandKey);
  const logoTransparent = assetUrl(b.logoWatermark);
  const sectionEntries = Object.entries(DATA);
  const ui = I18N.UI;
  const legend = ui[lang].guide.legend;
  const brand = I18N.BRANDS[brandKey];

  const toc = sectionEntries.map(([key, s], i) =>
    `<li><a href="#section-${lang}-${i}"><span class="toc-num">${String(i + 1).padStart(2, '0')}</span><span class="dot" style="background:${s.color}"></span><span class="toc-label">${I18N.SECTIONS[key][lang].title}</span><span class="toc-chevron">›</span></a></li>`
  ).join('');

  const sectionHtml = sectionEntries.map(([key, s], i) =>
    `<div id="section-${lang}-${i}"${i === 0 ? ' class="section-start"' : ''}>${renderMobileListLang(key, s, lang)}</div>`
  ).join('');

  return `
${buildCoverHtmlLang(b, brandKey, lang)}
<div id="${indexId(lang)}" class="toc-page">
  <div class="guide-block">
    <h2 class="page-title">${ui[lang].guide.title}</h2>
    <p class="sub">${ui[lang].guide.subtitle}</p>
    <ol class="guide-steps">${buildGuideStepsHtmlLang(lang)}</ol>
    <div class="macro-legend">
      <span class="lg-prot">${legend.prot}</span>
      <span class="lg-gluc">${legend.gluc}</span>
      <span class="lg-fib">${legend.fib}</span>
      <span class="lg-lip">${legend.lip}</span>
      <span class="lg-kcal">${legend.kcal}</span>
    </div>
  </div>
  <h2 class="toc-heading">${ui[lang].tocMobile.heading}</h2>
  <p class="sub">${ui[lang].tocMobile.subtitle}</p>
  <ol class="toc-list">${toc}</ol>
</div>
<div class="content-wrap">
  <div class="brand-watermark brand-${b.id}" aria-hidden="true">
    <img src="${logoTransparent}" alt="" />
    <p class="brand-watermark-text">${brand[lang].watermarkHtml.replace('<br>', '<br />')}</p>
  </div>
  ${sectionHtml}
</div>`;
}

function buildHtmlMobile(brandKey = 'kinetics') {
  const b = getBrand(brandKey);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
${MOBILE_VIEWPORT_META}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Serif+Display&display=swap" rel="stylesheet">
<style>
  ${LANG_PDF_BTN_CSS}
  :root {
    --ink: #1a1a2e;
    --muted: #64748b;
    --line: #e2e8f0;
    --border: #e2e8f0;
    --bg: #ffffff;
    --surface: #f8fafc;
    --avg-bg: #fef3c7;
    --brand-accent: ${b.accent};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'DM Sans', system-ui, sans-serif;
    color: var(--ink);
    background: var(--bg);
    font-size: 9pt;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  img { image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; }
  .content-wrap { position: relative; z-index: 1; }

  .brand-watermark {
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    z-index: 0; pointer-events: none;
    width: 280px; text-align: center;
  }
  .brand-watermark img { width: 100%; height: auto; opacity: 0.075; }
  .brand-watermark.brand-elevate img {
    opacity: 0.045;
    mix-blend-mode: lighten;
  }
  .brand-watermark.brand-elevate .brand-watermark-text {
    opacity: 0.1;
  }
  .brand-watermark-text {
    margin-top: 10px; font-size: 7pt; font-weight: 600;
    letter-spacing: 0.3em; text-transform: uppercase;
    color: var(--brand-accent); opacity: 0.2; line-height: 1.55;
  }

  /* ── Couverture premium (alignée paysage) ── */
  .cover {
    position: relative; z-index: 10;
    display: flex; flex-direction: column;
    justify-content: space-between; align-items: center;
    text-align: center;
    padding: 36px 28px 28px;
    min-height: 100vh;
    min-height: 277mm;
    height: 277mm;
    box-sizing: border-box;
    background: linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    color: #fff;
    break-after: page;
    page-break-after: always;
  }
  .cover-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 100%;
    min-height: 0;
  }
  .cover-bottom {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    flex-shrink: 0;
    padding-top: 8px;
  }
  .cover-logo-wrap {
    border-radius: 14px;
    padding: 22px 26px 18px; margin-bottom: 22px;
    width: 100%; max-width: 300px;
  }
  .cover-logo-wrap.light {
    background: #fff;
    box-shadow: 0 24px 64px rgba(0,0,0,0.35);
  }
  .cover-logo-wrap.dark {
    background: #000;
    border: 1px solid rgba(201, 162, 39, 0.35);
    box-shadow: 0 24px 64px rgba(0,0,0,0.45);
    padding: 14px 18px 10px;
  }
  .cover-logo-wrap.elevate {
    background: transparent;
    padding: 0;
    box-shadow: none;
    border: none;
    max-width: 320px;
  }
  .cover-logo { width: 100%; height: auto; display: block; }
  .cover-badge {
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.22);
    padding: 5px 14px; border-radius: 20px;
    font-size: 7pt; letter-spacing: 0.14em;
    text-transform: uppercase; margin-bottom: 14px;
  }
  .cover h1 {
    font-family: 'DM Serif Display', Georgia, serif;
    font-size: 28pt; font-weight: 400; line-height: 1.08; margin-bottom: 12px;
  }
  .cover-tagline {
    font-size: 9.5pt; opacity: 0.78; max-width: 300px;
    line-height: 1.55; margin-bottom: 20px;
  }
  .cover-stats {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    max-width: 280px;
    margin-top: 4px;
  }
  .cover-stat {
    text-align: center;
    padding: 10px 14px;
    border-radius: 10px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
  }
  .cover-stat .num {
    font-size: 22pt; font-weight: 700; color: ${b.statColor};
    display: block; line-height: 1;
  }
  .cover-stat .lbl {
    font-size: 7pt; opacity: 0.6; text-transform: uppercase;
    letter-spacing: 0.08em; margin-top: 5px; display: block;
  }
  .cover-ecosystem {
    margin-top: 0; font-size: 6.5pt;
    letter-spacing: 0.24em; text-transform: uppercase; opacity: 0.45;
  }

  /* ── Page index + guide ── */
  .toc-page {
    padding: 22px 20px 18px;
    break-before: page;
    page-break-before: always;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .toc-page .page-title {
    font-family: 'DM Serif Display', serif;
    font-size: 16pt; margin-bottom: 2px; color: var(--ink);
  }
  .toc-page .sub { color: var(--muted); font-size: 8pt; margin-bottom: 12px; line-height: 1.4; }
  .guide-block {
    margin-bottom: 14px; padding-bottom: 14px;
    border-bottom: 1px solid var(--line);
  }
  .guide-steps {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 10px;
  }
  .guide-steps li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    background: var(--surface);
    border-radius: 10px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    box-shadow: 0 1px 2px rgba(15,23,42,0.04);
  }
  .step-n {
    flex-shrink: 0;
    width: 22px; height: 22px;
    background: var(--brand-accent); color: #fff;
    border-radius: 50%; font-size: 7.5pt; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }
  .step-body { flex: 1; min-width: 0; }
  .step-body strong { display: block; font-size: 8pt; line-height: 1.25; margin-bottom: 2px; }
  .step-body span { font-size: 7pt; color: var(--muted); line-height: 1.4; }
  .macro-legend { display: flex; flex-wrap: wrap; gap: 4px; }
  .macro-legend span {
    font-size: 6.5pt; font-weight: 600;
    padding: 3px 8px; border-radius: 20px;
  }
  .lg-prot { background: #dbeafe; color: #1d4ed8; }
  .lg-gluc { background: #fef3c7; color: #b45309; }
  .lg-fib  { background: #dcfce7; color: #15803d; }
  .lg-lip  { background: #fce7f3; color: #be185d; }
  .lg-kcal { background: #f1f5f9; color: #475569; }
  .toc-heading {
    font-family: 'DM Serif Display', serif;
    font-size: 14pt; margin-bottom: 2px; color: var(--ink);
  }
  .toc-list { list-style: none; }
  .toc-list li { margin-bottom: 7px; }
  .toc-list a {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px;
    min-height: 44px;
    text-decoration: none;
    color: var(--ink); font-weight: 600; font-size: 9.5pt;
    background: var(--bg); border-radius: 10px;
    border: 1px solid var(--line);
    box-shadow: 0 1px 3px rgba(15,23,42,0.05);
  }
  .toc-num {
    font-size: 7.5pt; color: var(--muted); font-weight: 600;
    min-width: 20px; font-variant-numeric: tabular-nums;
  }
  .dot {
    width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  }
  .toc-label { flex: 1; line-height: 1.25; }
  .toc-chevron { color: var(--muted); font-size: 15pt; font-weight: 400; line-height: 1; }

  /* ── Sections (style professionnel) ── */
  .section-start { break-before: page; page-break-before: always; }
  .section { padding: 18px 16px 8px; }
  .section-header {
    display: flex; align-items: flex-start;
    justify-content: space-between; gap: 10px;
    margin-bottom: 12px; padding-bottom: 10px;
    border-bottom: 3px solid var(--accent);
  }
  .section-title-block { display: flex; gap: 10px; align-items: flex-start; flex: 1; min-width: 0; }
  .section-icon { font-size: 20pt; line-height: 1; flex-shrink: 0; margin-top: 1px; }
  .section h2 {
    font-family: 'DM Serif Display', serif;
    font-size: 14pt; font-weight: 400; color: var(--accent); line-height: 1.15;
  }
  .section-subtitle {
    font-size: 7.5pt; color: var(--muted); margin-top: 3px;
    font-weight: 500; line-height: 1.35;
  }
  .badge {
    display: inline-block; background: var(--accent); color: #fff;
    font-size: 6pt; font-weight: 700; padding: 2px 7px;
    border-radius: 8px; letter-spacing: 0.04em;
  }
  .section-actions {
    flex-shrink: 0;
    display: flex; flex-direction: column;
    align-items: flex-end; gap: 6px;
  }
  .cat-count {
    font-size: 7pt; font-weight: 700;
    color: var(--accent); background: #fff;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line));
    border-radius: 20px; padding: 3px 9px;
    font-variant-numeric: tabular-nums;
  }
  a.btn-index {
    display: inline-flex; align-items: center; justify-content: center;
    text-decoration: none; cursor: pointer;
    font-size: 6.5pt; font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--accent);
    background: #fff;
    border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--line));
    border-radius: 20px;
    padding: 4px 10px;
    white-space: nowrap;
  }
  a.btn-index-bottom {
    display: flex; align-items: center; justify-content: center;
    width: 100%; margin-top: 12px; margin-bottom: 8px;
    font-size: 8pt; font-weight: 600;
    padding: 10px 14px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 8%, #fff);
    border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--line));
    color: var(--accent);
  }
  .section-note {
    font-size: 7.5pt; color: var(--muted); margin: 0 0 10px 0;
    line-height: 1.4; font-style: italic;
    padding: 7px 10px; background: var(--surface);
    border-left: 3px solid var(--accent);
    border-radius: 0 4px 4px 0;
  }

  /* ── Liste aliments ── */
  .item-list {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 1px 4px rgba(15,23,42,0.06);
  }
  .item {
    padding: 9px 12px 8px;
    border-bottom: 1px solid var(--border);
    break-inside: avoid;
    page-break-inside: avoid;
    background: var(--bg);
  }
  .item:nth-child(even) { background: var(--surface); }
  .item:last-child { border-bottom: none; }
  .item-top {
    display: flex; align-items: flex-start;
    justify-content: space-between; gap: 10px;
    margin-bottom: 6px;
  }
  .item-name {
    font-size: 8.5pt; font-weight: 600;
    line-height: 1.35; color: var(--ink); flex: 1;
  }
  .item-kcal {
    flex-shrink: 0; font-size: 10pt; font-weight: 700;
    color: var(--brand-accent); font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
  .item-kcal small {
    font-size: 6.5pt; font-weight: 600;
    opacity: 0.75; margin-left: 1px;
  }
  .item-tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .tag {
    font-size: 6.5pt; font-weight: 600;
    padding: 2px 8px; border-radius: 20px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
  }
  .tag-prot { background: #eff6ff; color: #1d4ed8; }
  .tag-gluc { background: #fffbeb; color: #b45309; }
  .tag-fib  { background: #f0fdf4; color: #15803d; }
  .tag-lip  { background: #fdf2f8; color: #9d174d; }
  .tag-neutral { background: #f1f5f9; color: #475569; }

  .item-avg {
    background: var(--avg-bg) !important;
    border-top: 2px solid var(--accent);
  }
  .item-avg .item-name { color: var(--accent); font-weight: 700; }
  .item-avg .item-kcal { color: var(--accent); }

  @page { size: A4 portrait; margin: 8mm 10mm 12mm 10mm; }
  @media print {
    .cover {
      min-height: 277mm;
      height: 277mm;
      break-after: page;
      page-break-after: always;
    }
    .item { break-inside: avoid; page-break-inside: avoid; }
    .toc-page { break-inside: auto; }
  }
</style>
</head>
<body class="mobile-doc">

<div id="lang-fr" class="edition-wrap">
${buildMobileEdition(brandKey, 'fr')}
</div>

<div id="lang-en" class="edition-wrap edition-en">
${buildMobileEdition(brandKey, 'en')}
</div>

</body>
</html>`;
}

function buildHtmlLandscape(brandKey = 'kinetics') {
  const b = getBrand(brandKey);
  const logoTransparent = assetUrl(b.logoWatermark);
  const ui = I18N.UI;
  const sectionEntries = Object.entries(DATA);

  const toc = sectionEntries.map(([key, s], i) =>
    `<li><a href="#section-${i}"><span class="toc-num">${String(i + 1).padStart(2, '0')}</span>${sectionField(key, 'title')}</a></li>`
  ).join('');

  const sectionHtml = sectionEntries.map(([key, s], i) =>
    `<div id="section-${i}" class="page-break">${renderTable(key, s)}</div>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Serif+Display&display=swap" rel="stylesheet">
<style>
  :root {
    --ink: #1a1a2e;
    --muted: #64748b;
    --border: #e2e8f0;
    --bg: #ffffff;
    --bg-alt: #f8fafc;
    --avg-bg: #fef3c7;
    --brand-accent: ${b.accent};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'DM Sans', system-ui, sans-serif;
    color: var(--ink);
    background: var(--bg);
    font-size: 9pt;
    line-height: 1.4;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .content-wrap {
    position: relative;
    z-index: 1;
  }

  /* Filigrane — dans content-wrap pour ne pas toucher la couverture */
  .brand-watermark {
    position: fixed;
    top: 50%;
    left: 68%;
    transform: translate(-50%, -50%);
    z-index: 0;
    pointer-events: none;
    text-align: center;
    width: 380px;
  }
  .brand-watermark img {
    width: 100%;
    height: auto;
    opacity: 0.075;
  }
  .brand-watermark.brand-elevate img {
    opacity: 0.045;
    mix-blend-mode: lighten;
  }
  .brand-watermark.brand-elevate .brand-watermark-text {
    opacity: 0.1;
  }
  .brand-watermark-text {
    margin-top: 14px;
    font-size: 7.5pt;
    font-weight: 600;
    letter-spacing: 0.34em;
    text-transform: uppercase;
    color: var(--brand-accent);
    opacity: 0.2;
    line-height: 1.6;
  }

  /* Couverture */
  .cover {
    position: relative;
    z-index: 10;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 40px 48px;
    background: linear-gradient(145deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    color: white;
    page-break-after: always;
  }
  .cover-logo-wrap {
    border-radius: 16px;
    padding: 28px 40px 22px;
    margin-bottom: 32px;
  }
  .cover-logo-wrap.light {
    background: #ffffff;
    box-shadow: 0 24px 64px rgba(0,0,0,0.35);
  }
  .cover-logo-wrap.dark {
    background: #000000;
    border: 1px solid rgba(201, 162, 39, 0.35);
    box-shadow: 0 24px 64px rgba(0,0,0,0.45);
    padding: 20px 28px 16px;
  }
  .cover-logo-wrap.elevate {
    background: transparent;
    padding: 0;
    box-shadow: none;
    border: none;
    max-width: 420px;
  }
  .cover-logo {
    width: 420px;
    max-width: 72vw;
    height: auto;
    display: block;
  }
  .cover-badge {
    background: rgba(255,255,255,0.12);
    border: 1px solid rgba(255,255,255,0.22);
    padding: 6px 16px;
    border-radius: 20px;
    font-size: 8pt;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 20px;
  }
  .cover h1 {
    font-family: 'DM Serif Display', Georgia, serif;
    font-size: 40pt;
    font-weight: 400;
    line-height: 1.1;
    margin-bottom: 14px;
  }
  .cover-tagline {
    font-size: 11pt;
    opacity: 0.78;
    max-width: 520px;
    margin-bottom: 36px;
    line-height: 1.55;
  }
  .cover-stats {
    display: flex;
    gap: 44px;
    margin-top: 4px;
  }
  .cover-stat { text-align: center; }
  .cover-stat .num {
    font-size: 28pt;
    font-weight: 700;
    color: ${b.statColor};
    display: block;
    line-height: 1;
  }
  .cover-stat .lbl {
    font-size: 8pt;
    opacity: 0.6;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-top: 6px;
    display: block;
  }
  .cover-ecosystem {
    margin-top: 32px;
    font-size: 7.5pt;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    opacity: 0.45;
  }

  /* TOC */
  .toc-page {
    padding: 40px 48px;
    page-break-after: always;
    position: relative;
  }
  .toc-page h2 {
    font-family: 'DM Serif Display', serif;
    font-size: 22pt;
    margin-bottom: 8px;
    color: var(--ink);
  }
  .toc-page .toc-desc { color: var(--muted); margin-bottom: 32px; font-size: 10pt; }
  .toc-list { list-style: none; }
  .toc-list li { border-bottom: 1px solid var(--border); }
  .toc-list a {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 0;
    text-decoration: none;
    color: var(--ink);
    font-weight: 500;
    font-size: 11pt;
  }
  .toc-num {
    font-size: 8pt;
    color: var(--muted);
    font-weight: 600;
    min-width: 24px;
  }

  /* Sections */
  .page-break { page-break-before: always; }
  .page-break:first-of-type { page-break-before: auto; }
  .section { padding: 32px 40px 40px; }
  .section-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 3px solid var(--accent);
  }
  .section-title-block { display: flex; gap: 14px; align-items: flex-start; }
  .section-icon { font-size: 22pt; line-height: 1; margin-top: 2px; }
  .section h2 {
    font-family: 'DM Serif Display', serif;
    font-size: 18pt;
    color: var(--accent);
    line-height: 1.2;
  }
  .section-subtitle {
    font-size: 9pt;
    color: var(--muted);
    margin-top: 2px;
    font-weight: 500;
  }
  .badge {
    background: var(--accent);
    color: white;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 8pt;
    font-weight: 600;
    white-space: nowrap;
    align-self: center;
  }
  .section-note {
    font-size: 7.5pt;
    color: var(--muted);
    font-style: italic;
    margin-bottom: 12px;
    padding: 8px 12px;
    background: var(--bg-alt);
    border-left: 3px solid var(--accent);
    border-radius: 0 4px 4px 0;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8pt;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  thead { background: var(--accent); color: white; }
  .header-main th {
    padding: 8px 10px;
    font-weight: 600;
    text-align: center;
    font-size: 7.5pt;
    letter-spacing: 0.02em;
  }
  .header-sub th {
    padding: 5px 8px;
    font-weight: 500;
    text-align: center;
    font-size: 7pt;
    background: color-mix(in srgb, var(--accent) 85%, black);
  }
  .group-header { border-bottom: 1px solid rgba(255,255,255,0.2); }
  th:first-child, .cell-aliment { text-align: left !important; }
  tbody tr.even { background: var(--bg); }
  tbody tr.odd { background: var(--bg-alt); }
  td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  .cell-aliment { font-weight: 500; max-width: 220px; }
  .cell-num { text-align: center; font-variant-numeric: tabular-nums; color: #334155; }
  .average-row { background: var(--avg-bg) !important; }
  .average-row td { border-top: 2px solid var(--accent); font-weight: 600; }
  .avg-label { color: var(--accent); }

  /* Footer */
  .doc-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 8px 40px;
    font-size: 7pt;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
    border-top: 1px solid var(--border);
    background: white;
  }

  @page {
    size: A4 landscape;
    margin: 12mm 10mm 18mm 10mm;
  }
  @media print {
    .cover { min-height: 190mm; }
    .section { padding: 20px 0; }
  }
</style>
</head>
<body>

${buildCoverHtml(b, brandKey)}

<div class="content-wrap">
  <div class="brand-watermark brand-${b.id}" aria-hidden="true">
    <img src="${logoTransparent}" alt="" />
    <p class="brand-watermark-text">${brandField(brandKey, 'watermarkHtml')}</p>
  </div>

  <div class="toc-page">
    <h2>${t(ui.fr.tocLandscape.title, ui.en.tocLandscape.title)}</h2>
    <p class="toc-desc">${t(ui.fr.tocLandscape.description, ui.en.tocLandscape.description)}</p>
    <ol class="toc-list">${toc}</ol>
  </div>

  ${sectionHtml}
</div>

</body>
</html>`;
}

async function applyLangOnPage(page, lang) {
  if (lang !== 'en') return;
  await page.evaluate(() => {
    document.documentElement.lang = 'en';
    document.querySelectorAll('.t').forEach((el) => {
      if (el.dataset.frHtml !== undefined) {
        el.innerHTML = el.dataset.enHtml;
      } else {
        el.textContent = el.dataset.en;
      }
    });
  });
}

async function renderPdf({ html, outputPath, landscape, viewport, footerHtml, brandKey = 'kinetics', lang = 'fr' }) {
  const suffix = brandKey === 'elevate' ? '-elevate' : '';
  const htmlPath = path.join(__dirname, landscape ? `equivalents${suffix}.html` : `equivalents-mobile${suffix}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.fonts.ready);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await applyLangOnPage(page, lang);

  await page.pdf({
    path: outputPath,
    format: 'A4',
    landscape,
    printBackground: true,
    preferCSSPageSize: true,
    margin: landscape
      ? { top: '10mm', bottom: '14mm', left: '10mm', right: '10mm' }
      : { top: '8mm', bottom: '12mm', left: '10mm', right: '10mm' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: footerHtml,
  });

  await browser.close();
  console.log('PDF généré :', outputPath);
}

async function generateLandscape(brandKey = 'kinetics', lang = 'fr') {
  const b = getBrand(brandKey);
  assertBrandAssets(b);
  const outputPath = brandKey === 'elevate' ? OUTPUT_LANDSCAPE_ELEVATE : OUTPUT_LANDSCAPE;
  await renderPdf({
    html: buildHtmlLandscape(brandKey),
    outputPath,
    landscape: true,
    viewport: { width: 1400, height: 900, deviceScaleFactor: 2 },
    footerHtml: buildFooterHtml(b, 36),
    brandKey,
    lang,
  });
}

async function generateMobile(brandKey = 'kinetics') {
  const b = getBrand(brandKey);
  assertBrandAssets(b);
  const outputPath = brandKey === 'elevate' ? OUTPUT_MOBILE_ELEVATE : OUTPUT_MOBILE;
  const html = buildHtmlMobile(brandKey);
  const pdfOpts = {
    html,
    outputPath,
    landscape: false,
    viewport: { width: 794, height: 1123, deviceScaleFactor: 4 },
    footerHtml: buildFooterHtmlMobile(b, 20),
    brandKey,
    lang: 'fr',
  };
  try {
    await renderPdf(pdfOpts);
  } catch (err) {
    if (err.code !== 'EBUSY' || brandKey !== 'kinetics') throw err;
    const fallbacks = [
      OUTPUT_MOBILE_TMP,
      path.join(__dirname, 'Equivalents-alimentaires-mobile.pdf'),
    ];
    let written = false;
    for (const out of fallbacks) {
      try {
        await renderPdf({ ...pdfOpts, outputPath: out });
        console.log('PDF principal verrouillé →', out);
        written = true;
        break;
      } catch (e) {
        if (e.code !== 'EBUSY') throw e;
      }
    }
    if (!written) throw new Error('Impossible d\'écrire le PDF mobile (fichiers verrouillés). Fermez le PDF ouvert.');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const brandKey = args.includes('--elevate') ? 'elevate' : 'kinetics';
  const lang = args.includes('--en') || args.includes('--lang=en') ? 'en' : 'fr';
  assertBrandAssets(getBrand(brandKey));

  const landscapeOnly = args.includes('--landscape');
  const mobileOnly = args.includes('--mobile');

  if (landscapeOnly) {
    await generateLandscape(brandKey, lang);
  } else if (mobileOnly) {
    await generateMobile(brandKey);
  } else {
    await generateLandscape(brandKey, lang);
    await generateMobile(brandKey);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
