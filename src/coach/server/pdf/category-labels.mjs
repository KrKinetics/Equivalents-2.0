/** Shared calculator ordering and server PDF display labels. */
export const CATS = Object.freeze(['pro', 'fec', 'leg', 'fru', 'lai', 'lip', 'whey']);
export const MEAL_COUNT = 7;
export const CATEGORY_LABELS = Object.freeze({
  fr: Object.freeze({
    pro: 'Protéines (Viande, Poisson, Oeufs)',
    fec: 'Féculents (Riz, Pâtes, Avoine, Pain)',
    leg: 'Légumes', fru: 'Fruits', lai: 'Produits Laitiers',
    lip: 'Matières Grasses (Noix, Huiles, Avocat)', whey: 'Scoop(s) de Whey',
  }),
  en: Object.freeze({
    pro: 'Protein (Meat, Fish, Eggs)', fec: 'Starches (Rice, Pasta, Oats, Bread)',
    leg: 'Vegetables', fru: 'Fruits', lai: 'Dairy Products',
    lip: 'Fats (Nuts, Oils, Avocado)', whey: 'Whey scoop(s)',
  }),
});
export const MEAL_LABELS = Object.freeze({
  fr: Object.freeze(['Déjeuner', 'Collation AM', 'Dîner', 'Collation PM', 'Souper', 'Collation', 'Repas de soirée']),
  en: Object.freeze(['Breakfast', 'AM Snack', 'Lunch', 'PM Snack', 'Dinner', 'Snack', 'Evening Meal']),
});
export const MEAL_ICONS = Object.freeze(['🌅', '☕', '🍽️', '🍎', '🥩', '🌙', '🌜']);
export const JOUR_LABELS_PDF = Object.freeze({
  fr: Object.freeze({ entrainement: 'Jour Entraînement', repos: 'Jour Repos (cyclage des glucides)' }),
  en: Object.freeze({ entrainement: 'Training Day', repos: 'Rest Day (Carb Cycling)' }),
});
