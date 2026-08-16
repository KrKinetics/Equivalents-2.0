export const SUPPORTS_TO_CONFIRM_TITLE = 'APPUIS À CONFIRMER';
export const SUPPORTS_TO_CONFIRM_TEXT = 'Aucun appui n\'est encore suffisamment documenté pour être présenté comme établi.';

export function stanceForSupport(item) {
  if (item?.type === 'confirmed_strength') return 'CONFIRMÉ';
  if (item?.type === 'probable_strength') return 'PROBABLE';
  if (item?.type === 'declared_lever') return 'DÉCLARÉ PAR L\'ATHLÈTE';
  if (item?.type === 'probable_lever') return 'PROBABLE';
  return 'À VALIDER';
}

export function buildSupportBlock({ confirmedStrengths, probableStrengths, probableLevers, declaredLevers }) {
  const confirmed = (confirmedStrengths || []).map((item) => ({ ...item, stance: 'CONFIRMÉ' }));
  const probable = (probableStrengths || []).map((item) => ({ ...item, stance: 'PROBABLE' }));
  const declared = (declaredLevers || []).map((item) => ({ ...item, stance: 'DÉCLARÉ PAR L\'ATHLÈTE' }));
  const levers = (probableLevers || []).map((item) => ({ ...item, stance: 'PROBABLE' }));
  const established = [...confirmed, ...probable];
  if (established.length) {
    return {
      title: 'APPUIS',
      established: true,
      summary: null,
      items: [...established, ...declared, ...levers],
    };
  }
  return {
    title: SUPPORTS_TO_CONFIRM_TITLE,
    established: false,
    summary: SUPPORTS_TO_CONFIRM_TEXT,
    items: [...declared, ...levers],
  };
}
