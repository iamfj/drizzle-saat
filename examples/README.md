# drizzle-saat examples

Six runnable projects, small to large, each showing how **complex, reproducible
data comes from very little fixture code**. Every example uses Bun's built-in
`bun:sqlite`, so they run with zero native setup:

```bash
cd examples/<name>
bun install
bun run seed      # seed and print a report
bun run verify    # seed twice with the same seed → assert byte-identical data
```

| # | Example | Size | Fixture LOC | Rows | Highlights |
|---|---------|------|------------|------|-----------|
| 1 | [basic-blog](./basic-blog) | small | ~25 | ~125 | `count`+`data`, keyed `rows`, `ref().random()` |
| 2 | [ecommerce-store](./ecommerce-store) | mid | ~70 | ~350 | FK chains + topo-order, `ref().where()`, multi-file fixtures |
| 3 | [saas-multitenant](./saas-multitenant) | mid-large | ~80 | ~125 | tenant scoping, **composite-PK** join table |
| 4 | [social-network](./social-network) | large | ~90 | ~1100 | 8 namespaces, **nested refs in JSON**, threaded comments |
| 5 | [analytics-events](./analytics-events) | mid-large | ~60 | 50–5050 | **`--scenario`** datasets, high volume |
| 6 | [testing-with-drizzle-saat](./testing-with-drizzle-saat) | practical | ~25 | per-test | deterministic fixtures in a `bun test` suite |

## The pitch, in one screen

```ts
// social-network/drizzle-saat/content.fixture.ts — 120 posts, each with a nested ref in JSON
{
  table: posts, namespace: "post", count: 120,
  data: () => ({
    authorId: ref("user").random(),
    body: faker.lorem.paragraph(),
    metadata: { lang: "en", pinnedBy: ref("user", "ada") }, // ← resolved to an id
    createdAt: faker.date.recent({ days: 30, refDate: "2026-06-01" }).toISOString(),
  }),
}
```

That's the whole posts dataset. drizzle-saat resolves the refs (top-level **and** nested),
orders inserts by dependency, and produces the exact same rows for a given seed.

## Type checking

Every example is wired for full fixture type-safety. After `bun install` (which
generates `.drizzle-saat/types.d.ts` via a `postinstall` hook), run:

```bash
bun run typecheck   # regenerates types, then `tsc --noEmit`
```

This catches, at compile time:

```ts
ref("dwad")                       // ✗ "dwad" is not a known namespace
priority: "URGENT"                // ✗ not in the column's enum
title: ref("user").random()       // ✗ a number ref can't fill a string column
data: () => ({ title: "t" })      // ✗ missing required NOT NULL columns
```

> Each example's `tsconfig.json` lists `".drizzle-saat/types.d.ts"` **explicitly** —
> TypeScript's `include` globs skip dot-directories, so `".drizzle-saat"` alone is
> silently ignored and namespace checking won't work. (See the README's
> "Type safety" section.)

## Reproducibility note

A fixed `seed` makes runs byte-identical — **except** for fakers anchored to the
clock. Always pass a fixed `refDate` to `faker.date.*` helpers, or those columns
will differ every run. See [ecommerce-store](./ecommerce-store) for the details.

## Using a real database

Each example uses `bun:sqlite` purely so it runs anywhere. In your own project
you don't write a runner — point `drizzle.config.ts` at your database and use the
CLI (`npx drizzle-saat`, `npx drizzle-saat --scenario load`, `npx drizzle-saat --seed 7`). The fixtures
are identical; switch `dialect` to `postgresql` or `mysql` and nothing else changes.
