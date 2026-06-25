# basic-blog (small)

The smallest useful saat setup: **two tables, one foreign key**.

`saat/blog.ts` — ~25 lines — produces **26 users** (25 random + one fixed `admin`
you can reference by key) and **100 posts**, each attributed to a random user
with a valid foreign key. Same seed → same data, every time.

```ts
// saat/blog.ts (excerpt)
{
  table: posts, namespace: "post", count: 100,
  data: () => ({
    title: faker.lorem.sentence(),
    authorId: ref("user").random(),   // ← valid FK to a seeded user
    // …
  }),
}
```

## Run it

```bash
bun install
bun run seed       # seed dev.db, print a report
bun run verify     # seed twice with seed 42, assert byte-identical data
```

Expected:

```
✓ seeded 126 rows (seed 42) in ~30ms
  user → users: 26
  post → posts: 100
✓ reproducible: two runs with seed 42 produced byte-identical data
```

## How it maps to a real project

`seed.ts` here uses Bun's built-in `bun:sqlite` so the example runs with zero
native setup. In your own project you don't write a runner at all — you point
`drizzle.config.ts` at your real database and run the CLI:

```bash
npx saat            # reset → resolve refs → topo-order → insert, one transaction
npx saat --seed 7   # same fixtures, a different reproducible dataset
```

The fixtures in `saat/` are identical in both cases. Swap `dialect: "sqlite"`
for `"postgresql"` or `"mysql"` in `drizzle.config.ts` and nothing else changes.

## Concepts shown

- `count` + `data()` for bulk fake rows; `rows` for exact keyed records — in one seed.
- `ref("user").random()` — a foreign key to a random seeded row.
- Deterministic output from a single `seed`.
