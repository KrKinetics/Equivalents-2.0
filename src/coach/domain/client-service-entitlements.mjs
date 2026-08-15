/**
 * Canonical client service codes and tool entitlements for the Coach portal.
 * Pure helpers — no DOM, storage, or network.
 */

export const SERVICE_TYPES = Object.freeze({
  nutrition: 'nutrition',
  programming: 'programming',
  complete: 'complete',
});

export const SERVICE_TYPE_CODES = Object.freeze([
  SERVICE_TYPES.nutrition,
  SERVICE_TYPES.programming,
  SERVICE_TYPES.complete,
]);

export const SERVICE_LABELS_FR = Object.freeze({
  nutrition: 'Structure alimentaire',
  programming: 'Programmation',
  complete: 'Prise en charge complète',
});

export const SERVICE_GROUP_HEADINGS_FR = Object.freeze({
  nutrition: 'STRUCTURE ALIMENTAIRE',
  programming: 'PROGRAMMATION',
  complete: 'PRISE EN CHARGE COMPLÈTE',
});

export const SERVICE_GROUP_ORDER = Object.freeze([
  SERVICE_TYPES.nutrition,
  SERVICE_TYPES.programming,
  SERVICE_TYPES.complete,
]);

export const NUTRITION_WORKSPACE_CTA_LABEL = 'Ouvrir la structure alimentaire';

export const SERVICE_CHANGE_CONFIRMATION =
  'Le changement de service modifiera les outils accessibles pour ce client. Les données existantes ne seront pas supprimées.';

export const SERVICE_SELECT_PLACEHOLDER = 'Choisir le service';

/**
 * @param {unknown} value
 * @returns {'nutrition'|'programming'|'complete'|null}
 */
export function parseServiceType(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim();
  return SERVICE_TYPE_CODES.includes(code) ? code : null;
}

/**
 * Fail closed: unknown/null/invalid service has no nutrition workspace access.
 * @param {unknown} serviceType
 */
export function clientHasNutritionAccess(serviceType) {
  const code = parseServiceType(serviceType);
  return code === SERVICE_TYPES.nutrition || code === SERVICE_TYPES.complete;
}

/**
 * Fail closed: unknown/null/invalid service has no programming access.
 * Programming UI is not rendered until Maître Coach is integrated.
 * @param {unknown} serviceType
 */
export function clientHasProgrammingAccess(serviceType) {
  const code = parseServiceType(serviceType);
  return code === SERVICE_TYPES.programming || code === SERVICE_TYPES.complete;
}

/**
 * @param {unknown} serviceType
 * @returns {string}
 */
export function serviceLabelFr(serviceType) {
  const code = parseServiceType(serviceType);
  return code ? SERVICE_LABELS_FR[code] : '';
}

/**
 * Nutrition workspace switcher must never list programming-only clients.
 * @param {Array<{ service_type?: unknown }>|null|undefined} clients
 */
export function nutritionEligibleClients(clients) {
  return (Array.isArray(clients) ? clients : []).filter((row) => (
    clientHasNutritionAccess(row?.service_type)
  ));
}

/**
 * Fixed dashboard section order. Alphabetical full_name within each group.
 * Invalid/missing service_type is omitted (fail closed; CHECK prevents it in DB).
 * @param {Array<{ full_name?: string, service_type?: unknown }>|null|undefined} clients
 */
export function groupClientsByService(clients) {
  const groups = {
    [SERVICE_TYPES.nutrition]: [],
    [SERVICE_TYPES.programming]: [],
    [SERVICE_TYPES.complete]: [],
  };
  for (const client of Array.isArray(clients) ? clients : []) {
    const code = parseServiceType(client?.service_type);
    if (!code) continue;
    groups[code].push(client);
  }
  for (const code of SERVICE_GROUP_ORDER) {
    groups[code].sort((a, b) => String(a?.full_name || '').localeCompare(
      String(b?.full_name || ''),
      'fr',
      { sensitivity: 'base', numeric: true },
    ));
  }
  return groups;
}
