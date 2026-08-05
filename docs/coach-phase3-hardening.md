# Bloc 3 — Final hardening (Draft)

**Base commit:** `1119630` (Bloc 2 Production)  
**Branch:** `security/final-hardening-block3`  
**Status:** Draft PR — do not merge until Preview validation.

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
- Default backend: in-memory per isolate
- Optional: `COACH_RATE_LIMIT_BACKEND=supabase` + migration `20260805140000_coach_rate_limit_buckets.sql`
- **Production migration not applied** until explicit approval
- Rollback SQL provided beside the migration
- UI: debounced `calculerBanque`, coalesced `planned_totals`, single-flight `repartirAutomatique`
- 429 surfaces a dedicated message (not “service indisponible”)

## Auth

- `/api/session` returns only `{ error: 'unauthorized'|'forbidden' }` (no `verified.reason`)
- Password failures share one public message
- Magic link already uniform (`shouldCreateUser: false`)

## Dependencies

```json
"overrides": { "fast-uri": "3.1.5" }
```

Patches GHSA-7p8r-x3mc-p8w7 without major `ajv` upgrade. Coach HTTP validators do not use `ajv`/`fast-uri` on the request path.

## Residual risks

1. Workspace calculator still needs `unsafe-inline` for event-handler attributes
2. Distributed rate limit inactive until Supabase migration approved
3. In-memory limits reset on cold start / differ across isolates
4. No COOP/COEP (would risk PDF download / Supabase auth flows)
