<div align="center">

# drizzle-saat

**TypeScript-native, type-safe database seeding for [Drizzle ORM](https://orm.drizzle.team).**
Write fixtures as easy as YAML — fully type-safe, deterministic, and fast.

[![CI](https://github.com/iamfj/drizzle-saat/actions/workflows/ci.yml/badge.svg)](https://github.com/iamfj/drizzle-saat/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/drizzle-saat.svg)](https://www.npmjs.com/package/drizzle-saat)
[![license](https://img.shields.io/npm/l/drizzle-saat.svg)](./LICENSE)

</div>

---

Seeding a database with Drizzle usually means hand-rolled scripts: manually
ordering inserts to satisfy foreign keys, juggling returned ids to wire up
relationships, and looping to generate bulk fake data.

`drizzle-saat` brings back the ergonomics of structured fixtures — named references and
helpers — native to TypeScript and Drizzle, with full type inference from your
schema. Authoring feels as easy as writing YAML, with the safety and
autocomplete of TypeScript.

> **drizzle-saat is a dev/test tool.** It generates throwaway, high-volume, fake data
> for local development and automated tests, and does wipe-and-reseed. It is
> **not** for production. Production reference data is migration-shaped and
> belongs in your migration pipeline.

## Why this exists

I went looking for a way to seed a whole, realistic database with Drizzle and
expected it to be a solved problem — surely filling an interconnected schema is
no harder than describing it. It wasn't.

Drizzle ships [`drizzle-seed`](https://orm.drizzle.team/docs/seed-overview), an
official helper that fills tables with random values inferred from each column's
type. That's genuinely useful for "throw a thousand plausible rows at one
table." But a real database isn't one table — it's a graph: users own posts,
posts have comments, an order points at both a customer and its line items,
tenancy scopes everything. Once the graph shows up, the gaps do too:

- **You still order the inserts yourself** so foreign keys resolve in the right
  sequence — the tool doesn't work the dependencies out for you.
- **Foreign keys get *a* value, not *a relationship*.** There's no first-class
  way to say "point this at a specific user," "a random one," or "the one
  matched by this field" — you get random ids you can't reason about afterward.
- **Rows can't be named.** You can't tag "the admin user" or "the checkout
  order" and reference it from another fixture.
- **It doesn't scale across files.** As the schema grows and fixtures split up,
  you end up manually threading returned ids between them.
- **Exact and bulk data don't mix cleanly.** Pinning a handful of hand-written
  rows alongside thousands of generated ones is awkward.

So `drizzle-saat` makes the *relationships* the primary thing. You declare named
rows and `ref()`s; the tool builds a dependency graph, topologically orders the
inserts, resolves every reference to a freshly-inserted id, and runs the whole
thing deterministically inside a single transaction.

## The name

**_Saat_** (German, pronounced roughly "zaht") means **seed** — specifically the
seed-grain you sow and the act of sowing it, from the verb _säen_, "to sow."
Seeding a database is the same gesture: you scatter the starting data a fresh
schema needs before anything can grow on top of it. `drizzle-saat` is that idea,
made native to Drizzle — and the name keeps the link to `drizzle-seed` and the
wider Drizzle ecosystem explicit.

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
bun add -D drizzle-saat        # or: npm i -D drizzle-saat / pnpm add -D drizzle-saat
```

`drizzle-saat` reuses your existing Drizzle setup. It reads your **`drizzle.config.ts`**
for the dialect, connection, and schema path — no duplication.

## Quick start

**1. Add `drizzle-saat`-specific config** (optional) in `drizzle-saat.config.ts`:

```ts
import { defineConfig } from 'drizzle-saat'

export default defineConfig({
  fixtures: 'drizzle-saat',   // fixture directory (default)
  seed: 1,            // default RNG seed
})
```

**2. Write fixtures** in `drizzle-saat/`:

```ts
// drizzle-saat/users.ts
import { defineFixture, faker, ref } from 'drizzle-saat'
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
bunx drizzle-saat            # reset → resolve refs → topo-order → insert, in one transaction
```

Add it to `package.json`:

```json
{ "scripts": { "seed": "drizzle-saat" } }
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
- [testing-with-drizzle-saat](./examples/testing-with-drizzle-saat) — deterministic fixtures in a test suite

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
drizzle-saat --scenario checkout-flow
```

Seeds without a scenario are always part of the run; `--scenario X` adds the
seeds tagged `X` on top.

## Async fixtures

Fixtures are loaded as ES modules, so **top-level `await` is supported** — the
cleanest way to compute a shared value with full type safety:

```ts
import { hashPassword } from 'better-auth/crypto'
const passwordHash = await hashPassword('demo')   // top-level await
export default defineFixture({
  seeds: [{ table: users, namespace: 'user', rows: {
    alice: { email: 'alice@x.com', passwordHash },
  } }],
})
```

For per-fixture async setup, a `setup()` hook runs once before row generation;
its resolved value is passed to each `data()` as `ctx.setup` (typed `unknown` —
annotate or cast it):

```ts
export default defineFixture({
  setup: async () => ({ token: await mintToken() }),
  seeds: [{ table: sessions, namespace: 'session', count: 5,
    data: ({ setup }) => ({ token: (setup as { token: string }).token }) }],
})
```

## CLI

| Command / flag             | Behavior                                                                 |
| -------------------------- | ------------------------------------------------------------------------ |
| `drizzle-saat`                     | Run the seeder (regenerates types first), in one transaction.            |
| `drizzle-saat --scenario <name>`   | Run the default seeds plus the named scenario.                           |
| `drizzle-saat --seed <n>`          | Override the RNG seed for this run.                                       |
| `drizzle-saat --truncate <mode>`   | Wipe strategy: `cascade` (default), `restrict`, or `none` (append).      |
| `drizzle-saat --dry-run`           | Resolve and order everything; report what *would* be inserted. No writes.|
| `drizzle-saat --watch`             | Regenerate types as fixtures change.                                     |
| `drizzle-saat generate`            | (Re)generate the namespace type definitions.                             |

## Determinism

The same seed produces the same dataset. Two helpers keep that guarantee:

- **`faker`** is seeded from the run seed. Set the locale in `drizzle-saat.config.ts`:
  ```ts
  import { de } from '@faker-js/faker'
  export default defineConfig({ locale: de })   // or [de, en, base] for an explicit chain
  ```
- **`now()`** is a deterministic clock. App-level Drizzle defaults (`$defaultFn`,
  `$default`, `$onUpdate`) **are applied on insert** — and those columns are
  *optional* in fixtures, so you never need to restate `createdAt`/`updatedAt`.
  But a `() => new Date()` default uses wall-clock time and breaks
  reproducibility. Use `now()` instead for stable, ordered timestamps:
  ```ts
  import { defineFixture, now } from 'drizzle-saat'
  // Fixed for the whole run (config `now` sets the base; default 2024-01-01):
  createdAt: now(),
  updatedAt: now(i * 1000),   // pass an offset in ms for ordering
  ```

## Type safety

drizzle-saat is built to make wrong fixtures a **compile error**, not a runtime surprise:

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

For cross-file ref types, `drizzle-saat` scans your fixtures and generates
`.drizzle-saat/types.d.ts` — mapping each namespace to its row type, primary-key type,
and the set of keyed-row keys. It runs automatically before every seed run (and
`drizzle-saat generate --watch` during development), so types are never stale.

The generated file augments the `drizzle-saat` module, so TypeScript only picks it up if
it is part of your project's compilation. Add the **file** to your `tsconfig.json`
`include`:

```jsonc
{ "include": ["src", ".drizzle-saat/types.d.ts"] }
```

> ⚠️ List the file explicitly, not the directory. TypeScript's `include` globs
> skip dot-directories, so `".drizzle-saat"` on its own matches nothing and the types are
> silently ignored. (Or set `typesOut` to a non-dot path already covered by
> `include`, e.g. `"src/drizzle-saat-env.d.ts"`.)

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

- **drizzle-saat only manages tables that have fixtures.** It truncates and seeds the
  tables backing your namespaces; tables you don't write fixtures for are left
  untouched (and won't be wiped between runs).
- **Wipe strategy is configurable via `truncate`** (config or `--truncate`),
  defaulting to `"cascade"`:
  - `"cascade"` (default) — wipe fixtured tables *and* anything referencing
    them (Postgres `TRUNCATE … RESTART IDENTITY CASCADE`; FK-checks-off `DELETE`
    on MySQL/SQLite). Note the blast radius: `CASCADE` can also remove rows from
    *other* tables that hold foreign keys into the seeded tables, even ones you
    didn't fixture. Don't point drizzle-saat at a database whose other tables you
    care about (and never at production).
  - `"restrict"` — wipe only the fixtured tables (dependent-first) and error if
    an unfixtured table still references one. Safer for partial seeds.
  - `false` — don't wipe at all; append to existing data (test-factory mode).
  The seed report (and CLI output) lists exactly which tables were wiped.
- **References resolve to a single primary-key value.** A table with a
  composite primary key can be seeded, but cannot be the *target* of a `ref()`.

## AI agent skills

drizzle-saat ships [Agent Skills](https://agentskills.io) in [`skills/`](./skills)
so coding agents (Claude Code, Codex, Cursor, Copilot, Gemini CLI, and others)
can set drizzle-saat up and write correct fixtures:

- **setup-drizzle-saat** — add drizzle-saat to an existing Drizzle project
- **write-saat-fixtures** — author fixtures (`defineFixture`, `ref()`, namespaces, scenarios)
- **test-with-drizzle-saat** — seed an in-process DB in your test suite

Install them into your agent with the [`skills`](https://www.skills.sh) CLI:

```bash
npx skills add iamfj/drizzle-saat
```

## Contributing

Contributions welcome! See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © Fabian Jocks
