# drizzle-saat API reference

All exports come from `"drizzle-saat"`.

## defineFixture / defineSeed

```ts
function defineFixture<const S extends readonly SeedDef[]>(def: {
  scenario?: string;
  setup?: () => unknown;   // async hook; resolved value → each data()'s ctx.setup
  seeds: S;                // validated against your schema
}): { scenario?: string; setup?: () => unknown; seeds: S };

function defineSeed<T extends Table>(seed: SeedDef<T>): SeedDef<T>;

interface SeedDef<T extends Table = Table> {
  table: T;                                    // the Drizzle table
  namespace: string;                           // globally unique; used by ref()
  scenario?: string;                           // overrides fixture-level scenario
  count?: number;                              // # of bulk rows
  data?: (ctx: SeedRowContext) => RowInput<T>; // factory; required if count set
  rows?: Record<string, RowInput<T>>;          // exact keyed rows; key enables ref(ns, key)
}

interface SeedRowContext {
  index: number;   // zero-based row index within count
  setup: unknown;  // fixture setup() result (undefined if none); annotate/cast it
}

type FieldInput<V> = V | Ref<V>;
type RowInput<T extends Table> = {             // mapped over InferInsertModel<T>
  [K in keyof InferInsertModel<T>]: FieldInput<InferInsertModel<T>[K]>;
};
```

A seed may provide `count`+`data`, `rows`, or both (they share the namespace; refs
work across both). At least one is required. `count: 0` / empty `rows` is a valid
no-op that still truncates the table.

**Required vs optional fields** follow Drizzle: a NOT NULL column without a default
is required; defaulted / nullable / serial-id columns are optional. App-level
defaults (`$default`, `$defaultFn`, `$onUpdate`) are applied by Drizzle on insert,
so those columns are optional — don't restate `createdAt`/`updatedAt`.

**Async setup.** Fixtures are ES modules, so **top-level `await`** works (best for
a fully-typed shared value). Or use the per-fixture `setup()` hook for async work
(hashing, lookups); its result reaches each `data()` as `ctx.setup`. Both run
inside the deterministic clock window (`now()` works); `faker` is active only
during `data()`/row generation.

## now() — deterministic time

```ts
function now(offsetMs?: number): Date;          // exported from "drizzle-saat"
```

Returns a fixed base time for the whole run (config `now`; default 2024-01-01) so
timestamps are reproducible. Pass an offset for ordering: `now(index * 1000)`.
Use it instead of `() => new Date()`. Falls back to the wall clock outside a run.

## ref

```ts
function ref<K>(namespace: K): RefBuilder<K>;           // builder form
function ref<K>(namespace: K, key: KeyOf<K>): Ref<...>; // direct keyed lookup

interface RefBuilder<K> {
  random(): Ref<...>;                          // a random seeded row's id
  where(predicate: Partial<RowOf<K>>): Ref<...>; // FIRST row matching field(s)
}
```

- Resolves to the target namespace's **single primary-key** value.
- `RefKind = "random" | "key" | "where"`.
- Resolves recursively, including inside plain objects and arrays (JSON columns);
  **not** inside `Date` or class instances.
- `.where()` uses logical equality (`Object.is`, `Date.getTime()`, structural JSON
  compare) and returns only the **first** match.
- `isRef(x)` / `REF_MARKER` are exported for advanced use.

## defineConfig

```ts
interface SaatUserConfig {
  fixtures?: string;        // fixture dir, default "drizzle-saat"
  seed?: number;            // default RNG seed, default 1
  drizzleConfig?: string;   // path to drizzle.config.ts if non-standard
  typesOut?: string;        // generated types path, default ".drizzle-saat/types.d.ts"
  chunkSize?: number;       // override per-dialect insert batch size
  truncate?: "cascade" | "restrict" | false; // wipe strategy, default "cascade"
  locale?: LocaleDefinition | LocaleDefinition[]; // faker locale(s), default [en, base]
  now?: Date | string | number; // base time for now(), default 2024-01-01
}
```

Dialect, schema paths, and `dbCredentials` all come from `drizzle.config.ts` —
there is no DB config on the saat side. Dialect is normalized: `postgres` →
`postgresql`, `turso`/`libsql` → `sqlite`.

## Programmatic seed

```ts
function seed(opts?: SeedOptions): Promise<SeedReport>;

interface SeedOptions {
  cwd?: string;
  configPath?: string;
  scenario?: string;
  seed?: number;
  truncate?: "cascade" | "restrict" | false; // override the configured wipe strategy
  dryRun?: boolean;
  dbCredentials?: Record<string, any>; // { db } (prebuilt Drizzle) or { client }
}
interface SeedReport {
  inserted: { namespace: string; table: string; count: number }[];
  total: number; seed: number; dryRun: boolean;
  truncated: string[];  // tables wiped (or, in dry-run, that would be)
  durationMs: number;
}
```

Passing `dbCredentials: { db: <drizzleInstance> }` bypasses driver loading
entirely — the in-process testing pattern (see the `test-with-drizzle-saat` skill).

## Errors

`SaatError` (base), `CycleError` (dependency cycle, with the concrete path),
`MissingReferenceError`, `InsertError` (driver error during insert, tagged with
the namespace, table, and keyed rows in the failing batch).

## Codegen mechanism

`drizzle-saat generate` writes `<typesOut>` — a `declare module "drizzle-saat"`
augmentation filling three interfaces:
- `SaatNamespaces` — namespace → `InferSelectModel` (powers `.where()` typing)
- `SaatRefValues` — namespace → its single PK value type (only for single-PK namespaces)
- `SaatNamespaceKeys` — namespace → union of its keyed-row keys

Before codegen, `ref()` accepts any string and refs are `any`. The output file is
auto-generated ("Do not edit") and sorted for reproducibility.

## Engine behavior

- **Plan**: flatten + scenario-filter → enforce unique namespaces → generate rows
  (faker seeded) → build edges from refs **and** FKs → toposort (Kahn's, stable
  for ties, throws `CycleError` on a cycle).
- **Seed**: one all-or-nothing transaction; truncate dependents-first, insert in
  dependency order, chunked, recording returned PKs so dependents resolve.
- **Resolve**: all rows in a namespace resolve before any insert (hence no
  same-namespace self-reference).
- `--dry-run` simulates with synthetic ids and consumes the RNG identically, so it
  surfaces broken refs and cycles without a DB.

## Dialect notes

- **Postgres** (`pg`/PGlite): `TRUNCATE … RESTART IDENTITY CASCADE`; ids via
  `.returning()`. Default chunk 1000.
- **SQLite** (`better-sqlite3`, or `bun:sqlite`/libsql via `{ db }`): `DELETE` +
  `defer_foreign_keys=ON`, resets `sqlite_sequence`. Chunk 500.
- **MySQL** (`mysql2`): `DELETE` (not `TRUNCATE`, which would force a commit and
  break the transaction) under `SET FOREIGN_KEY_CHECKS=0`; DELETE does **not** reset
  AUTO_INCREMENT. A single seed must not mix client-supplied and auto-generated PKs
  in one batch — provide the PK for all rows or none.

## Gotchas table

| Mistake | Correct pattern |
|---|---|
| `faker.date.recent({ days: 30 })` without refDate | Always add `refDate: "2026-06-01T00:00:00.000Z"` |
| Reusing a `namespace` across two seeds | Namespaces are global + unique; use distinct names even on one table |
| `ref()` to a composite-/no-PK table | Only single-PK tables can be ref targets |
| Referencing another row in the same namespace | Split into two namespaces on the same table |
| `count` without `data()` | Provide `data: (ctx) => ({...})`, or use keyed `rows` |
| Drizzle `.references()` self-FK + two namespaces on the table | Make the self-ref column soft (no `.references()`); order via `ref()` |
| `"include": [".drizzle-saat"]` in tsconfig | List the file explicitly: `".drizzle-saat/types.d.ts"` |
| Expecting `ref("user","x")` autocomplete before codegen | Run `drizzle-saat generate` first |
| Expecting `.where()` to return all matches | It returns the first match only |
| `ref()` inside a `Date`/class instance | Refs resolve only at top level or inside plain objects/arrays |
| Unique columns colliding in bulk | Disambiguate with `({ index }) =>` |
| Expecting `--watch` to seed | `--watch` only regenerates types |
| Hand-editing `.drizzle-saat/types.d.ts` | Auto-generated; run `drizzle-saat generate` |
