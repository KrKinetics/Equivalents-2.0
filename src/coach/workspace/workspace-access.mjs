/**
 * Pure workspace access helpers (RLS expectations + validation).
 * No secrets; browser/Node callers supply an already-authenticated Supabase client.
 */

import { brandIdFromOrganizationSlug } from './org-brand.mjs';
import { buildWorkspaceStubProfile } from './workspace-client-stub.mjs';

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function parseClientIdParam(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  return id;
}

/**
 * @param {{
 *   client: { id: string, full_name: string, notes?: string|null, organization_id: string, is_fictional?: boolean } | null,
 *   membership: { organizationId: string, organization: { slug: string, name: string }, role: string },
 * }} args
 */
export function assertWorkspaceClientAccess({ client, membership }) {
  if (!membership?.organizationId || !membership?.organization?.slug) {
    throw new Error('Membership organisation introuvable.');
  }
  const brandId = brandIdFromOrganizationSlug(membership.organization.slug);
  if (!brandId) {
    throw new Error(`Organisation non prise en charge : ${membership.organization.slug}`);
  }
  if (!client) {
    throw new Error('Client introuvable ou hors de votre organisation.');
  }
  if (client.organization_id !== membership.organizationId) {
    throw new Error('Accès refusé : ce client appartient à une autre organisation.');
  }
  if (client.is_fictional !== true) {
    throw new Error('Seuls les clients fictifs peuvent être ouverts dans ce jalon.');
  }
  return {
    brandId,
    organizationId: membership.organizationId,
    organizationSlug: membership.organization.slug,
    organizationName: membership.organization.name,
    role: membership.role,
    clientId: client.id,
    fullName: client.full_name,
    notes: client.notes || '',
    stub: buildWorkspaceStubProfile({
      fullName: client.full_name,
      notes: client.notes || '',
      clientId: client.id,
      organizationSlug: membership.organization.slug,
    }),
  };
}

/**
 * Build workspace open URL (same-origin).
 * @param {string} clientId
 * @returns {string}
 */
export function workspaceOpenPath(clientId) {
  const id = parseClientIdParam(clientId);
  if (!id) throw new Error('client_id invalide');
  return `/workspace/?client_id=${encodeURIComponent(id)}`;
}
