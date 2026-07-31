/**
 * Deterministic stamps for release-candidate artifacts.
 * Avoid wall-clock generatedAt so rebuilds do not dirty git.
 */

/**
 * Prefer the nutrition SoT lastModifiedAt; fall back to a stable hash-derived marker.
 */
export function releaseCandidateGeneratedAt(versionMeta = {}) {
  if (typeof versionMeta.lastModifiedAt === 'string' && versionMeta.lastModifiedAt.trim()) {
    return versionMeta.lastModifiedAt.trim();
  }
  if (typeof versionMeta.lastAuditedAt === 'string' && versionMeta.lastAuditedAt.trim()) {
    return versionMeta.lastAuditedAt.trim();
  }
  if (typeof versionMeta.dataHash === 'string' && versionMeta.dataHash.trim()) {
    return `deterministic:dataHash:${versionMeta.dataHash.trim()}`;
  }
  return 'deterministic:release-candidate';
}
