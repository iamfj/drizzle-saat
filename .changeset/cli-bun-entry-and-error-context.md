---
"drizzle-saat": patch
---

Fix the CLI silently no-opping under Bun (and any runtime that invokes the bin
through a symlink). The entry-point guard now compares real (symlink-resolved)
paths, so `drizzle-saat`, `bunx drizzle-saat`, and `generate`/`--watch`/`--dry-run`
run as expected instead of exiting 0 with no output. A Bun smoke test (via a bin
symlink) now guards this in CI.

Insert failures (FK / NOT NULL / unique violations) are now wrapped in a
`SaatError` (`InsertError`) that names the namespace, table, and the keyed rows
in the failing batch, instead of surfacing a bare driver error.
