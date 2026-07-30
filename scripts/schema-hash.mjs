import crypto from 'crypto';

export function normalizeSchemaText(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function computeSchemaHash(text) {
  return crypto.createHash('sha256').update(normalizeSchemaText(text)).digest('hex');
}
