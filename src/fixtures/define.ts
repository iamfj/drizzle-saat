import type { InferInsertModel, Table } from "drizzle-orm";
import type { Ref } from "../refs/ref.js";

/**
 * A field value in a fixture row may be a concrete value of the column's type,
 * or a {@link Ref} that resolves to another row's id of the same type.
 */
export type FieldInput<V> = V | Ref<V>;

/**
 * Insert-shaped row where any field may also be a reference. This is a
 * homomorphic mapped type, so it preserves Drizzle's optionality: columns that
 * are `NOT NULL` without a default stay required; defaulted/nullable columns
 * (and generated ids) stay optional.
 */
export type RowInput<T extends Table> = {
  [K in keyof InferInsertModel<T>]: FieldInput<InferInsertModel<T>[K]>;
};

/**
 * A seed binds a Drizzle table to a namespace and produces rows, either as
 * bulk fake data (`count` + `data()`) or exact keyed records (`rows`). Both
 * styles share the namespace, so references work regardless of how rows were
 * produced.
 *
 * For shared async setup (e.g. hashing a password), a fixture's `setup()` hook
 * resolves a value passed to each `data()` as `ctx.setup` (typed `unknown` —
 * annotate it, or prefer top-level `await` in the module for full type safety).
 */
export interface SeedDef<T extends Table = Table> {
  /** The Drizzle table to insert into. */
  table: T;
  /** Name used to reference these rows elsewhere. Globally unique. */
  namespace: string;
  /** Optional scenario tag (overrides the fixture-level scenario). */
  scenario?: string;
  /** Number of bulk rows to generate via `data()`. */
  count?: number;
  /** Row factory, called once per row. Required when `count` is set. */
  data?: (ctx: SeedRowContext) => RowInput<T>;
  /** Exact, keyed rows. The key enables `ref(namespace, key)` lookups. */
  rows?: Record<string, RowInput<T>>;
}

/** Context passed to each `data()` invocation. */
export interface SeedRowContext {
  /** Zero-based index of the row within this seed's `count`. */
  index: number;
  /**
   * Value resolved by the fixture's `setup()` hook (`undefined` if there is
   * none). Typed `unknown`; cast it, or annotate the `data()` parameter.
   */
  setup: unknown;
}

export interface FixtureDef {
  /** Default scenario for all seeds in this fixture. */
  scenario?: string;
  /**
   * Optional async hook run once before this fixture's rows are generated. Its
   * resolved value is passed to every `data()` as `ctx.setup` — the place for
   * async setup like hashing a shared password or a lookup. Runs inside the
   * deterministic clock window, so `now()` works; `faker` is not yet active.
   * For a fully-typed shared value, prefer top-level `await` in the module.
   */
  setup?: () => unknown;
  seeds: SeedDef[];
}

/** Re-type each seed in a tuple as `SeedDef<its own table>` so its fields are
 *  checked against that specific table — the key to inline inference. */
type ValidatedSeeds<S extends readonly unknown[]> = {
  [I in keyof S]: S[I] extends { table: infer T extends Table } ? SeedDef<T> : SeedDef;
};

/**
 * Declare a fixture. Inference flows from each seed's `table` into its
 * `data()`/`rows` shape — so a wrong column type, a missing required column, or
 * an unknown column is a compile error — while still allowing `ref(...)`
 * placeholders in any field. An optional async `setup()` runs once before row
 * generation; its resolved value reaches each `data()` as `ctx.setup`.
 */
export function defineFixture<const S extends readonly SeedDef[]>(def: {
  scenario?: string;
  setup?: () => unknown;
  seeds: S & ValidatedSeeds<S>;
}): { scenario?: string; setup?: () => unknown; seeds: S } {
  return def;
}

/** Helper to declare a single strongly-typed seed (e.g. to extract and reuse it). */
export function defineSeed<T extends Table>(seed: SeedDef<T>): SeedDef<T> {
  return seed;
}
