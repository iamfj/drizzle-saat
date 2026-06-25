---
name: setup-drizzle-saat
description: Add drizzle-saat (type-safe, deterministic seeding for Drizzle ORM) to an existing Drizzle project. Use when a repo already has Drizzle ORM and needs database seeding/fixtures set up, or when installing, configuring, or wiring up drizzle-saat from scratch.
---

# Set up drizzle-saat in a Drizzle project

`drizzle-saat` is a dev/test seeding tool for Drizzle ORM. It reads your existing
`drizzle.config.ts` for dialect, schema, and DB credentials — there is **no
separate database config**. It does wipe-and-reseed inside one transaction. Not
for production.

Prerequisite: the repo already has `drizzle-orm`, a `drizzle.config.ts` with
`dialect` + `schema`, and Drizzle schema files.

## Zero-to-seeded checklist

1. **Install** (dev dependency):
   ```bash
   npm i -D drizzle-saat            # or bun add -D / pnpm add -D
   ```
   Add `drizzle-orm` too if it is somehow missing. `faker` is re-exported by
   drizzle-saat — do **not** install `@faker-js/faker` separately.

2. **Install the dialect driver** matching `drizzle.config.ts` `dialect`:
   | dialect | driver |
   |---|---|
   | `sqlite` (also turso/libsql) | `better-sqlite3` |
   | `postgresql` | `pg` (or `@electric-sql/pglite`) |
   | `mysql` | `mysql2` |

   Skip this only if you will seed exclusively via the programmatic
   `seed({ dbCredentials: { db } })` API (see the `test-with-drizzle-saat` skill) —
   that path loads no driver.

3. **Ensure `dbCredentials`** is set in `drizzle.config.ts`, e.g.
   `{ url: "file:./dev.db" }`, `{ url: "postgres://..." }`, or `{ url: "mysql://..." }`.

4. **(Optional) add `drizzle-saat.config.ts`.** Only needed to change a default:
   ```ts
   import { defineConfig } from "drizzle-saat";

   export default defineConfig({
     fixtures: "drizzle-saat",            // fixture dir (default "drizzle-saat")
     seed: 42,                            // default RNG seed (default 1)
     drizzleConfig: "./drizzle.config.ts",// only if non-standard location
     typesOut: ".drizzle-saat/types.d.ts",// generated types path (default)
     // chunkSize: 500,                   // optional insert batch override
   });
   ```
   All fields are optional. With defaults, only `drizzle.config.ts` + fixtures are
   required. Config may also live under a `"drizzle-saat"` key in `package.json`
   (the file overlays it per field).

5. **Create the fixtures dir** (default `drizzle-saat/`) and add at least one
   fixture file. See the `write-saat-fixtures` skill. Minimal example:
   ```ts
   import { defineFixture, faker, ref } from "drizzle-saat";
   import { users, posts } from "../db/schema";

   export default defineFixture({
     seeds: [
       { table: users, namespace: "user", count: 10,
         data: () => ({ name: faker.person.fullName(), email: faker.internet.email() }) },
       { table: posts, namespace: "post", count: 30,
         data: () => ({ title: faker.lorem.sentence(), authorId: ref("user").random() }) },
     ],
   });
   ```

6. **Generate types**: `npx drizzle-saat generate` → writes `.drizzle-saat/types.d.ts`.

7. **Wire tsconfig — CRITICAL GOTCHA.** TypeScript's `include` globs **silently
   skip dot-directories**, so `"include": [".drizzle-saat"]` matches *nothing* and
   `ref()` falls back to accepting any string (type checking passes but is doing
   nothing). List the generated file **explicitly**:
   ```jsonc
   { "include": ["src", "drizzle-saat", ".drizzle-saat/types.d.ts"] }
   ```
   Alternatively set `typesOut` to a non-dot path already covered by `include`
   (e.g. `"src/drizzle-saat-env.d.ts"`).

8. **Add package.json scripts:**
   ```jsonc
   {
     "scripts": {
       "seed": "drizzle-saat",
       "gen": "drizzle-saat generate",
       "typecheck": "drizzle-saat generate && tsc --noEmit",
       "postinstall": "drizzle-saat generate"
     }
   }
   ```
   `generate` must run **before** `tsc` — the `.d.ts` must exist for type checking
   to be meaningful.

9. **Seed:** run `npx drizzle-saat`. It regenerates types, then wipes and reseeds
   the fixtured tables in one transaction. Use `--dry-run` to preview,
   `--seed <n>` / `--scenario <name>` as needed.

## CLI reference

There is **no `init` command**. Two commands only:

- `drizzle-saat` (default) — regenerate types, then wipe + reseed.
  Flags: `--scenario <name>`, `--seed <n>`, `--dry-run`, `--watch` (regenerates
  types only, does **not** seed), `--config <path>`.
- `drizzle-saat generate` — (re)generate `.drizzle-saat/types.d.ts` only.
  Flags: `--watch`, `--config <path>`.

## Decision points that vary per project

- **Dialect/driver** — read from `drizzle.config.ts`; Postgres has two driver
  choices (`pg` vs `pglite`).
- **`dbCredentials` shape** — url string vs host/user object.
- **Fixtures dir name** — default `drizzle-saat/`, override via `fixtures`.
- **`typesOut` location** — dot-dir default needs the explicit tsconfig include;
  a non-dot path sidesteps it.
- **Default `seed`** — default `1`; pick a stable project seed, override per run
  with `--seed`.
