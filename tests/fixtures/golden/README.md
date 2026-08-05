# Golden fixtures (Phase 2B)

Immutable reference outputs for the Coach calculation engine.

**Do not edit these JSON files to make tests pass.**

A change to golden expected values requires:

1. Explicit métier review
2. Voluntary regeneration:

```bash
COACH_REGENERATE_GOLDEN=1 node scripts/regenerate-golden-fixtures.mjs
```

Ordinary `npm test` never regenerates snapshots.

See `docs/coach-phase2b-golden-auth.md`.
