/**
 * Strict JSON body parsing with size limits.
 */

import { assertBodyWithinLimit, MAX_API_BODY_BYTES } from '../require-request-auth.mjs';
import { PUBLIC_ERROR } from './errors.mjs';

/**
 * @param {import('http').IncomingMessage} req
 * @param {{ maxBytes?: number }} [opts]
 * @returns {Promise<
 *   | { ok: true, body: object }
 *   | { ok: false, status: number, error: string }
 * >}
 */
export async function parseJsonBody(req, { maxBytes = MAX_API_BODY_BYTES } = {}) {
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
        return { ok: false, ...PUBLIC_ERROR.bad_request };
      }
      return { ok: true, body: parsed };
    } catch {
      return { ok: false, ...PUBLIC_ERROR.bad_request };
    }
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ok: true, body: raw };
  }

  return { ok: false, ...PUBLIC_ERROR.bad_request };
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
    req.on('error', () => finish({ ok: false, ...PUBLIC_ERROR.bad_request }));
  });
}
