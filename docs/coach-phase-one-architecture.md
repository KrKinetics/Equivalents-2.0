# Coach — Phase 1 architecture boundaries

Static Coach calculator (`coach-calculator/`, preview `http://127.0.0.1:4188/`).  
No auth, database, Supabase, or Next.js in this phase.

## Layers

| Layer | Responsibility | Location |
|---|---|---|
| Interface / DOM | Form I/O, events, alerts, tab UI | `coach-calculator/index.html` (generated) |
| UI adapters | Pure re-exports for form → engine → DOM flow | `src/coach/ui/calculation-adapters.mjs` |
| Shared calculation engine | Pure nutrition / plan math | `src/lib/coach-calculator-engine.mjs`, `src/coach/calculations/`, `src/coach/domain/` |
| Plan contracts | Banque totals, completeness, reconcile thresholds | `src/coach/domain/plans.mjs` |
| Banque alimentaire | Category averages (`MOYENNES`), portion suggestion | `plans.mjs`, `calculations/portions.mjs` |
| Storage | `athlete_*` localStorage facade | `src/coach/services/storage/` |
| Branding | KR / Elevate metadata | `src/coach/branding/brands.mjs` |
| PDF generation | Client PDF HTML/CSS, dual-brand overrides | Inject scripts in `scripts/coach-calculator-*.mjs` |

## Generated artifacts

- Source of truth for the page: `references/calculateur-coach-original.html` + build transforms.
- Build: `npm run coach:build` → `coach-calculator/index.html`.
- Protected nutrition artifacts (never rewrite hashes to pass tests): `coach-calculator/coach-data.json`, guide PDF.

## Dual-brand forks (intentionally not in shared engine)

- Banque kcal from raw macros
- Completeness / reconcile via `withinCoachTolerance`
- PDF brand chrome and labels

## Validation commands

```bash
node --test tests/coach-calculator-engine.test.mjs tests/coach-plan-contracts.test.mjs tests/coach-branding.test.mjs tests/coach-storage.test.mjs tests/coach-ui-engine-parity.test.mjs tests/coach-ui-adapters.test.mjs
npm run test:browser   # or targeted coach / dual-brand / science-ui suites
npm run coach:build
npm run coach:preview  # http://127.0.0.1:4188/
```

Science-UI screenshots: written under `verify-science-ui-artifacts/` (gitignored) and checked against tracked baselines by PNG width/height (Puppeteer bytes can vary slightly). Refresh baselines with `COACH_UPDATE_SCIENCE_UI_SCREENSHOTS=1`.
