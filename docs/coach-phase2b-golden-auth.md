# Coach Phase 2B — Golden contracts & server auth infrastructure

**Status:** infrastructure only. No Production behavior change.  
**Base HEAD (branch start):** see PR description.  
**`/api/coach-data`:** remains the temporary full-bank endpoint until **Phase 2G**.

## Why this phase exists

Phase 2A established that an authenticated coach still receives the full food bank and inlined formulas. Before moving search/calc/PDF to the server, we need:

1. **Immutable golden fixtures** so engine results cannot drift unnoticed.
2. **Reusable server auth** so every future `/api/*` handler applies the same gates.

This phase does **not** wire new routes into the UI and does **not** remove the banque from the browser.

## Golden fixtures

Location: `tests/fixtures/golden/`  
Contract version: `2B.1`  
Generator: `scripts/regenerate-golden-fixtures.mjs`

| File | Covers |
|------|--------|
| `eer-tdee.cases.json` | NASEM/IOM/TDEE across sexes, ages, activities, brands |
| `nasem-direct.cases.json` | Direct helper samples |
| `macro-targets.cases.json` | Goals (perte/maintien/prise), presets, rest-day, protein, hydration |
| `portions-banque.cases.json` | `MOYENNES`, banque totals, suggestBanque, répartition, reconcile |
| `food-search.cases.json` | Representative search/filter id lists (287 bank semantics) |
| `pdf-contracts.cases.json` | FR/EN text gates, brands KR/Elevate, forbidden markers, required PDF fields |
| `business-tolerances.cases.json` | Dual-brand ±2%/±6% and `PDF_VARIANCE_THRESHOLDS` (separate suite) |
| `macro-energy.cases.json` | Atwater kcal helper |
| `contract-meta.json` | Version + immutability policy |

### Strict engine parity vs business tolerances

| Mode | Suite | Rule |
|------|-------|------|
| **A. Strict parity** | `tests/coach-golden-contracts.test.mjs` | Exact equality for deterministic engine outputs (kcal, macros, portions, ids, search, PDF field contracts). |
| **B. Business tolerances** | `tests/coach-golden-tolerances.test.mjs` | Dual-brand `withinCoachTolerance` (energy `max(50, round(kcal×2%))`, macros `max(5, round(g×6%))`) and absolute `PDF_VARIANCE_THRESHOLDS`. |

Do **not** use business tolerances to mask a same-engine regression before/after server migration.

Floating-point note: energy helpers are compared after `Math.round` (documented in fixtures). Portion half-steps are exact decimals already used by the engine.

### Updating goldens (voluntary, reviewed)

```bash
# Local only — never in ordinary CI / Production / Vercel builds
COACH_REGENERATE_GOLDEN=1 node scripts/regenerate-golden-fixtures.mjs
```

Guards:

- Script exits unless `COACH_REGENERATE_GOLDEN=1`.
- Script refuses when `CI=true` or `VERCEL=1`.
- `npm test` never sets the regenerate flag.
- Any golden diff requires **explicit métier review** (comment in fixtures + this doc).

## Server auth module

File: `src/coach/server/require-request-auth.mjs`  
Runtime: **Vercel Node** (compatible with existing `api/*.js`).

### Obligation for future `/api/*` routes

Vercel Edge `middleware.js` **does not** match `/api/*`.  
**Every** future API handler must call `requireRequestAuth` (or equivalent) **before** any business logic.

### Gates (deny by default)

1. Session / token present (cookie `coach_access_token` or `Authorization: Bearer`)
2. JWT validated via Supabase Auth (`/auth/v1/user`) — invalid/expired → unauthorized
3. User id present
4. Membership present
5. Organization valid (from membership, not from client trust)
6. Optional `requestedOrganizationId` must match a session membership (blocks KR↔Elevate spoofing)
7. Optional `requestedOrganizationSlug` must match the org row for that membership
8. Role must be in `allowedRoles` (default: `coach`, `platform_owner`) — **never** trust a client-supplied role

Success context (server-internal only — never return wholesale to the browser):

- `userId`
- `organizationId`
- `role`
- `organizationSlug` (when slug check requested)

Public body: `{ "error": "unauthorized" | "forbidden" | "misconfigured" | "payload_too_large" }`.

### Security rules

- No `service_role` in this module or browser bundles.
- Never authorize solely because `organization_id` appeared in the JSON body.
- Anti-enumeration: org/role/membership failures collapse to `forbidden` / `unauthorized`.
- Do not log JWTs, cookies, full emails, or client payloads.
- Documented max body for consumers: `MAX_API_BODY_BYTES` = **262144** (256 KiB).

Reuses `readAccessToken` / `requireCoachSession` from `src/coach/security/portal-auth.mjs` (publishable key + user JWT only).

## What this PR does not change

- Calculator HTML / formulas / coefficients / PDF client output
- `/api/coach-data` behavior (still full bank for authenticated members)
- Food data / migrations / Production data
- Frontend network calls
- No new Production-used API route

## Related commands

```bash
npm run test:phase2b          # golden + tolerances + server auth
npm run test:coach-auth       # includes server auth suite
npm run test:nutrition        # includes golden contracts
npm run golden:regenerate     # blocked unless COACH_REGENERATE_GOLDEN=1
```
