/**
 * Display-only exact-duplicate removal.
 * Never mutates a snapshot. Never merges merely similar ideas.
 */

export function normalizeDisplayKey(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function itemText(item) {
  if (item == null) return '';
  if (typeof item === 'string') return item;
  return String(item.text ?? item.label ?? item.message ?? item.value ?? item.title ?? '');
}

/**
 * Removes exact duplicates after trim / collapsed spaces / case-insensitive compare.
 * Preserves first-seen order and original item objects.
 */
export function dedupeDisplayItems(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const raw = itemText(item);
    const key = normalizeDisplayKey(raw);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
