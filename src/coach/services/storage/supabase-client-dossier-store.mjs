/**
 * Supabase adapter for authenticated workspace client dossiers.
 * Publishable-key + user session only — never service_role.
 */

import {
  DOSSIER_SCHEMA_VERSION,
  isSupportedDossierSchemaVersion,
  validateDossierPayload,
} from './dossier-schema.mjs';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export function createSupabaseClientDossierStore(supabase) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('createSupabaseClientDossierStore requires a Supabase client');
  }

  return {
    schemaVersion: DOSSIER_SCHEMA_VERSION,

    /**
     * @param {string} clientId
     * @returns {Promise<null | { id: string, clientId: string, organizationId: string, schemaVersion: number, payload: object, updatedAt: string|null }>}
     */
    async loadClientDossier(clientId) {
      if (!clientId) throw new Error('client_id requis');
      const { data, error } = await supabase
        .from('client_dossiers')
        .select('id, client_id, organization_id, schema_version, payload, updated_at')
        .eq('client_id', clientId)
        .maybeSingle();
      if (error) throw new Error(error.message || 'Échec du chargement du dossier');
      if (!data) return null;
      if (!isSupportedDossierSchemaVersion(data.schema_version)) {
        throw new Error(
          `Version de schéma dossier non supportée (${data.schema_version}). Attendu : ${DOSSIER_SCHEMA_VERSION}.`,
        );
      }
      const check = validateDossierPayload(data.payload);
      if (!check.ok) {
        throw new Error(check.reason);
      }
      return {
        id: data.id,
        clientId: data.client_id,
        organizationId: data.organization_id,
        schemaVersion: data.schema_version,
        payload: data.payload,
        updatedAt: data.updated_at || null,
      };
    },

    /**
     * Upsert dossier for a fictional client in the caller's organization.
     * @param {string} clientId
     * @param {object} payload
     * @param {{ organizationId: string, userId?: string|null }} ctx
     */
    async saveClientDossier(clientId, payload, ctx) {
      if (!clientId) throw new Error('client_id requis');
      if (!ctx?.organizationId) throw new Error('organization_id requis');
      const check = validateDossierPayload(payload);
      if (!check.ok) throw new Error(check.reason);

      const row = {
        client_id: clientId,
        organization_id: ctx.organizationId,
        schema_version: DOSSIER_SCHEMA_VERSION,
        payload,
        updated_by: ctx.userId || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('client_dossiers')
        .upsert(row, { onConflict: 'client_id' })
        .select('id, client_id, organization_id, schema_version, payload, updated_at')
        .single();
      if (error) throw new Error(error.message || 'Échec de la sauvegarde du dossier');
      return {
        id: data.id,
        clientId: data.client_id,
        organizationId: data.organization_id,
        schemaVersion: data.schema_version,
        payload: data.payload,
        updatedAt: data.updated_at || null,
      };
    },

    /**
     * Optional explicit delete (workspace cleanup / tests).
     * @param {string} clientId
     */
    async deleteClientDossier(clientId) {
      if (!clientId) throw new Error('client_id requis');
      const { error } = await supabase
        .from('client_dossiers')
        .delete()
        .eq('client_id', clientId);
      if (error) throw new Error(error.message || 'Échec de la suppression du dossier');
    },
  };
}
