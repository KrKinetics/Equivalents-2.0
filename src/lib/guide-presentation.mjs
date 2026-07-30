import { formatNumberForLocale, normalizeFrName } from './descriptive-stats.mjs';

export const SECTION_COLORS = {
  noix_graines: '#8B6914',
  matieres_grasses: '#C45C26',
  legumes: '#2D6A4F',
  fruits: '#E63946',
  poissons_fruits_mer: '#0077B6',
  viandes_volaille: '#9D0208',
  autres_sources_proteinees: '#6A4C93',
  feculents: '#BC6C25',
  produits_laitiers: '#4895EF',
};

const keys = {
  noix: ['aliment', 'prot', 'gluc', 'fib', 'sat', 'poly', 'mono', 'cal'],
  matiereGrasse: ['aliment', 'prot', 'gluc', 'fib', 'sat', 'poly', 'mono', 'cal'],
  legumes: ['aliment', 'prot', 'gluc', 'cal', 'fib', 'lip'],
  fruits: ['aliment', 'prot', 'gluc', 'cal', 'fib', 'lip'],
  poissons: ['aliment', 'prot', 'gluc', 'lip', 'cal'],
  viandes: ['aliment', 'cal', 'prot', 'gluc', 'lip'],
  autresProteines: ['aliment', 'cal', 'prot', 'gluc', 'lip'],
  feculents: ['aliment', 'prot', 'gluc', 'fib', 'lip', 'cal'],
  laitier: ['aliment', 'prot', 'gluc', 'fib', 'lip', 'cal'],
};

const LABELS = {
  aliment: { fr: 'Aliments', en: 'Foods' }, prot: { fr: 'Protéines (g)', en: 'Protein (g)' },
  gluc: { fr: 'Glucides (g)', en: 'Carbs (g)' }, fib: { fr: 'Fibres (g)', en: 'Fiber (g)' },
  lip: { fr: 'Lipides (g)', en: 'Fat (g)' }, sat: { fr: 'Saturés (g)', en: 'Saturated (g)' },
  poly: { fr: 'Poly-ins. (g)', en: 'Polyunsat. (g)' }, mono: { fr: 'Mono-ins. (g)', en: 'Monounsat. (g)' },
  cal: { fr: 'Calories (kcal)', en: 'Calories (kcal)' },
};

export const COLUMN_SPECS = Object.fromEntries(Object.entries(keys).map(([legacyKey, columnKeys]) => [
  legacyKey,
  columnKeys.map((key) => ({ key, labelFr: LABELS[key].fr, labelEn: LABELS[key].en, align: key === 'aliment' ? 'left' : 'right' })),
]));

export function formatCellValue(value, lang = 'fr') {
  return formatNumberForLocale(value, lang);
}

function valuesFor(food) {
  const nutrients = food.nutrients || {};
  return {
    prot: nutrients.proteinG ?? null,
    gluc: nutrients.carbsG ?? null,
    fib: nutrients.fiberG ?? null,
    lip: nutrients.fatG ?? null,
    sat: nutrients.saturatedFatG ?? null,
    poly: nutrients.polyunsaturatedFatG ?? null,
    mono: nutrients.monounsaturatedFatG ?? null,
    cal: nutrients.declaredKcal ?? null,
  };
}

export function buildGuidePresentationModel({ foodsPayload, categoryMapping, versionMeta, sectionMetaFromI18n = {} }) {
  const foods = Array.isArray(foodsPayload) ? foodsPayload : foodsPayload?.foods || [];
  const sections = (categoryMapping?.displayCategories || []).map((category) => {
    const text = sectionMetaFromI18n[category.legacyKey] || {};
    const sectionFoods = foods.filter((food) => food.displayCategory === category.id).sort((a, b) => {
      const ai = Number.isInteger(a.legacyIndex) ? a.legacyIndex : Number.POSITIVE_INFINITY;
      const bi = Number.isInteger(b.legacyIndex) ? b.legacyIndex : Number.POSITIVE_INFINITY;
      return ai - bi || normalizeFrName(a.names?.fr).localeCompare(normalizeFrName(b.names?.fr), 'fr');
    }).map((food) => ({
      id: food.id,
      nameFr: food.names?.fr ?? null,
      nameEn: food.names?.en ?? null,
      portionFr: food.portion?.labelFr || food.names?.fr || '',
      portionEn: food.portion?.labelEn || food.names?.en || '',
      values: valuesFor(food),
    }));
    return {
      id: category.id,
      legacyKey: category.legacyKey,
      titleFr: text.fr?.title || category.names?.fr || category.id,
      titleEn: text.en?.title || category.names?.en || category.id,
      subtitleFr: text.fr?.subtitle || '',
      subtitleEn: text.en?.subtitle || '',
      badge: text.fr?.badge ? { fr: text.fr.badge, en: text.en?.badge || text.fr.badge } : undefined,
      note: text.fr?.note ? { fr: text.fr.note, en: text.en?.note || text.fr.note } : undefined,
      color: SECTION_COLORS[category.id] || '#475569',
      columns: COLUMN_SPECS[category.legacyKey] || COLUMN_SPECS.feculents,
      foods: sectionFoods,
    };
  });
  const included = sections.flatMap((section) => section.foods);
  if (included.length !== foods.length || new Set(included.map((food) => food.id)).size !== foods.length) {
    throw new Error('Guide presentation must include every food exactly once; check category mapping');
  }
  return {
    watermark: 'APERÇU — PROFILS D’ÉCHANGE NON APPROUVÉS',
    meta: {
      totalFoods: foods.length,
      verifiedFoods: foods.filter((food) => food.status === 'verified' || food.verification?.status === 'verified').length,
      version: versionMeta?.version ?? null,
      shortHash: versionMeta?.shortHash ?? String(versionMeta?.dataHash || '').slice(0, 12),
      generatedAt: versionMeta?.lastModifiedAt || new Date().toISOString(),
      note: 'valeurs individuelles vérifiées',
    },
    sections,
  };
}
