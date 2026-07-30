/** Shared nutrition enums and constants (Node + browser safe). */

export const DISPLAY_CATEGORIES = [
  'noix_graines',
  'matieres_grasses',
  'legumes',
  'fruits',
  'poissons_fruits_mer',
  'viandes_volaille',
  'autres_sources_proteinees',
  'feculents',
  'produits_laitiers',
];

export const CALCULATION_GROUPS = [
  'protein',
  'starch',
  'vegetable',
  'fruit',
  'dairy',
  'fat',
  'whey',
];

export const PORTION_UNITS = [
  'bottle',
  'slice',
  'piece',
  'count',
  'cup',
  'tbsp',
  'tsp',
  'ml',
  'g',
  'oz',
  'scoop',
  'portion',
  'wrap',
  'wraps',
  'bar',
  'bars',
];

export const PREPARATION_STATES = [
  'raw',
  'cooked',
  'drained',
  'prepared',
  'frozen',
  'canned',
  'dry_uncooked',
  'ready_to_eat',
  'not_applicable',
  'unknown',
];

export const FOOD_STATUSES = ['unverified', 'verified', 'rejected'];

export const MANUAL_STATUSES = ['unverified', 'rejected'];

export const SOURCE_TYPES = [
  'canadian_nutrient_file',
  'usda_fooddata_central',
  'manufacturer_label',
  'manufacturer_website',
  'peer_reviewed_reference',
  'other_authoritative',
];

export const CLASSIFICATION_STATUSES = ['pending', 'approved', 'rejected'];

export const NUTRIENTS_BASIS = [
  'as_consumed',
  'as_purchased',
  'dry',
  'cooked',
  'label_serving',
  'unknown',
];

export const EXPECTED_CATEGORY_COUNTS = {
  noix_graines: 32,
  matieres_grasses: 23,
  legumes: 36,
  fruits: 33,
  poissons_fruits_mer: 36,
  viandes_volaille: 38,
  autres_sources_proteinees: 27,
  feculents: 23,
  produits_laitiers: 29,
};

export const TOTAL_FOODS_EXPECTED = 277;

export const DATASET_STATUSES = ['draft', 'review', 'approved'];
