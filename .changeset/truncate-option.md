---
"drizzle-saat": minor
---

Add a configurable wipe strategy. `truncate` (in `drizzle-saat.config.ts`, the
programmatic `seed()` options, or the `--truncate` CLI flag) accepts:

- `"cascade"` (default, unchanged) — wipe fixtured tables and their dependents.
- `"restrict"` — wipe only the fixtured tables and error if an unfixtured table
  still references one.
- `false` (`--truncate none` / `--no-truncate`) — append instead of wiping,
  unlocking incremental / test-factory seeding.

`SeedReport` now includes `truncated: string[]` (the tables that were, or in a
dry run would be, wiped), and the CLI prints it.
