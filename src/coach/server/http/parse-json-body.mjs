/**
 * Strict JSON body parsing with size limits and Content-Type checks.
 */

import { assertBodyWithinLimit, MAX_API_BODY_BYTES } from '../require-request-auth.mjs';
import { PUBLIC_ERROR } from './errors.mjs';

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Reject prototype-pollution keys at every object level.
 * @param {unknown} value
 * @param {number} depth
 */
export function assertSafeJsonShape(value, depth = 0) {
  if (depth > 8) return { ok: false, ...PUBLIC_ERROR.validation_failed };
  if (!value || typeof value !== 'object') return { ok: true };
  if (Array.isArray(value)) {
    if (value.length > 500) return { ok: false, ...PUBLIC_ERROR.payload_too_large };
    for (const item of value) {
      const nested = assertSafeJsonShape(item, depth + 1);
      if (!nested.ok) return nested;
    }
    return { ok: true };
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) return { ok: false, ...PUBLIC_ERROR.validation_failed };
    const nested = assertSafeJsonShape(value[key], depth + 1);
    if (!nested.ok) return nested;
  }
  return { ok: true };
}

/**
 * @param {import('http').IncomingMessage} req
 */
export function assertJsonContentType(req) {
  const raw = String(req?.headers?.['content-type'] || '');
  if (!raw) return { ok: false, ...PUBLIC_ERROR.unsupported_media_type };
  const type = raw.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return { ok: false, ...PUBLIC_ERROR.unsupported_media_type };
  return { ok: true };
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {{ maxBytes?: number, requireJsonContentType?: boolean }} [opts]
 * @returns {Promise<
 *   | { ok: true, body: object }
 *   | { ok: false, status: number, error: string }
 * >}
 */
export async function parseJsonBody(req, {
  maxBytes = MAX_API_BODY_BYTES,
  requireJsonContentType = true,
} = {}) {
  if (requireJsonContentType) {
    const ct = assertJsonContentType(req);
    if (!ct.ok) return ct;
  }

  const limit = assertBodyWithinLimit(req?.headers?.['content-length'], maxBytes);
  if (!limit.ok) return { ok: false, status: limit.status, error: limit.error };

  let raw = req.body;
  if (raw == null) {
    raw = await readStreamBody(req, maxBytes);
    if (raw && typeof raw === 'object' && raw.ok === false) return raw;
  }

  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');

  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
      return { ...PUBLIC_ERROR.payload_too_large, ok: false };
    }
    const trimmed = raw.trim();
    if (!trimmed) return { ok: true, body: {} };
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, ...PUBLIC_ERROR.malformed_request };
      }
      const safe = assertSafeJsonShape(parsed);
      if (!safe.ok) return { ok: false, status: safe.status, error: safe.error };
      return { ok: true, body: parsed };
    } catch {
      return { ok: false, ...PUBLIC_ERROR.malformed_request };
    }
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const safe = assertSafeJsonShape(raw);
    if (!safe.ok) return { ok: false, status: safe.status, error: safe.error };
    return { ok: true, body: raw };
  }

  return { ok: false, ...PUBLIC_ERROR.malformed_request };
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {number} maxBytes
 */
function readStreamBody(req, maxBytes) {
  return new Promise((resolve) => {
    if (typeof req.on !== 'function') {
      resolve('');
      return;
    }
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        finish({ ok: false, ...PUBLIC_ERROR.payload_too_large });
        try { req.destroy(); } catch { /* ignore */ }
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => finish({ ok: false, ...PUBLIC_ERROR.malformed_request }));
  });
}
