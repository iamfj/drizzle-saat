---
name: write-saat-fixtures
description: Write correct drizzle-saat fixtures — defineFixture, ref(), keyed rows, namespaces, scenarios, and deterministic faker usage for Drizzle ORM seeding. Use when authoring or editing saat fixture files (in the drizzle-saat/ dir), wiring up relationships between seeded tables, or debugging seeding errors like CycleError or non-reproducible data.
---

# Write drizzle-saat fixtures

A fixture is a default-exported `defineFixture({ seeds: [...] })` file living under
the fixtures dir (default `drizzle-saat/`). Each seed fills one table; relationships
are declared with `ref()`. The engine builds a dependency graph from refs + foreign
keys, topologically orders inserts, resolves every ref to a freshly-inserted id, and
runs deterministically in one transaction.

Everything imports from `"drizzle-saat"`. Import Drizzle tables from your schema.

## Core shape

```ts
import { defineFixture, faker, ref } from "drizzle-saat";
import { users, posts } from "../db/schema";

export default defineFixture({
  seeds: [
    {
      table: users,
      namespace: "user",          // GLOBALLY unique name, used by ref()
      count: 25,                  // # of bulk rows
      data: () => ({              // factory, called once per row; REQUIRED if count set
        name: faker.person.fullName(),
        email: faker.internet.email(),
      }),
      rows: {                     // optional exact keyed rows; key enables ref("user", key)
        admin: { name: "Ada Admin", email: "ada@example.com" },
      },
    },
    {
      table: posts,
      namespace: "post",
      count: 100,
      data: () => ({
        title: faker.lorem.sentence(),
        authorId: ref("user").random(),  // resolved to a real users.id
      }),
    },
  ],
});
```

A seed needs `count`+`data`, or `rows`, or both. `count` without `data()` throws.

## The three ref() styles (target must have a single primary key)

- `ref("user").random()` — a random seeded row's id (deterministic under the seed)
- `ref("user", "admin")` — a specific keyed row (the key must exist in that namespace's `rows`)
- `ref("user").where({ country: "US" })` — the **first** row matching the field(s)

Refs resolve recursively, including nested inside plain objects and arrays (e.g.
JSON columns) — but **not** inside `Date` or class instances.

## Critical rules (most common mistakes)

1. **Always pass a fixed `refDate` to any `faker.date.*` call.** They default their
   anchor to `Date.now()`, which breaks reproducibility:
   ```ts
   placedAt: faker.date.recent({ days: 90, refDate: "2026-06-01T00:00:00.000Z" }).toISOString()
   ```
2. **Namespaces are global and unique.** Two seeds on the same table need distinct
   namespaces (e.g. `comment` and `reply` both on `comments`).
3. **A row cannot reference another row in its own namespace** (all rows in a
   namespace resolve before any insert). Split into two namespaces on the same table.
4. **ref() targets need exactly one PK column.** No-PK and composite-PK tables can
   *reference* others but cannot *be* a ref target. Seed composite-PK join tables as
   keyed `rows`.
5. **Declared self-FK + two namespaces on one table → false `CycleError`.** Make
   the self-reference column *soft* (no Drizzle `.references()`); the DB DDL still
   enforces the FK, and you order rows via `ref()`.
6. **Run `drizzle-saat generate` before relying on type checking** — `ref()` keys
   and namespaces are only validated after codegen (see `setup-drizzle-saat`).
7. **Disambiguate unique columns in bulk** with the row index:
   ```ts
   data: ({ index }) => ({ handle: `${faker.internet.username()}_${index}` })
   ```

## Cross-file namespaces

Namespaces are global, so one fixture file can `ref()` a namespace defined in
another file — no import of the other fixture needed. Just reference the name.

## Scenarios

A seed with no `scenario` always runs. A seed (or whole fixture) with
`scenario: "load"` runs only when invoked with `--scenario load`, *in addition to*
the base scenario-less seeds.

## Going deeper

- `references/api.md` — full `defineFixture` / `defineSeed` / `ref` signatures,
  config shape, the programmatic `seed()` API, and the complete gotchas table.
- `references/examples.md` — real, distilled fixtures: cross-file relationships,
  JSON-nested refs, threaded self-references, composite-PK join tables, scenarios.
