# Bloc 3 — Final hardening (Closed)

**Base commit:** `1119630` (Bloc 2 Production)  
**Merge commit:** `4d70ccc` (PR #30)  
**Status:** Merged — Production validated; distributed rate limiting active.

## Goals

1. Enforce CSP (exit Report-Only)
2. Normalize security headers
3. Harden validation + public error catalog
4. Distributed-capable rate limiting (Supabase RPC migration prepared, **not applied**)
5. Auth anti-enumeration + session reason leak fix
6. Central log redaction
7. Controlled `fast-uri` override (no `npm audit fix`)
8. Self-host Supabase browser bundle (remove `esm.sh`)
9. Security / non-regression tests

## CSP

| Surface | Policy |
|---|---|
| Portal (`/`, login, dashboard) | `script-src 'self'` — **no** `unsafe-inline`, **no** `esm.sh` |
| Workspace calculator | `script-src 'self' 'unsafe-inline'` residual for legacy `onclick`/`onchange` |
| Both | `frame-ancestors 'none'`, `object-src 'none'`, `connect-src 'self' https://*.supabase.co` |

Applied via `vercel.json` + Edge `middleware.js` path-scoped headers.

## Rate limiting

- Profiles in `rate-limit-profiles.mjs`
  - `calc-portions` = **180/min** (was 20 — blocked normal Classique/Équilibré + portion edits)
  - PDF = 8/min, magic-link = 5/15min
- Buckets keyed by hashed session token + hashed IP (not raw email)
- Default backend: in-memory per isolate **outside Production**
- Production + Preview: `COACH_RATE_LIMIT_BACKEND=supabase` (never `memory` in Production)
- When backend is `supabase`, RPC failure → `503 rate_limit_unavailable` (**no memory fallback**)
- Migration applied: `20260805140000_coach_rate_limit_buckets.sql`
- Rollback: `supabase/rollbacks/20260805140000_coach_rate_limit_buckets_rollback.sql`
- UI: debounced `calculerBanque`, coalesced `planned_totals`, single-flight `repartirAutomatique`
- 429 / 503 rate-limit codes use dedicated user messages

## Auth

- `/api/session` returns only `{ error: 'unauthorized'|'forbidden' }` (no `verified.reason`)
- Password failures share one public message
- Magic link already uniform (`shouldCreateUser: false`)

## Dependencies

```json
"overrides": { "fast-uri": "3.1.5" }
```

Patches GHSA-7p8r-x3mc-p8w7 without major `ajv` upgrade. Coach HTTP validators do not use `ajv`/`fast-uri` on the request path.

## Residual risks (registered — not corrected in Bloc 3 closure)

1. **Workspace CSP residual `unsafe-inline`** — calculator still needs `script-src`/`style-src` `'unsafe-inline'` for legacy `onclick`/`onchange` attributes
2. **Malformed Bearer → 503 instead of 401** — invalid JWT forwarded to the rate-limit RPC triggers fail-closed `rate_limit_unavailable` before auth classification
3. **Production UI path not fully re-automated** — Production validated via API/security smoke + Preview manual UI; full interactive Classique/Équilibré/mobile browser journey on Production was not replayed end-to-end in automation
4. No COOP/COEP (would risk PDF download / Supabase auth flows)
