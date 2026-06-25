---
"saat": minor
---

Initial release: type-safe, deterministic database seeding for Drizzle ORM.

- `defineFixture` with `count` + `data()` bulk generation and exact keyed `rows`.
- References across files: `ref(ns).random()`, `ref(ns, key)`, `ref(ns).where({…})`.
- Codegen of global namespace types (`.saat/types.d.ts`), regenerated before each run.
- Dependency-graph ordering with cycle detection; single-transaction, all-or-nothing runs.
- Seedable RNG (deterministic Faker + ref picks) with `--seed` override.
- PostgreSQL, MySQL, and SQLite support with per-dialect truncation and batched inserts.
- CLI: `saat`, `saat generate`, `--scenario`, `--seed`, `--dry-run`, `--watch`.
