# Vendored browser dependencies

`supabase-bundle.mjs` is a same-origin ESM bundle of `@supabase/supabase-js`
generated for enforced CSP (`script-src 'self'`, no `esm.sh`).

Regenerate after upgrading `@supabase/supabase-js`:

```bash
npx esbuild@0.25.0 node_modules/@supabase/supabase-js/dist/index.mjs \
  --bundle --format=esm --platform=browser \
  --outfile=coach-portal/assets/vendor/supabase-bundle.mjs
```
