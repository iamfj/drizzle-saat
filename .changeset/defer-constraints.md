---
"drizzle-saat": minor
---

Add opt-in `deferConstraints` (config, `seed()` option). When enabled, drizzle-saat
drops foreign-key-based insert *ordering* and defers FK enforcement until the
transaction commits, so tables with mutual/cyclic real foreign keys (using
literal ids) can be seeded without tripping a `CycleError`.

Best-effort per dialect: SQLite (`PRAGMA defer_foreign_keys`) and Postgres
(`SET CONSTRAINTS ALL DEFERRED`, only for `DEFERRABLE` FKs) still validate at
commit; MySQL (`SET FOREIGN_KEY_CHECKS=0`) skips FK validation for the run. It
does not dissolve `ref()` cycles — those resolve to generated ids and still
require acyclic references. Defaults to `false` (no change for existing users).
