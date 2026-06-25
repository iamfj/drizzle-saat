---
name: test-with-drizzle-saat
description: Seed a database inside automated tests with drizzle-saat using the programmatic seed() API against an in-process database. Use when writing tests that need a seeded Drizzle DB, setting up per-test fixtures, or asserting on deterministic/reproducible seed data.
---

# Test with drizzle-saat

For tests, drive an in-process database with the programmatic `seed()` API instead
of the CLI. Passing a pre-built Drizzle instance via `dbCredentials: { db }`
**bypasses driver loading entirely** — no native driver, no real DB file.

## Per-test in-memory pattern (SQLite)

```ts
// test/helper.ts
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { seed } from "drizzle-saat";
import { DDL } from "../db/setup"; // your CREATE TABLE statements

export async function seededDb(seedValue = 42): Promise<Database> {
  const client = new Database(":memory:");
  client.exec(DDL);
  await seed({ dbCredentials: { db: drizzle(client) }, seed: seedValue });
  return client;
}
```

The same shape works with `better-sqlite3` + `drizzle-orm/better-sqlite3`, or with
PGlite for an in-process Postgres. Under Bun, prefer `bun:sqlite` +
`drizzle-orm/bun-sqlite` (the `better-sqlite3` prebuilt native addon does not match
Bun's ABI).

## What to assert

- **Counts** — `seed()` returns a `SeedReport` with `inserted[]`, `total`, `seed`,
  `durationMs`; or query the DB directly.
- **Keyed anchors resolve** — a keyed row (`rows: { alice: {...} }`) referenced via
  `ref("user", "alice")` resolves to a real, queryable id.
- **Determinism** — the same `seed` value produces byte-identical rows across runs;
  a different `seed` produces different data. This is the core guarantee to test.

```ts
import { expect, test } from "bun:test";
import { seededDb } from "./helper";

test("same seed → identical data", async () => {
  const a = await seededDb(7);
  const b = await seededDb(7);
  expect(a.query("SELECT * FROM users ORDER BY id").all())
    .toEqual(b.query("SELECT * FROM users ORDER BY id").all());
});
```

## SeedOptions

```ts
seed({
  cwd,            // project root (default process.cwd())
  configPath,     // path to drizzle-saat.config.ts
  scenario,       // run scenario-tagged seeds too
  seed,           // RNG seed
  dryRun,         // resolve + validate without writing
  dbCredentials,  // { db } (prebuilt Drizzle) or { client }
});
```

## Determinism gotcha

Any `faker.date.*` in a fixture must use a fixed `refDate`, or the same seed yields
different timestamps and determinism tests flake. See the `write-saat-fixtures`
skill.
