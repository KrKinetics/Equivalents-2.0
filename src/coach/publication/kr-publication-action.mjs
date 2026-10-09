/**
 * Coach-facing KR publication preview.
 * Save stays on client_dossiers. This action does not write that table and
 * does not release an athlete revision.
 */

import { brandIdFromOrganizationSlug } from '../workspace/org-brand.mjs';
import { prepareCanonicalPublication } from './dossier-to-nutrition-plan.mjs';

export const KR_PUBLISH_BUTTON_LABEL = 'Publier dans KR KINETICS';

const STATUS = Object.freeze({
  ELEVATE_NOT_PUBLISHABLE: 'La publication KR KINETICS est réservée aux clients KR.',
  KR_CLIENTS_ONLY: 'La publication KR KINETICS est réservée aux clients KR.',
  SEVENTH_MEAL_NOT_IN_RELEASE_CONTRACT: 'Ce dossier utilise le 7e repas. La publication athlète est refusée.',
  INCOMPLETE_DOSSIER: 'Le dossier est incomplet. Aucune publication n’a été créée.',
  UNSUPPORTED_GOAL: 'L’objectif de ce dossier n’est pas publiable.',
  UNSUPPORTED_MACRO: 'La répartition des macros n’est pas publiable.',
  INVALID_NOTES: 'Les notes ne peuvent pas être publiées telles quelles.',
});

export function krPublicationStatus(code) {
  return STATUS[code] || 'Publication refusée. Le dossier n’a pas été modifié.';
}

export function krPublicationPreview({ brandId, organizationSlug, payload }) {
  const brand = brandId || brandIdFromOrganizationSlug(organizationSlug);
  if (brand !== 'kr') {
    return { ok: false, code: 'ELEVATE_NOT_PUBLISHABLE', writesDossier: false, releasesAthlete: false };
  }
  return prepareCanonicalPublication(payload, { language: 'fr', brand: 'kr' });
}
