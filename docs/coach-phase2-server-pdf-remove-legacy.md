# Coach Bloc 2 — Server PDF + remove legacy bank

**Status:** Draft PR  
**Branch:** `feat/security-phase2-server-pdf-remove-legacy`  
**Rollback:** revert the Bloc 2 merge commit, then redeploy (no Supabase migration; no hidden bank API)

## Goal

1. Generate Coach plan PDFs on the authenticated server.
2. Remove `/api/coach-data` and static `/workspace/coach-data.json`.
3. Keep the full food bank and formula IP out of browser bundles, public folders, and sourcemaps.
4. Make the server nutrition path permanent (no runtime rollback flag).

## Architecture

```
POST /api/coach-generate-pdf
  → CORS + rate limit + strict JSON validation
  → requireRequestAuth (session, JWT, user, membership, org, role)
  → authorizeClientAccess (client in org, fictional-only)
  → brand from organization slug (never trust client brand)
  → buildPlanSnapshot (server engine + moyennes)
  → buildPdfDocumentHtml (escaped, brand-scoped)
  → Puppeteer / @sparticuz/chromium → application/pdf
```

Frontend sends only minimal day state (banque, repartition, targets via macros API, labels, notes).  
No local PDF fallback. No full-bank fallback on error.

## Removed surfaces

| Surface | Bloc 2 result |
|---------|----------------|
| `api/coach-data.js` | deleted |
| `/workspace/coach-data.json` rewrite | removed (404) |
| `COACH_FEATURE_SERVER_NUTRITION` OFF path | removed from deploy |
| Inlined MOYENNES / REPART_PRESETS / NASEM / IOM in workspace HTML | stripped at build |
| Client `exporterPDF` dual-brand entry | neutralized; bridge calls server |

## Compatibility

- Dossier schema v1 unchanged
- No Supabase migration
- Existing clients/dossiers open, save, reload as before
- KR Kinetics / Elevate isolation via org membership + slug→brand mapping

## Rollback

1. `git revert <bloc-2-merge-sha>`
2. Redeploy previous Production
3. Bloc 1 server nutrition APIs return with the reverted tree

Do **not** reintroduce a public or authenticated full-bank download endpoint for rollback convenience.
