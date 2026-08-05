# Coach Phase 2 (2C–2E) — Server nutrition engine

**Status:** Merged (Bloc 1) — superseded for PDF/legacy removal by Bloc 2  
**See also:** `docs/coach-phase2-server-pdf-remove-legacy.md`  
**Base:** post–PR #27 (`feat/security-phase2b-golden-auth-infra`)

## Goal

Move food search, food detail, energy (EER/IOM/NASEM/TDEE), calorie goals, macros, portions/averages, and equivalences to authenticated server routes so the Preview server path no longer downloads the full food bank or inlined formula matrices.

Bloc 1 kept PDF client-side and `/api/coach-data` for rollback. **Bloc 2** makes the server path permanent, adds server PDF, and removes the full-bank endpoint.

## Architecture

```
src/coach/server/
  require-request-auth.mjs     # Phase 2B (unchanged contract)
  http/                        # CORS, JSON parse, rate limit, handler factory
  food-bank/load-coach-data.mjs
  search/                      # filter + detail projection
  calc/                        # energy, macros, portions, equivalences
  validation/                  # strict JSON schemas (reject unknown keys)

api/
  coach-food-search.js
  coach-food-detail.js
  coach-calc-energy.js
  coach-calc-macros.js
  coach-calc-portions.js
  coach-calc-equivalences.js

src/coach/client/
  server-nutrition-api.mjs     # browser fetch helpers
  server-nutrition-bridge.mjs  # UI wiring when flag ON
```

Every route uses `createCoachApiHandler` → `requireRequestAuth` before business logic.

## API contracts (minimal)

All routes: `POST`, `Content-Type: application/json`, `Cache-Control: private, no-store`, CORS allowlist, max body **256 KiB**.

Optional org selectors (never trusted alone): `organization_id`, `organization_slug`.

| Route | Body (main) | Response |
|-------|-------------|----------|
| `/api/coach-food-search` | `q`, `category`, `limit`≤50, `offset` | `{ results[], total, limit, offset, categories[] }` |
| `/api/coach-food-detail` | `id` | `{ food }` display fields only |
| `/api/coach-calc-energy` | `sexe`, `age`, `poidsKg`, `hauteurM`, `activite`, `method` | `{ bmr, tdee, method, goals }` |
| `/api/coach-calc-macros` | `tdee`, `goalMultiplier`, `weightKg`, protein/macro fields | `{ targets, hydration, goalKcal }` |
| `/api/coach-calc-portions` | `action` + action payload | computed totals / suggest / moyennes / … |
| `/api/coach-calc-equivalences` | `category`, `limit`, `offset` | paginated guide rows (empty foods if no category) |

Never returned: full bank, formula source, NASEM matrices, `service_role`, other orgs’ data.

## Food bank loading

- Source file: `coach-calculator/coach-data.json` (~314 KiB on disk, 287 foods)  
- Loaded only in serverless runtime via `loadCoachData()` (module cache per isolate)  
- Included in Vercel functions via `includeFiles`  
- **Not** published under `dist/coach-vercel/workspace/coach-data.json`  
- Server path fetch of `/api/coach-data` or `coach-data.json` is blocked in the browser bridge  

### Local bundle comparison (measured)

| Metric | Legacy path (flag OFF) | Server path (flag ON / Preview) |
|--------|------------------------|----------------------------------|
| `workspace/index.html` | ~438 KiB | ~423 KiB (formulas stripped) |
| `workspace/coach-data.json` | absent (API only) | absent |
| Energy coefficient IP in HTML | present | **absent** |
| `CoachSharedEngine` | full engine | stub (`serverStub`) |
| Bridge module in deploy tree | no | yes |
| `service_role` in deploy tree | no | no |

Network (server path): search/calc JSON pages only (limit ≤50), never the 314 KiB bank.

## Feature flag & rollback

| Condition | Behavior |
|-----------|----------|
| `COACH_FEATURE_SERVER_NUTRITION=1` | Server path ON |
| `COACH_FEATURE_SERVER_NUTRITION=0` | Server path OFF (even on Preview) |
| `VERCEL_ENV=preview` and flag unset | Server path ON (Draft PR default) |
| Production / local without flag | Legacy path: `/api/coach-data` + inlined engine |

Rollback: set `COACH_FEATURE_SERVER_NUTRITION=0` (or unset on Production) and redeploy. **No Supabase migration.** No data migration.

## Rate limit

Best-effort in-memory: **60 req / 60s / IP / route / isolate**. Documented; not a global distributed limiter.

## Parity

Server calc modules wrap `src/lib/coach-calculator-engine.mjs`.  
Strict golden suite + `tests/coach-server-nutrition.test.mjs` require exact equality.  
Business dual-brand tolerances must not mask same-engine regressions.

## Commands

```bash
npm run test:server-nutrition
npm run test:coach-auth
npm run test:nutrition
npm run coach:vercel:build   # set COACH_FEATURE_SERVER_NUTRITION=1 for Preview path
npm run lint
npm audit --omit=dev
```
