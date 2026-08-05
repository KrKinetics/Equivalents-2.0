# Coach portal — Phase 1 containment

## Goal

Stop **anonymous** access to Coach portal pages, calculator assets, and `coach-data.json`.

This phase is **not** the final protection of nutrition IP against an authorized coach session. Phase 2 will move formulas and the food bank behind minimal server endpoints.

## Architecture

### Before

- Static Vercel output served everything under `/` and `/workspace/`.
- Auth was browser-only (`requireSession` / bootstrap redirect).
- `GET /workspace/coach-data.json` returned the full banque without a session.

### After

1. **HttpOnly cookie** `coach_access_token` set via `POST /api/session` after Supabase login (publishable key + user JWT only).
2. **Vercel Edge Middleware** (`middleware.js`) blocks protected routes without a valid JWT + org membership.
3. **`GET /api/coach-data`** returns the food bank only to authenticated org members (`Cache-Control: private, no-store`).
4. **Static tree** no longer contains `workspace/coach-data.json`.
5. Browser `requireSession` remains as defense in depth.
6. Calculator load order: under `/workspace` prefer `/api/coach-data`; standalone `coach-calculator/` prefers local `./coach-data.json` (offline tests / preview) then the API.

### Protected routes

- `/dashboard.html`
- `/workspace` and `/workspace/*` (HTML, vendors, images, guides)
- `/src/coach/*`
- `/assets/dashboard.js`
- `/assets/workspace-bootstrap.mjs`

### Public routes

- `/`, `/index.html`, `/login.html`
- `/config.js` (publishable Supabase values only)
- Login assets (`/assets/login*`, `auth-*`, `supabase-client`, `portal.css`, `public-site`, `session-cookie`)

## CSP temporary `unsafe-inline`

`Content-Security-Policy-Report-Only` allows `script-src 'self' 'unsafe-inline' https://esm.sh` and `style-src 'self' 'unsafe-inline'` because the calculator still embeds large inline `<script>` blocks and inline styles.

**No `unsafe-eval`.**

Phase 2+ should vendor Supabase JS, extract inline scripts, then enforce CSP (remove Report-Only).

## Phase 2 plan (formulas + banque server-side)

1. **Phase 2B (done):** immutable golden fixtures + `src/coach/server/require-request-auth.mjs` — see `docs/coach-phase2b-golden-auth.md`.
2. **Phase 2C–2E (this block):** minimal authenticated endpoints for food search/detail, energy, macros, portions, equivalences — see `docs/coach-phase2-server-nutrition-engine.md`. Feature-flagged Preview path; `/api/coach-data` retained for rollback until a later removal phase.
3. Remove full `coach-data.json` from the client runtime path when the server feature flag is ON.
4. Keep RLS + org checks on every endpoint (`requireRequestAuth` on each `/api/*` handler).
5. Compare calculator outputs against golden fixtures before switching traffic.
6. **Later:** server PDF bytes (out of scope for 2C–2E); retire `/api/coach-data` (2G).

## Migrations

- `supabase/migrations/20260804180000_clients_organization_immutable.sql`
  - Trigger: `clients.organization_id` immutable after insert.

**Do not apply to Production until explicitly approved.**
