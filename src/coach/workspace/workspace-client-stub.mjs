/**
 * Minimal real-client stub for opening the Coach workspace.
 * Starts from neutral placeholders and does not alter nutrition formulas.
 */

const EMPTY_BANQUE = Object.freeze({
  pro: '0', fec: '0', leg: '0', fru: '0', lai: '0', lip: '0', whey: '0',
});

/**
 * @param {{ fullName: string, notes?: string, clientId?: string, organizationSlug?: string }} input
 * @returns {object}
 */
export function buildWorkspaceStubProfile(input) {
  const fullName = String(input.fullName || '').trim() || 'Client';
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  return {
    version: 3,
    energyEquationVersion: 'nasem2023',
    nom: fullName,
    sexe: 'H',
    age: '30',
    poids: '80',
    poids_unit: 'kg',
    grandeur_unit: 'cm',
    grandeur_cm: '180',
    grandeur_ft: '',
    grandeur_in: '',
    activite: 'modere',
    macroRatio: '25,45,30',
    goalMultiplier: 1,
    macroMode: 'preset',
    proteinesMode: 'gkg',
    proteinesParKg: 2,
    proteinesPct: 25,
    jourReposActif: false,
    coachNotes: notes
      ? `Dossier client — ${notes}`
      : 'Dossier client — à compléter avec le coach.',
    workspaceMeta: {
      clientId: input.clientId || null,
      organizationSlug: input.organizationSlug || null,
      fictional: false,
    },
    // Only banque placeholders — repartition filled by migrateProfilData/createEmptyJourData.
    jours: {
      entrainement: { banque: { ...EMPTY_BANQUE } },
      repos: { banque: { ...EMPTY_BANQUE } },
    },
  };
}
