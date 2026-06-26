---
"drizzle-saat": minor
---

**Breaking:** fixture files must now be named `*.fixture.{ts,mts,cts,js,mjs}`.
Only files matching that suffix are loaded from the fixtures directory, so
shared catalogs, data modules, and helpers can live right next to fixtures
without tripping the "does not default-export a fixture" error.

Migration: rename your fixtures, e.g. `drizzle-saat/users.ts` →
`drizzle-saat/users.fixture.ts`. If the fixtures directory contains source files
but none follow the convention, drizzle-saat now fails with a pointed migration
error instead of silently seeding nothing.
