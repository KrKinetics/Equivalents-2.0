/**
 * Shared CSV helpers for CNF relational files.
 */
export function parseCsv(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const next = source[i + 1];
    if (quoted) {
      if (c === '"' && next === '"') {
        cur += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cur += c;
      continue;
    }
    if (c === '"') {
      quoted = true;
      continue;
    }
    if (c === ',') {
      row.push(cur);
      cur = '';
      continue;
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && next === '\n') i += 1;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r[0] || '').trim() !== '');
}

export function csvToObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h || '').trim());
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] ?? '';
    });
    return obj;
  });
}

export function findHeader(headers, candidates) {
  const normalized = headers.map((h) => ({
    raw: h,
    key: String(h || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_'),
  }));
  for (const candidate of candidates) {
    const want = candidate.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const hit = normalized.find((h) => h.key === want || h.key.includes(want));
    if (hit) return hit.raw;
  }
  return null;
}
