<div align="center">

# saat

**TypeScript-native, type-safe database seeding for [Drizzle ORM](https://orm.drizzle.team).**
Write fixtures as easy as YAML — fully type-safe, deterministic, and fast.

[![CI](https://github.com/fabianjocks/saat/actions/workflows/ci.yml/badge.svg)](https://github.com/fabianjocks/saat/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/saat.svg)](https://www.npmjs.com/package/saat)
[![license](https://img.shields.io/npm/l/saat.svg)](./LICENSE)

</div>

---

Seeding a database with Drizzle usually means hand-rolled scripts: manually
ordering inserts to satisfy foreign keys, juggling returned ids to wire up
relationships, and looping to generate bulk fake data.

`saat` brings back the ergonomics of structured fixtures — named references and
helpers — native to TypeScript and Drizzle, with full type inference from your
schema. Authoring feels as easy as writing YAML, with the safety and
autocomplete of TypeScript.

> **saat is a dev/test tool.** It generates throwaway, high-volume, fake data
> for local development and automated tests, and does wipe-and-reseed. It is
> **not** for production. Production reference data is migration-shaped and
> belongs in your migration pipeline.

## Features

- 🟦 **Type-safe fixtures** — `defineFixture` infers row shapes from your Drizzle tables.
- 🔗 **References across files** — `ref('user').random()`, `ref('user', 'john')`, `ref('user').where({ … })`, all resolving to real ids.
- 🧬 **Codegen for cross-file types** — namespaces are globally typed and autocompleted.
- 🎲 **Deterministic** — seedable RNG; the same seed always produces the same dataset.
- 🧱 **Dependency-aware** — builds a graph from refs & foreign keys, topologically orders inserts, fails fast on cycles.
- 🛡️ **All-or-nothing** — the entire run executes in a single transaction.
- 🐘🐬🪶 **All three dialects** — PostgreSQL, MySQL, SQLite.
- ⚡ **Fast at scale** — batched multi-row inserts tuned per dialect.
- 🪄 **Built-in Faker** — generating large amounts of data is a one-liner.

## Install

```bash
bun add -D saat        # or: npm i -D saat / pnpm add -D saat
```

`saat` reuses your existing Drizzle setup. It reads your **`drizzle.config.ts`**
for the dialect, connection, and schema path — no duplication.

## Quick start

**1. Add `saat`-specific config** (optional) in `saat.config.ts`:

```ts
import { defineConfig } from 'saat'

export default defineConfig({
  fixtures: 'saat',   // fixture directory (default)
  seed: 1,            // default RNG seed
})
```

**2. Write fixtures** in `saat/`:

```ts
// saat/users.ts
import { defineFixture, faker, ref } from 'saat'
import { users, posts } from '../db/schema'

export default defineFixture({
  seeds: [
    {
      table: users,
      namespace: 'user',
      count: 50,                         // 50 bulk fake users…
      data: () => ({
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        email: faker.internet.email(),
      }),
      rows: {                            // …plus exact keyed rows, same namespace
        john: { firstName: 'John', email: 'john@x.com' },
        jane: { firstName: 'Jane', email: 'jane@x.com' },
      },
    },
    {
      table: posts,
      namespace: 'post',
      count: 200,
      data: () => ({
        title: faker.lorem.sentence(),
        body: faker.lorem.paragraphs(),
        authorId: ref('user').random(),  // random seeded user's id
      }),
    },
  ],
})
```

> **Tip:** for full per-table autocompletion on a seed's `data()`/`rows`, wrap it
> in `defineSeed({ table, … })` — it infers the row shape from the Drizzle table.

**3. Seed:**

```bash
bunx saat            # reset → resolve refs → topo-order → insert, in one transaction
```

Add it to `package.json`:

```json
{ "scripts": { "seed": "saat" } }
```

## Examples

Six runnable example projects, small to large, live in [`examples/`](./examples) —
each one `bun install && bun run seed` away, with a `bun run verify` that proves
the output is byte-identical for a fixed seed:

- [basic-blog](./examples/basic-blog) — the smallest useful setup (users + posts)
- [ecommerce-store](./examples/ecommerce-store) — FK chains, `ref().where()`, multi-file fixtures
- [saas-multitenant](./examples/saas-multitenant) — tenant scoping + a composite-PK join table
- [social-network](./examples/social-network) — 8 namespaces, nested refs in JSON, threaded comments
- [analytics-events](./examples/analytics-events) — `--scenario` datasets and high volume
- [testing-with-saat](./examples/testing-with-saat) — deterministic fixtures in a test suite

## References

Three styles, all resolving to the referenced row's id. Namespaces are global
across all fixture files:

```ts
ref('user').random()                     // any random row in the namespace
ref('user', 'john')                      // direct lookup by explicit key
ref('user').where({ firstName: 'John' }) // query lookup by field(s)
```

## Scenarios

A **scenario** is a named dataset you select at run time (e.g. a `checkout-flow`
slice vs. the full dataset) — about *which dev/test situation* you want, not
environments. Tag a fixture or seed with `scenario`, then:

```bash
saat --scenario checkout-flow
```

Seeds without a scenario are always part of the run; `--scenario X` adds the
seeds tagged `X` on top.

## CLI

| Command / flag             | Behavior                                                                 |
| -------------------------- | ------------------------------------------------------------------------ |
| `saat`                     | Run the seeder (regenerates types first), in one transaction.            |
| `saat --scenario <name>`   | Run the default seeds plus the named scenario.                           |
| `saat --seed <n>`          | Override the RNG seed for this run.                                       |
| `saat --dry-run`           | Resolve and order everything; report what *would* be inserted. No writes.|
| `saat --watch`             | Regenerate types as fixtures change.                                     |
| `saat generate`            | (Re)generate the namespace type definitions.                             |

## Type safety

saat is built to make wrong fixtures a **compile error**, not a runtime surprise:

- **Row shapes are inferred from your Drizzle table.** Inside `defineFixture`,
  each seed's `data()` is checked against its `table` — a wrong column type or a
  missing `NOT NULL` column (without a default) won't compile:
  ```ts
  data: () => ({ title: 'Hi', authorId: 7 })   // ✓
  data: () => ({ title: 42 })                  // ✗ title must be string; body/authorId required
  ```
- **References are value-aware.** After codegen, `ref('user')` is typed as the id
  it resolves to (its target's primary-key type), so it only fits a
  column of a matching type:
  ```ts
  authorId: ref('user').random()   // ✓ resolves to users.id (number)
  title:    ref('user').random()   // ✗ a number ref can't fill a string column
  ```
- **Namespaces, keyed-row keys, and `.where()` predicates are checked across
  files** via codegen:
  ```ts
  ref('user', 'alice')   // ✓ 'alice' is a keyed row in the user namespace
  ref('user', 'nobody')  // ✗ 'nobody' is not a key of 'user'
  ```

### Codegen

For cross-file ref types, `saat` scans your fixtures and generates
`.saat/types.d.ts` — mapping each namespace to its row type, primary-key type,
and the set of keyed-row keys. It runs automatically before every seed run (and
`saat generate --watch` during development), so types are never stale.

The generated file augments the `saat` module, so TypeScript only picks it up if
it is part of your project's compilation. Add the **file** to your `tsconfig.json`
`include`:

```jsonc
{ "include": ["src", ".saat/types.d.ts"] }
```

> ⚠️ List the file explicitly, not the directory. TypeScript's `include` globs
> skip dot-directories, so `".saat"` on its own matches nothing and the types are
> silently ignored. (Or set `typesOut` to a non-dot path already covered by
> `include`, e.g. `"src/saat-env.d.ts"`.)

> One inference limitation: a *missing* required column in keyed `rows` (as
> opposed to `data()`) isn't caught — TypeScript doesn't check object literals in
> a `Record` value position for completeness. Wrong types in `rows` still are.

## How it works

1. Regenerate namespace types.
2. Load fixtures and your Drizzle schema.
3. Generate rows (bulk `data()` and keyed `rows`), seeding Faker from the run seed.
4. Build a dependency graph from references and foreign keys; detect cycles (fail fast).
5. Topologically order the seeds.
6. In a single transaction: truncate the target tables (dialect-aware), then
   insert in order — resolving each reference to a freshly-inserted id.

## Caveats

- **saat only manages tables that have fixtures.** It truncates and seeds the
  tables backing your namespaces; tables you don't write fixtures for are left
  untouched (and won't be wiped between runs).
- **Postgres truncation uses `TRUNCATE … RESTART IDENTITY CASCADE`.** `CASCADE`
  can also remove rows from *other* tables that hold foreign keys into the
  seeded tables, even if those tables aren't part of your fixtures. This is
  expected for a wipe-and-reseed dev/test tool — just don't point `saat` at a
  database whose other tables you care about (and never at production).
- **References resolve to a single primary-key value.** A table with a
  composite primary key can be seeded, but cannot be the *target* of a `ref()`.

## Contributing

Contributions welcome! See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © Fabian Jocks
